"""Temporal activities for Choreographer workflow.

Activities are the units of work executed by the workflow.
They can be retried independently and run in separate processes.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from temporalio import activity

from choreographer_mcp_server.models import (
    AgentId,
    AgentRole,
    Phase,
    Phase as WorkflowPhase,
    WorktreeRef,
)


@dataclass
class PhaseInput:
    """Input for phase execution activity."""

    workflow_id: str
    phase: Phase
    spec_uri: str
    worktree_ref: WorktreeRef | None = None
    guardrails_index: str | None = None
    previous_results: dict[Phase, bool] | None = None


@dataclass
class PhaseResult:
    """Result of phase execution."""

    success: bool
    phase: Phase
    artifacts: dict[str, Any] | None = None
    failure_class: str | None = None
    failure_reason: str | None = None
    tokens_consumed: int = 0
    cost: float = 0.0


class ExecutePhaseActivity:
    """Activity for executing workflow phases."""

    @activity.defn
    async def run(self, input: PhaseInput) -> PhaseResult:
        """Execute a workflow phase.

        This activity spawns the appropriate agents based on phase:
        - DISCUSS: Architect agent for requirements clarification
        - PLAN: Architect agent for design documentation
        - EXECUTE: Implementer + Tester agents in parallel
        - VERIFY: Reviewer agent for cross-validation
        """
        activity.logger.info(
            "phase_activity_started",
            workflow_id=input.workflow_id,
            phase=input.phase,
        )

        # Route to phase-specific handler
        handlers = {
            WorkflowPhase.DISCUSS: self._execute_discuss,
            WorkflowPhase.PLAN: self._execute_plan,
            WorkflowPhase.EXECUTE: self._execute_execute,
            WorkflowPhase.VERIFY: self._execute_verify,
        }

        handler = handlers.get(input.phase)
        if not handler:
            return PhaseResult(
                success=False,
                phase=input.phase,
                failure_class="INFRASTRUCTURE_FAILURE",
                failure_reason=f"Unknown phase: {input.phase}",
            )

        return await handler(input)

    async def _execute_discuss(self, input: PhaseInput) -> PhaseResult:
        """Execute DISCUSS phase with Architect agent."""
        # Spawn Architect agent to clarify requirements
        # This would integrate with the actual agent runtime
        activity.logger.info("discuss_phase_executing", spec_uri=input.spec_uri)

        # Placeholder: In real implementation, spawn agent and collect output
        return PhaseResult(
            success=True,
            phase=WorkflowPhase.DISCUSS,
            artifacts={"clarified_spec": input.spec_uri},
            tokens_consumed=1000,
            cost=0.10,
        )

    async def _execute_plan(self, input: PhaseInput) -> PhaseResult:
        """Execute PLAN phase with Architect agent."""
        # Spawn Architect agent to produce design docs
        activity.logger.info("plan_phase_executing", spec_uri=input.spec_uri)

        return PhaseResult(
            success=True,
            phase=WorkflowPhase.PLAN,
            artifacts={
                "architecture_doc": "placeholder",
                "interfaces": [],
                "invariants": [],
            },
            tokens_consumed=5000,
            cost=0.50,
        )

    async def _execute_execute(self, input: PhaseInput) -> PhaseResult:
        """Execute EXECUTE phase with Implementer + Tester agents."""
        # Spawn Implementer and Tester in parallel
        activity.logger.info("execute_phase_executing", spec_uri=input.spec_uri)

        # Placeholder: In real implementation, use asyncio.gather for parallel execution
        return PhaseResult(
            success=True,
            phase=WorkflowPhase.EXECUTE,
            artifacts={
                "code": "placeholder",
                "tests": [],
            },
            tokens_consumed=10000,
            cost=1.00,
        )

    async def _execute_verify(self, input: PhaseInput) -> PhaseResult:
        """Execute VERIFY phase with Reviewer agent."""
        # Spawn Reviewer agent for cross-validation
        activity.logger.info("verify_phase_executing", spec_uri=input.spec_uri)

        return PhaseResult(
            success=True,
            phase=WorkflowPhase.VERIFY,
            artifacts={"review_report": "placeholder"},
            tokens_consumed=2000,
            cost=0.20,
        )


# ============================================================================
# Activity registration
# ============================================================================


def register_activities():
    """Register all activities with Temporal."""
    return [
        ExecutePhaseActivity(),
    ]
