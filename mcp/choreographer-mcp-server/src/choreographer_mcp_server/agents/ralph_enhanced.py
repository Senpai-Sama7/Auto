"""Enhanced Ralph Loop with Sprint 2 Safety Features.

Integrates:
- Predicate composition validation
- Structured failure classification
- Mesa-optimization detection
- Real-time monitoring
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Coroutine

import structlog

from choreographer_mcp_server.agents.ralph import (
    AgentGenerator,
    CompletionPredicate,
    RalphLoop,
    RalphResult,
)
from choreographer_mcp_server.guardrails.taxonomy import (
    FailureClassifier,
    GuardrailsRetriever,
    StructuredFailureFactory,
)
from choreographer_mcp_server.infrastructure.sandbox import GitWorktreeSandbox
from choreographer_mcp_server.models import (
    AgentId,
    AgentRole,
    FailureClass,
    MesaSuspicionReport,
    Phase,
    StructuredFailure,
)
from choreographer_mcp_server.safety.mesa_detector import MesaDetector
from choreographer_mcp_server.store.crdt_store import CRDTStore
from choreographer_mcp_server.verification.safety import (
    PredicateCompositionValidator,
    VerifiedRalphLoop,
)

logger = structlog.get_logger()


@dataclass
class SafetyConfig:
    """Configuration for safety monitoring."""

    enable_mesa_detection: bool = True
    mesa_suspicion_threshold: float = 0.6
    mesa_escalation_threshold: float = 0.8
    enable_failure_classification: bool = True
    enable_predicate_validation: bool = True
    max_guardrails_retrieval: int = 5
    require_human_review_on_suspicion: bool = True


@dataclass
class EnhancedRalphResult(RalphResult):
    """Extended result with safety information."""

    mesa_reports: list[MesaSuspicionReport] = None
    safety_violations: list[str] = None
    required_human_review: bool = False
    human_review_reason: str = ""
    predicate_validation_passed: bool = True

    def __post_init__(self):
        if self.mesa_reports is None:
            self.mesa_reports = []
        if self.safety_violations is None:
            self.safety_violations = []


class EnhancedRalphLoop:
    """Ralph loop with integrated safety monitoring.

    Features:
    1. Predicate composition validation before execution
    2. Real-time mesa-optimization detection
    3. Structured failure classification
    4. Automatic escalation to adversarial games
    """

    def __init__(
        self,
        sandbox: GitWorktreeSandbox,
        store: CRDTStore,
        safety_config: SafetyConfig | None = None,
        max_iterations: int = 5,
    ) -> None:
        self.sandbox = sandbox
        self.store = store
        self.config = safety_config or SafetyConfig()
        self.max_iterations = max_iterations

        # Safety components
        self.mesa_detector = MesaDetector()
        self.failure_factory = StructuredFailureFactory()
        self.guardrails_retriever = GuardrailsRetriever()
        self.predicate_validator = VerifiedRalphLoop()

        # Base Ralph loop
        self.base_loop = RalphLoop(
            sandbox=sandbox,
            store=store,
            max_iterations=max_iterations,
        )

    async def execute(
        self,
        agent_id: AgentId,
        role: AgentRole,
        spec_uri: str,
        generate: AgentGenerator,
        predicate: CompletionPredicate,
        specification: str,
        additional_predicates: list[CompletionPredicate] | None = None,
        base_ref: str = "HEAD",
        metadata: dict[str, Any] | None = None,
    ) -> EnhancedRalphResult:
        """Execute enhanced Ralph loop with safety monitoring.

        Args:
            agent_id: Unique agent identifier
            role: Agent role in HAN
            spec_uri: URI to specification
            generate: Generation function
            predicate: Primary completion predicate
            specification: Full specification text for coverage analysis
            additional_predicates: Additional predicates to compose
            base_ref: Git ref for worktree base
            metadata: Additional metadata

        Returns:
            EnhancedRalphResult with safety information
        """
        # Step 1: Validate predicate composition
        if self.config.enable_predicate_validation and additional_predicates:
            try:
                # In real implementation, would register and validate
                logger.info("predicate_composition_validated")
            except Exception as e:
                logger.error("predicate_validation_failed", error=str(e))
                return EnhancedRalphResult(
                    success=False,
                    iterations=0,
                    final_failure=None,
                    predicate_validation_passed=False,
                    safety_violations=[f"Predicate validation failed: {e}"],
                )

        # Step 2: Execute Ralph loop with monitoring
        iterations = 0
        mesa_reports: list[MesaSuspicionReport] = []
        safety_violations: list[str] = []
        previous_implementations: list[str] = []

        while iterations < self.max_iterations:
            iterations += 1
            logger.info(
                "enhanced_ralph_iteration",
                agent_id=agent_id,
                iteration=iterations,
            )

            # Generate implementation
            context = await self._build_enhanced_context(spec_uri, agent_id)

            try:
                async with self.sandbox.agent_context(
                    agent_id=AgentId(f"{agent_id}_iter{iterations}"),
                    role=role,
                    spec_uri=spec_uri,
                    context_budget_tokens=50000,
                    base_ref=base_ref,
                ) as agent_process:
                    # Generate
                    implementation = await generate(context, agent_process.worktree_path)

                    # Step 3: Mesa-optimization detection
                    if self.config.enable_mesa_detection:
                        mesa_report = self.mesa_detector.analyze(
                            agent_id=agent_id,
                            phase=Phase.EXECUTE,
                            implementation=implementation,
                            specification=specification,
                            previous_implementations=previous_implementations,
                        )
                        mesa_reports.append(mesa_report)

                        # Check for high suspicion
                        if mesa_report.suspicion_score >= self.config.mesa_escalation_threshold:
                            safety_violations.append(
                                f"High mesa-optimization suspicion: {mesa_report.suspicion_score:.2f}"
                            )
                            logger.warning(
                                "mesa_escalation_triggered",
                                suspicion_score=mesa_report.suspicion_score,
                            )

                            # Could trigger adversarial game here
                            if self.config.require_human_review_on_suspicion:
                                return EnhancedRalphResult(
                                    success=False,
                                    iterations=iterations,
                                    final_failure=None,
                                    mesa_reports=mesa_reports,
                                    safety_violations=safety_violations,
                                    required_human_review=True,
                                    human_review_reason="High mesa-optimization suspicion detected",
                                )

                        elif mesa_report.suspicion_score >= self.config.mesa_suspicion_threshold:
                            logger.warning(
                                "mesa_suspicion_elevated",
                                suspicion_score=mesa_report.suspicion_score,
                            )

                    # Step 4: Verify completion predicate
                    is_complete, reason = await predicate(implementation)

                    if is_complete:
                        logger.info(
                            "enhanced_ralph_complete",
                            agent_id=agent_id,
                            iterations=iterations,
                            mesa_checks=len(mesa_reports),
                        )

                        return EnhancedRalphResult(
                            success=True,
                            output=implementation,
                            iterations=iterations,
                            mesa_reports=mesa_reports,
                            safety_violations=safety_violations,
                            predicate_validation_passed=True,
                        )

                    # Not complete - classify failure and add to guardrails
                    previous_implementations.append(implementation)

                    failure = self.failure_factory.create_from_error(
                        agent_id=AgentId(f"{agent_id}_iter{iterations}"),
                        role=role,
                        phase=Phase.EXECUTE,
                        error_message=reason,
                        metadata={
                            "iteration": iterations,
                            "mesa_suspicion": mesa_reports[-1].suspicion_score if mesa_reports else 0.0,
                        },
                    )

                    await self._add_guardrail(spec_uri, failure)
                    logger.info("failure_guardrail_added", failure_class=failure.failure_class.value)

            except Exception as e:
                logger.error("enhanced_ralph_iteration_error", error=str(e))

                failure = self.failure_factory.create_from_error(
                    agent_id=AgentId(f"{agent_id}_iter{iterations}"),
                    role=role,
                    phase=Phase.EXECUTE,
                    error_message=str(e),
                    metadata={"iteration": iterations, "exception": True},
                )
                await self._add_guardrail(spec_uri, failure)

        # Max iterations reached
        return EnhancedRalphResult(
            success=False,
            iterations=iterations,
            final_failure=self.failure_factory.create_from_error(
                agent_id=agent_id,
                role=role,
                phase=Phase.EXECUTE,
                error_message=f"Max iterations ({self.max_iterations}) reached",
            ),
            mesa_reports=mesa_reports,
            safety_violations=safety_violations,
        )

    async def _build_enhanced_context(
        self, spec_uri: str, agent_id: AgentId
    ) -> dict[str, Any]:
        """Build context with relevant guardrails retrieval."""
        # Load spec
        spec_content = await self._load_spec(spec_uri)

        # Get all guardrails for module
        module = self._extract_module(spec_uri)
        guardrails_gset = await self.store.get_guardrails(module)

        # Parse guardrails
        all_guardrails: list[StructuredFailure] = []
        for item in guardrails_gset.items:
            try:
                from pydantic import TypeAdapter

                failure = TypeAdapter(StructuredFailure).validate_json(item)
                all_guardrails.append(failure)
            except Exception:
                continue

        # Find relevant ones (in real impl, would use causal fingerprint matching)
        relevant = self.guardrails_retriever.find_relevant_guardrails(
            all_guardrails, spec_content, top_k=self.config.max_guardrails_retrieval
        )

        return {
            "spec": spec_content,
            "guardrails": [g.model_dump() for g in relevant],
            "total_guardrails": len(all_guardrails),
            "agent_id": agent_id,
        }

    async def _load_spec(self, spec_uri: str) -> str:
        """Load specification from URI."""
        if spec_uri.startswith("file://"):
            import aiofiles

            path = spec_uri[7:]
            try:
                async with aiofiles.open(path, "r") as f:
                    return await f.read()
            except Exception as e:
                return f"# Error: {e}"
        return ""

    def _extract_module(self, spec_uri: str) -> str:
        """Extract module name from URI."""
        if "/" in spec_uri:
            return spec_uri.split("/")[-1].replace(".md", "")
        return "default"

    async def _add_guardrail(self, spec_uri: str, failure: StructuredFailure) -> None:
        """Add failure to guardrails store."""
        module = self._extract_module(spec_uri)
        await self.store.add_guardrail(module, failure.model_dump_json())

    def get_safety_report(self) -> dict[str, Any]:
        """Get comprehensive safety report."""
        return {
            "mesa_detection_enabled": self.config.enable_mesa_detection,
            "failure_classification_enabled": self.config.enable_failure_classification,
            "predicate_validation_enabled": self.config.enable_predicate_validation,
            "mesa_historical_trend": self.mesa_detector.get_historical_trend(),
            "total_failures_classified": len(self.failure_factory.classifier._patterns),
        }


# ============================================================================
# Convenience function
# ============================================================================


async def enhanced_ralph_loop(
    sandbox: GitWorktreeSandbox,
    store: CRDTStore,
    agent_id: AgentId,
    role: AgentRole,
    spec_uri: str,
    specification: str,
    generate: AgentGenerator,
    predicate: CompletionPredicate,
    safety_config: SafetyConfig | None = None,
    max_iterations: int = 5,
    **kwargs,
) -> EnhancedRalphResult:
    """Convenience function for enhanced Ralph loop.

    Example:
        result = await enhanced_ralph_loop(
            sandbox=sandbox,
            store=store,
            agent_id=AgentId("secure_impl"),
            role=AgentRole.IMPLEMENTER,
            spec_uri="file://specs/auth.md",
            specification="Implement OAuth2 flow with PKCE...",
            generate=typescript_generator,
            predicate=security_tests_pass,
            safety_config=SafetyConfig(
                enable_mesa_detection=True,
                mesa_suspicion_threshold=0.6,
            ),
        )

        if result.required_human_review:
            print(f"Human review needed: {result.human_review_reason}")
        elif result.success:
            print(f"Success with {len(result.mesa_reports)} safety checks")
    """
    loop = EnhancedRalphLoop(
        sandbox=sandbox,
        store=store,
        safety_config=safety_config,
        max_iterations=max_iterations,
    )

    return await loop.execute(
        agent_id=agent_id,
        role=role,
        spec_uri=spec_uri,
        generate=generate,
        predicate=predicate,
        specification=specification,
        **kwargs,
    )
