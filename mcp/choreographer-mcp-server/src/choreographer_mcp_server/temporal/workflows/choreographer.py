"""Temporal workflow for Choreographer - Deterministic orchestration.

Implements the WorkflowState FSM with:
- Deterministic phase routing (no LLM calls in router)
- Durable execution via Temporal
- Human-in-the-loop signal handlers
- Budget tracking via PN-Counter

Critical invariant: The orchestrator is NOT an LLM - it's a deterministic FSM.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from temporalio import workflow
from temporalio.common import RetryPolicy

from choreographer_mcp_server.models import (
    AgentId,
    AgentRole,
    Phase,
    WorkflowId,
    WorkflowState,
)

with workflow.unsafe.imports_passed_through():
    from choreographer_mcp_server.temporal.activities import (
        ExecutePhaseActivity,
        PhaseInput,
        PhaseResult,
    )


# ============================================================================
# Signal definitions
# ============================================================================


@dataclass
class PhaseGateSignal:
    """Signal for human-in-the-loop phase approval."""

    approved: bool
    feedback: str = ""
    override_phase: Phase | None = None


@dataclass
class BudgetExhaustedSignal:
    """Signal for budget exhaustion handling."""

    request_additional_budget: float = 0.0
    terminate_workflow: bool = False


# ============================================================================
# Workflow definition
# ============================================================================


@workflow.defn
class ChoreographerWorkflow:
    """Deterministic workflow orchestrator for agent networks.

    State machine phases:
    1. DISCUSS - Clarify requirements and constraints
    2. PLAN - Generate architecture with formal contracts
    3. EXECUTE - Implement and test in parallel
    4. VERIFY - Review and validate

    Transitions are deterministic based on phase results.
    """

    def __init__(self) -> None:
        self._state: WorkflowState | None = None
        self._phase_gate_received: asyncio.Future | None = None
        self._budget_signal_received: asyncio.Future | None = None
        self._human_override_phase: Phase | None = None

    @workflow.run
    async def run(self, initial_state: WorkflowState) -> WorkflowState:
        """Execute the workflow state machine.

        Args:
            initial_state: Initial workflow state

        Returns:
            Final workflow state
        """
        self._state = initial_state

        logger = workflow.logger
        logger.info(
            "workflow_started",
            workflow_id=initial_state.workflow_id,
            initial_phase=initial_state.current_phase,
        )

        # Main state machine loop
        while True:
            current_phase = self._state.current_phase

            # Check for human override
            if self._human_override_phase:
                current_phase = self._human_override_phase
                self._state = self._state.with_phase(current_phase)
                self._human_override_phase = None

            logger.info("phase_started", phase=current_phase, attempt=self._state.attempt_count)

            # Execute current phase
            phase_result = await self._execute_phase(current_phase)

            # Update state with result
            self._state = self._state.with_phase_result(current_phase, phase_result.success)
            self._state = self._state.model_copy(update={"attempt_count": self._state.attempt_count + 1})

            # Check budget
            if self._state.budget_remaining <= 0:
                logger.warning("budget_exhausted", workflow_id=self._state.workflow_id)
                # Wait for budget signal or terminate
                if not await self._handle_budget_exhaustion():
                    break

            # Determine next phase
            if phase_result.success:
                next_phase = self._compute_next_phase(current_phase)
                if next_phase is None:
                    logger.info("workflow_complete", workflow_id=self._state.workflow_id)
                    break
                self._state = self._state.with_phase(next_phase)
            else:
                # Phase failed - compute minimum backtrack
                backtrack_phase = self._compute_minimum_backtrack(current_phase, phase_result)
                self._state = self._state.with_phase(backtrack_phase)

        return self._state

    async def _execute_phase(self, phase: Phase) -> PhaseResult:
        """Execute a workflow phase via activity."""
        import asyncio

        input_data = PhaseInput(
            workflow_id=self._state.workflow_id,
            phase=phase,
            spec_uri=self._state.spec_uri,
            worktree_ref=self._state.worktree_ref,
            guardrails_index=self._state.guardrails_index,
            previous_results=self._state.phase_results,
        )

        # Execute phase activity with retry policy
        activity = ExecutePhaseActivity()

        retry_policy = RetryPolicy(
            maximum_attempts=3,
            initial_interval=timedelta(seconds=1),
            maximum_interval=timedelta(seconds=60),
        )

        return await workflow.execute_activity(
            activity.run,
            input_data,
            start_to_close_timeout=timedelta(minutes=30),
            retry_policy=retry_policy,
        )

    def _compute_next_phase(self, current: Phase) -> Phase | None:
        """Compute next phase on success (deterministic).

        Returns None if workflow complete.
        """
        transitions = {
            Phase.DISCUSS: Phase.PLAN,
            Phase.PLAN: Phase.EXECUTE,
            Phase.EXECUTE: Phase.VERIFY,
            Phase.VERIFY: None,  # Workflow complete
        }
        return transitions.get(current)

    def _compute_minimum_backtrack(
        self, failed_phase: Phase, result: PhaseResult
    ) -> Phase:
        """Compute minimum backtrack phase on failure (deterministic).

        Based on failure analysis, determine earliest phase to retry from.
        """
        # Simple policy: backtrack to DISCUSS for spec issues, else previous phase
        if result.failure_class in ["SPEC_AMBIGUITY", "CONTRACT_VIOLATION"]:
            return Phase.DISCUSS
        elif failed_phase == Phase.VERIFY:
            return Phase.EXECUTE
        elif failed_phase == Phase.EXECUTE:
            return Phase.PLAN
        else:
            return Phase.DISCUSS

    async def _handle_budget_exhaustion(self) -> bool:
        """Handle budget exhaustion via signal.

        Returns True to continue, False to terminate.
        """
        import asyncio

        self._budget_signal_received = asyncio.Future()

        try:
            # Wait for budget signal with timeout
            await asyncio.wait_for(
                asyncio.wrap_future(self._budget_signal_received),
                timeout=3600,  # 1 hour timeout for human response
            )
            signal = self._budget_signal_received.result()

            if signal.terminate_workflow:
                return False

            if signal.request_additional_budget > 0:
                self._state = self._state.model_copy(
                    update={
                        "budget_remaining": self._state.budget_remaining
                        + signal.request_additional_budget
                    }
                )
                return True

        except asyncio.TimeoutError:
            workflow.logger.error("budget_signal_timeout")
            return False

        return False

    # ========================================================================
    # Signal handlers
    # ========================================================================

    @workflow.signal
    async def phase_gate(self, signal: PhaseGateSignal) -> None:
        """Handle phase gate approval signal."""
        workflow.logger.info(
            "phase_gate_received",
            approved=signal.approved,
            has_feedback=bool(signal.feedback),
        )

        if signal.override_phase:
            self._human_override_phase = signal.override_phase

        if self._phase_gate_received and not self._phase_gate_received.done():
            self._phase_gate_received.set_result(signal)

    @workflow.signal
    async def budget_exhausted(self, signal: BudgetExhaustedSignal) -> None:
        """Handle budget exhaustion signal."""
        workflow.logger.info(
            "budget_signal_received",
            request_additional=signal.request_additional_budget,
            terminate=signal.terminate_workflow,
        )

        if self._budget_signal_received and not self._budget_signal_received.done():
            self._budget_signal_received.set_result(signal)

    @workflow.query
    def current_state(self) -> WorkflowState:
        """Query current workflow state."""
        return self._state


# ============================================================================
# Helper functions
# ============================================================================


def compute_minimum_backtrack_phase(
    failed_phase: Phase, results: dict[Phase, bool]
) -> Phase:
    """Pure function for computing backtrack phase.

    This function is deterministic and has no side effects.
    It can be unit tested independently.

    Args:
        failed_phase: The phase that failed
        results: Results of all phases so far

    Returns:
        Phase to backtrack to
    """
    # If DISCUSS failed, stay at DISCUSS
    if failed_phase == Phase.DISCUSS:
        return Phase.DISCUSS

    # If we haven't successfully discussed, go back to DISCUSS
    if not results.get(Phase.DISCUSS, False):
        return Phase.DISCUSS

    # If PLAN failed and we haven't planned successfully, stay at PLAN
    if failed_phase == Phase.PLAN:
        return Phase.DISCUSS  # Need to re-discuss before re-planning

    # If EXECUTE failed, we might need to re-plan
    if failed_phase == Phase.EXECUTE:
        return Phase.PLAN

    # If VERIFY failed, re-execute
    if failed_phase == Phase.VERIFY:
        return Phase.EXECUTE

    # Default: back to discuss
    return Phase.DISCUSS


# ============================================================================
# Workflow client helpers
# ============================================================================


async def start_workflow(
    client,
    spec_uri: str,
    budget: float = 100.0,
    workflow_id: str | None = None,
) -> WorkflowId:
    """Start a new Choreographer workflow.

    Args:
        client: Temporal client
        spec_uri: URI to specification
        budget: Initial budget
        workflow_id: Optional workflow ID (generated if not provided)

    Returns:
        Workflow ID
    """
    from uuid import uuid4

    wf_id = workflow_id or str(uuid4())

    initial_state = WorkflowState(
        workflow_id=WorkflowId(wf_id),
        spec_uri=spec_uri,
        budget_remaining=budget,
        current_phase=Phase.DISCUSS,
    )

    await client.start_workflow(
        ChoreographerWorkflow.run,
        initial_state,
        id=wf_id,
        task_queue="choreographer-task-queue",
    )

    return WorkflowId(wf_id)
