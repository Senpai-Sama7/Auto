"""Core data models for Choreographer."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum, StrEnum, auto
from typing import Any, NewType, TypeVar
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

# Type aliases for type safety
AgentId = NewType("AgentId", str)
WorkflowId = NewType("WorkflowId", str)
WorktreeRef = NewType("WorktreeRef", str)
CausalFingerprint = NewType("CausalFingerprint", str)
VectorClock = dict[AgentId, int]

T = TypeVar("T")


class Phase(StrEnum):
    """Workflow phases."""

    DISCUSS = "discuss"
    PLAN = "plan"
    EXECUTE = "execute"
    VERIFY = "verify"


class AgentRole(StrEnum):
    """Hierarchical Agent Network roles."""

    ORCHESTRATOR = "orchestrator"  # Tier 0: Deterministic FSM
    ARCHITECT = "architect"  # Tier 1: Design docs, formal contracts
    IMPLEMENTER = "implementer"  # Tier 2: Code generation
    TESTER = "tester"  # Tier 2: Adversarial testing
    REVIEWER = "reviewer"  # Tier 1: Cross-validation


class FailureClass(StrEnum):
    """Structured failure taxonomy for causal analysis."""

    SPEC_AMBIGUITY = "spec_ambiguity"
    CONTEXT_ROT = "context_rot"
    IMPLEMENTATION_ERROR = "implementation_error"
    VERIFICATION_FAILURE = "verification_failure"
    INFRASTRUCTURE_FAILURE = "infrastructure_failure"
    MESA_OPTIMIZATION = "mesa_optimization"
    TIMEOUT = "timeout"
    RESOURCE_EXHAUSTION = "resource_exhaustion"
    CONTRACT_VIOLATION = "contract_violation"
    UNCERTAINTY_ESCALATION = "uncertainty_escalation"


class CRDTType(StrEnum):
    """CRDT data types."""

    GSET = "gset"  # Grow-only Set
    LWW_REGISTER = "lww_register"  # Last-Write-Wins Register
    PN_COUNTER = "pn_counter"  # Positive-Negative Counter
    VECTOR_VERSIONED = "vector_versioned"  # Vector-versioned values


# ============================================================================
# Workflow State Models
# ============================================================================


class WorkflowState(BaseModel):
    """Minimal state for Temporal workflow - O(1) storage."""

    model_config = ConfigDict(frozen=True)

    workflow_id: WorkflowId = Field(default_factory=lambda: WorkflowId(str(uuid4())))
    spec_uri: str  # LWW register key for current spec
    current_phase: Phase = Phase.DISCUSS
    phase_results: dict[Phase, bool] = Field(default_factory=dict)
    attempt_count: int = 0
    budget_remaining: float = Field(default=100.0)  # PN-Counter value
    worktree_ref: WorktreeRef | None = None
    guardrails_index: str | None = None  # Embedding index URI
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def with_phase_result(self, phase: Phase, result: bool) -> WorkflowState:
        """Return new state with phase result recorded."""
        new_results = dict(self.phase_results)
        new_results[phase] = result
        return self.model_copy(
            update={
                "phase_results": new_results,
                "updated_at": datetime.utcnow(),
            }
        )

    def with_phase(self, phase: Phase) -> WorkflowState:
        """Transition to new phase."""
        return self.model_copy(
            update={
                "current_phase": phase,
                "updated_at": datetime.utcnow(),
            }
        )


# ============================================================================
# Agent Models
# ============================================================================


class AgentProcess(BaseModel):
    """Running agent process in isolated worktree."""

    model_config = ConfigDict(frozen=True)

    agent_id: AgentId
    role: AgentRole
    worktree_path: str
    process_pid: int | None = None
    spec_uri: str
    context_budget_tokens: int
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: datetime | None = None
    exit_code: int | None = None


class ArchitectOutput(BaseModel):
    """Output from Architect agent (Tier 1)."""

    model_config = ConfigDict(frozen=True)

    components: list[dict[str, Any]]
    interfaces: list[dict[str, Any]]  # Pre/post conditions
    invariants: list[str]  # LTL formulas
    tcb_boundary: list[str]  # Trusted Computing Base components
    verification_plan: dict[str, Any]
    tokens_consumed: int
    approach_summary: str
    uncertainty_flags: list[str] = Field(default_factory=list)


class ImplementerOutput(BaseModel):
    """Output from Implementer agent (Tier 2)."""

    model_config = ConfigDict(frozen=True)

    code: str  # Diff patch
    tests: list[dict[str, Any]]
    approach_taken: str
    risks_acknowledged: list[str] = Field(default_factory=list)
    verification_notes: str


class TestCase(BaseModel):
    """Test case from Test agent (Tier 2)."""

    model_config = ConfigDict(frozen=True)

    test_id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    description: str
    input_data: dict[str, Any]
    expected_behavior: str
    target_module: str
    adversarial_intent: str | None = None  # For DAFTAR tests


class StructuredFailure(BaseModel):
    """Structured failure for guardrails store."""

    model_config = ConfigDict(frozen=True)

    failure_id: str = Field(default_factory=lambda: str(uuid4()))
    failure_class: FailureClass
    causal_fingerprint: CausalFingerprint
    agent_role: AgentRole
    agent_id: AgentId
    phase: Phase
    error_message: str
    stack_trace: str | None = None
    context_window_hash: str | None = None  # For context rot detection
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)


# ============================================================================
# CRDT Models
# ============================================================================


class GSet(BaseModel):
    """Grow-only Set CRDT."""

    model_config = ConfigDict(frozen=True)

    items: frozenset[str] = Field(default_factory=frozenset)

    def add(self, item: str) -> GSet:
        """Add item (returns new set)."""
        return self.model_copy(update={"items": self.items | {item}})

    def merge(self, other: GSet) -> GSet:
        """Merge two GSets (commutative, associative, idempotent)."""
        return self.model_copy(update={"items": self.items | other.items})

    def contains(self, item: str) -> bool:
        """Check membership."""
        return item in self.items


class LWWRegister(BaseModel):
    """Last-Write-Wins Register CRDT."""

    model_config = ConfigDict(frozen=True)

    value: Any = None
    timestamp: float = 0.0  # Logical timestamp
    node_id: str = ""

    def write(self, value: Any, timestamp: float, node_id: str) -> LWWRegister:
        """Write value if timestamp is newer."""
        if timestamp > self.timestamp:
            return self.model_copy(
                update={"value": value, "timestamp": timestamp, "node_id": node_id}
            )
        return self

    def merge(self, other: LWWRegister) -> LWWRegister:
        """Merge two LWW registers (takes latest timestamp)."""
        if other.timestamp > self.timestamp:
            return other
        return self


class PNCounter(BaseModel):
    """Positive-Negative Counter CRDT."""

    model_config = ConfigDict(frozen=True)

    increments: dict[str, int] = Field(default_factory=dict)
    decrements: dict[str, int] = Field(default_factory=dict)

    def increment(self, node_id: str, delta: int = 1) -> PNCounter:
        """Increment counter."""
        new_incs = dict(self.increments)
        new_incs[node_id] = new_incs.get(node_id, 0) + delta
        return self.model_copy(update={"increments": new_incs})

    def decrement(self, node_id: str, delta: int = 1) -> PNCounter:
        """Decrement counter."""
        new_decs = dict(self.decrements)
        new_decs[node_id] = new_decs.get(node_id, 0) + delta
        return self.model_copy(update={"decrements": new_decs})

    def value(self) -> int:
        """Get current value."""
        total_inc = sum(self.increments.values())
        total_dec = sum(self.decrements.values())
        return total_inc - total_dec

    def merge(self, other: PNCounter) -> PNCounter:
        """Merge two PN-Counters."""
        merged_incs = {
            k: max(self.increments.get(k, 0), other.increments.get(k, 0))
            for k in set(self.increments) | set(other.increments)
        }
        merged_decs = {
            k: max(self.decrements.get(k, 0), other.decrements.get(k, 0))
            for k in set(self.decrements) | set(other.decrements)
        }
        return self.model_copy(update={"increments": merged_incs, "decrements": merged_decs})


class VectorVersionedValue(BaseModel):
    """Vector-versioned value for concurrent proposals."""

    model_config = ConfigDict(frozen=True)

    value: Any = None
    vector_clock: VectorClock = Field(default_factory=dict)

    def update(self, value: Any, agent_id: AgentId, clock: VectorClock) -> VectorVersionedValue:
        """Update with new vector clock."""
        return self.model_copy(update={"value": value, "vector_clock": clock})

    def merge(self, other: VectorVersionedValue) -> VectorVersionedValue:
        """Merge using vector clock (returns concurrent versions if conflict)."""
        # Simple merge: take higher clock values
        merged_clock: VectorClock = {}
        all_agents = set(self.vector_clock) | set(other.vector_clock)
        for agent in all_agents:
            merged_clock[agent] = max(
                self.vector_clock.get(agent, 0),
                other.vector_clock.get(agent, 0)
            )
        # Last-write-wins for value based on clock comparison
        if self._clock_leq(self.vector_clock, other.vector_clock):
            return other.model_copy(update={"vector_clock": merged_clock})
        elif self._clock_leq(other.vector_clock, self.vector_clock):
            return self.model_copy(update={"vector_clock": merged_clock})
        else:
            # Concurrent versions - return both as list
            return self.model_copy(
                update={
                    "value": [self.value, other.value],
                    "vector_clock": merged_clock,
                }
            )

    @staticmethod
    def _clock_leq(clock1: VectorClock, clock2: VectorClock) -> bool:
        """Check if clock1 <= clock2 (happens-before relation)."""
        all_agents = set(clock1) | set(clock2)
        return all(clock1.get(a, 0) <= clock2.get(a, 0) for a in all_agents)


# ============================================================================
# Causal Message Models
# ============================================================================


class CausalMessage(BaseModel):
    """Message with vector clock for causal delivery."""

    model_config = ConfigDict(frozen=True)

    message_id: str = Field(default_factory=lambda: str(uuid4()))
    from_agent: AgentId
    to_agent: AgentId
    payload: dict[str, Any]
    vector_clock: VectorClock
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# Attribution Models
# ============================================================================


class ShapleyAttribution(BaseModel):
    """Blame attribution using Shapley values."""

    model_config = ConfigDict(frozen=True)

    workflow_id: WorkflowId
    failure: StructuredFailure
    role_values: dict[AgentRole, float]  # Shapley values per role
    coalition_values: dict[frozenset[AgentRole], float] | None = None
    computation_method: str  # "heuristic", "monte_carlo", "stratified"
    sample_count: int | None = None
    total_cost: float  # For cost tracking


class MesaSuspicionReport(BaseModel):
    """Mesa-optimization detection report."""

    model_config = ConfigDict(frozen=True)

    agent_id: AgentId
    phase: Phase
    suspicion_score: float  # 0.0 to 1.0
    complexity_metrics: dict[str, float]
    spec_coverage_ratio: float
    divergence_indicators: list[str]
    recommended_action: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# Store Schema
# ============================================================================


class StoreSchema:
    """CRDT Store key schema."""

    @staticmethod
    def guardrails(module: str) -> str:
        return f"guardrails.{module}"

    @staticmethod
    def test_cases() -> str:
        return "test.cases"

    @staticmethod
    def spec_current() -> str:
        return "spec.current"

    @staticmethod
    def phase_status(name: str) -> str:
        return f"phase.{name}.status"

    @staticmethod
    def budget_remaining() -> str:
        return "budget.remaining"

    @staticmethod
    def tokens_consumed() -> str:
        return "tokens.consumed"

    @staticmethod
    def proposals(feature: str) -> str:
        return f"proposals.{feature}"
