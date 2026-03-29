"""Ralph Loop - Isolated iteration with guardrails accumulation.

The Ralph Loop implements:
- Fresh process per iteration (no context accumulation)
- Guardrails retrieval from CRDT store
- Completion predicate verification
- Bounded iteration with hard limits

Named after Ralph the dog from The Muppets (always trying again).
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Callable, Coroutine, Protocol, TypeVar

import structlog
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from choreographer_mcp_server.infrastructure.sandbox import GitWorktreeSandbox
from choreographer_mcp_server.models import (
    AgentId,
    AgentProcess,
    AgentRole,
    StructuredFailure,
    FailureClass,
)
from choreographer_mcp_server.store.crdt_store import CRDTStore

logger = structlog.get_logger()

T = TypeVar("T")


class CompletionPredicate(Protocol[T]):
    """Protocol for completion predicates."""

    async def __call__(self, output: T) -> tuple[bool, str]:
        """Check if output satisfies completion criteria.

        Returns:
            Tuple of (is_complete, reason)
        """
        ...


class AgentGenerator(Protocol[T]):
    """Protocol for agent generation functions."""

    async def __call__(
        self,
        context: dict[str, Any],
        worktree_path: str,
    ) -> T:
        """Generate output in isolated worktree.

        Args:
            context: Minimal context (spec + guardrails)
            worktree_path: Path to isolated worktree

        Returns:
            Generated output
        """
        ...


@dataclass
class RalphResult:
    """Result of Ralph loop execution."""

    success: bool
    output: Any | None = None
    iterations: int = 0
    final_failure: StructuredFailure | None = None
    guardrails_added: int = 0
    total_tokens_consumed: int = 0


class RalphLoop:
    """Isolated iteration loop with guardrails accumulation.

    Key invariants:
    1. Fresh process per iteration (dies between iterations)
    2. Context constructed from store only (no accumulation)
    3. Bounded iterations (hard limit)
    4. Deterministic guardrails retrieval
    """

    def __init__(
        self,
        sandbox: GitWorktreeSandbox,
        store: CRDTStore,
        max_iterations: int = 5,
        context_budget_tokens: int = 50000,
        guardrails_top_k: int = 3,
    ) -> None:
        self.sandbox = sandbox
        self.store = store
        self.max_iterations = max_iterations
        self.context_budget_tokens = context_budget_tokens
        self.guardrails_top_k = guardrails_top_k

    async def execute(
        self,
        agent_id: AgentId,
        role: AgentRole,
        spec_uri: str,
        generate: AgentGenerator[T],
        predicate: CompletionPredicate[T],
        base_ref: str = "HEAD",
        metadata: dict[str, Any] | None = None,
    ) -> RalphResult:
        """Execute Ralph loop until completion or max iterations.

        Args:
            agent_id: Unique agent identifier
            role: Agent role in HAN
            spec_uri: URI to specification
            generate: Generation function
            predicate: Completion verification function
            base_ref: Git ref for worktree base
            metadata: Additional metadata for guardrails

        Returns:
            RalphResult with success status and details
        """
        iterations = 0
        guardrails_added = 0
        total_tokens = 0

        while iterations < self.max_iterations:
            iterations += 1
            logger.info(
                "ralph_iteration_start",
                agent_id=agent_id,
                iteration=iterations,
                max_iterations=self.max_iterations,
            )

            # Construct minimal context
            context = await self._build_context(spec_uri)

            # Spawn isolated agent
            try:
                async with self.sandbox.agent_context(
                    agent_id=AgentId(f"{agent_id}_iter{iterations}"),
                    role=role,
                    spec_uri=spec_uri,
                    context_budget_tokens=self.context_budget_tokens,
                    base_ref=base_ref,
                ) as agent_process:
                    # Generate output in isolated worktree
                    output = await generate(context, agent_process.worktree_path)

                    # Verify completion
                    is_complete, reason = await predicate(output)

                    if is_complete:
                        logger.info(
                            "ralph_complete",
                            agent_id=agent_id,
                            iterations=iterations,
                            reason=reason,
                        )
                        return RalphResult(
                            success=True,
                            output=output,
                            iterations=iterations,
                            guardrails_added=guardrails_added,
                            total_tokens_consumed=total_tokens,
                        )

                    # Not complete - add to guardrails
                    failure = self._create_failure(
                        agent_id=agent_id,
                        role=role,
                        reason=reason,
                        iteration=iterations,
                        metadata=metadata,
                    )
                    await self._add_guardrail(spec_uri, failure)
                    guardrails_added += 1

                    logger.info(
                        "ralph_iteration_failed",
                        agent_id=agent_id,
                        iteration=iterations,
                        reason=reason,
                    )

            except Exception as e:
                logger.error(
                    "ralph_iteration_error",
                    agent_id=agent_id,
                    iteration=iterations,
                    error=str(e),
                )
                failure = self._create_failure(
                    agent_id=agent_id,
                    role=role,
                    reason=f"Exception: {e}",
                    iteration=iterations,
                    failure_class=FailureClass.INFRASTRUCTURE_FAILURE,
                    metadata=metadata,
                )
                await self._add_guardrail(spec_uri, failure)
                guardrails_added += 1

        # Max iterations reached
        logger.error(
            "ralph_max_iterations_reached",
            agent_id=agent_id,
            max_iterations=self.max_iterations,
        )

        final_failure = self._create_failure(
            agent_id=agent_id,
            role=role,
            reason=f"Max iterations ({self.max_iterations}) reached",
            iteration=iterations,
            failure_class=FailureClass.TIMEOUT,
            metadata=metadata,
        )

        return RalphResult(
            success=False,
            iterations=iterations,
            final_failure=final_failure,
            guardrails_added=guardrails_added,
            total_tokens_consumed=total_tokens,
        )

    async def _build_context(self, spec_uri: str) -> dict[str, Any]:
        """Build minimal context from spec and guardrails.

        Loads only:
        - spec.md content
        - top-k guardrails (deterministic retrieval)
        """
        # Load spec content (simplified - in real impl, fetch from URI)
        spec_content = await self._load_spec(spec_uri)

        # Load top-k guardrails
        module = self._extract_module(spec_uri)
        guardrails_gset = await self.store.get_guardrails(module)

        # Convert to list and take top-k
        # In real impl, this would use causal fingerprint matching, not just recency
        all_guardrails = list(guardrails_gset.items)
        top_guardrails = all_guardrails[-self.guardrails_top_k :]

        context = {
            "spec": spec_content,
            "guardrails": top_guardrails,
            "guardrails_count": len(all_guardrails),
            "token_budget": self.context_budget_tokens,
        }

        logger.debug(
            "context_built",
            spec_uri=spec_uri,
            guardrails_loaded=len(top_guardrails),
            total_guardrails=len(all_guardrails),
        )

        return context

    async def _load_spec(self, spec_uri: str) -> str:
        """Load specification from URI.

        Supports:
        - file://path/to/spec.md
        - crdt://store/key
        """
        if spec_uri.startswith("file://"):
            import aiofiles

            path = spec_uri[7:]  # Remove file:// prefix
            try:
                async with aiofiles.open(path, "r") as f:
                    return await f.read()
            except Exception as e:
                logger.error("spec_load_failed", uri=spec_uri, error=str(e))
                return f"# Error loading spec: {e}"

        elif spec_uri.startswith("crdt://"):
            key = spec_uri[7:]
            register = await self.store.lww_get(key)
            return str(register.value) if register.value else ""

        return ""

    def _extract_module(self, spec_uri: str) -> str:
        """Extract module name from spec URI."""
        # Simple extraction - in real impl, parse properly
        if "/" in spec_uri:
            return spec_uri.split("/")[-1].replace(".md", "")
        return "default"

    def _create_failure(
        self,
        agent_id: AgentId,
        role: AgentRole,
        reason: str,
        iteration: int,
        failure_class: FailureClass = FailureClass.IMPLEMENTATION_ERROR,
        metadata: dict[str, Any] | None = None,
    ) -> StructuredFailure:
        """Create structured failure for guardrails."""
        import hashlib
        from datetime import datetime

        # Create causal fingerprint (deterministic)
        fingerprint_data = f"{agent_id}:{role}:{reason}:{iteration}"
        fingerprint = hashlib.sha256(fingerprint_data.encode()).hexdigest()[:32]

        return StructuredFailure(
            failure_class=failure_class,
            causal_fingerprint=fingerprint,
            agent_role=role,
            agent_id=agent_id,
            phase="execute",  # Ralph loop always in execute phase
            error_message=reason,
            metadata={
                "iteration": iteration,
                **(metadata or {}),
            },
        )

    async def _add_guardrail(self, spec_uri: str, failure: StructuredFailure) -> None:
        """Add failure to guardrails store."""
        module = self._extract_module(spec_uri)
        failure_json = failure.model_dump_json()
        await self.store.add_guardrail(module, failure_json)

        logger.debug(
            "guardrail_added",
            module=module,
            failure_class=failure.failure_class,
            fingerprint=failure.causal_fingerprint,
        )


# ============================================================================
# Convenience functions
# ============================================================================


async def ralph_loop(
    sandbox: GitWorktreeSandbox,
    store: CRDTStore,
    agent_id: AgentId,
    role: AgentRole,
    spec_uri: str,
    generate: AgentGenerator[T],
    predicate: CompletionPredicate[T],
    max_iterations: int = 5,
    **kwargs,
) -> RalphResult:
    """Convenience function to run a Ralph loop.

    Example:
        result = await ralph_loop(
            sandbox=sandbox,
            store=store,
            agent_id=AgentId("typescript_fixer"),
            role=AgentRole.IMPLEMENTER,
            spec_uri="file://specs/api_endpoint.md",
            generate=typescript_generator,
            predicate=compiles_and_tests_pass,
            max_iterations=5,
        )
    """
    loop = RalphLoop(sandbox, store, max_iterations=max_iterations)
    return await loop.execute(
        agent_id=agent_id,
        role=role,
        spec_uri=spec_uri,
        generate=generate,
        predicate=predicate,
        **kwargs,
    )
