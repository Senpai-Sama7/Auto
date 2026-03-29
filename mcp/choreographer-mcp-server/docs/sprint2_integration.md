# Sprint 2 Integration Architecture

## Enhanced Ralph Loop Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ENHANCED RALPH LOOP EXECUTION                     │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│   START      │
└──────┬───────┘
       │
       ▼
┌──────────────────────────┐
│ 1. Validate Predicate    │ ◄── PredicateCompositionValidator
│    Composition           │     Checks infrastructure conflicts
└──────┬───────────────────┘     Raises CompositionVulnerabilityError
       │
       │ PASS
       ▼
┌──────────────────────────┐
│ 2. Build Context         │ ◄── GuardrailsRetriever
│    + Retrieve Guardrails │     Finds relevant past failures
└──────┬───────────────────┘     Using causal fingerprints
       │
       ▼
┌──────────────────────────┐
│ 3. Spawn Isolated Agent  │ ◄── GitWorktreeSandbox
│    in Git Worktree       │     Anonymous pipe secrets
└──────┬───────────────────┘     Auto-cleanup guaranteed
       │
       ▼
┌──────────────────────────┐
│ 4. Generate Output       │ ◄── AgentGenerator
│    (LLM Call)            │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│ 5. Mesa-Optimization     │ ◄── MesaDetector
│    Detection             │     Ensemble complexity analysis
│    ├─ Cyclomatic         │     Specification coverage (Jaccard)
│    ├─ Halstead           │     Gaming indicators
│    ├─ Semantic           │
│    └─ Compression        │
└──────┬───────────────────┘
       │
       ├────────────────┬────────────────┐
       │ suspicion      │ suspicion      │ else
       │ >= 0.8         │ >= 0.6         │
       ▼                ▼                ▼
┌────────────┐   ┌────────────┐   ┌──────────────────┐
│ ESCALATE   │   │   WARN     │   │ Continue to      │
│ Human      │   │ Log        │   │ Verification     │
│ Review or  │   │ elevated   │   │                  │
│ Adversarial│   │ suspicion  │   │                  │
│ Game       │   │            │   │                  │
└──────┬─────┘   └──────┬─────┘   └────────┬─────────┘
       │                │                  │
       │                └──────────────────┘
       │                                   │
       └───────────────────────────────────┘
                                           │
                                           ▼
┌──────────────────────────┐
│ 6. Verify Predicate      │ ◄── CompletionPredicate
│    (Pass/Fail)           │
└──────┬───────────────────┘
       │
       ├────────────┬────────────┐
       │ PASS       │ FAIL       │
       ▼            ▼            │
┌────────────┐  ┌──────────────────────┐
│ SUCCESS    │  │ 7. Classify Failure  │ ◄── FailureClassifier
│ Return     │  │    (Deterministic)   │     Regex-based, no LLM
│ Result     │  └──────────┬───────────┘
└────────────┘             │
                           ▼
                  ┌──────────────────────┐
                  │ 8. Generate Causal   │ ◄── generate_causal_fingerprint
                  │    Fingerprint       │     Normalized, deterministic
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │ 9. Store in          │ ◄── CRDT Store
                  │    Guardrails GSet   │     Grow-only Set
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │ 10. Next Iteration   │
                  │     (up to max)      │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │ MAX ITERATIONS       │
                  │ REACHED              │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │ RETURN FAILURE       │
                  │ with all reports     │
                  └──────────────────────┘
```

## Component Interaction Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    ENHANCED RALPH LOOP                           │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  EnhancedRalphLoop                                      │   │
│  │  ├─ sandbox: GitWorktreeSandbox                         │   │
│  │  ├─ store: CRDTStore                                    │   │
│  │  ├─ mesa_detector: MesaDetector                         │   │
│  │  ├─ failure_factory: StructuredFailureFactory           │   │
│  │  ├─ guardrails_retriever: GuardrailsRetriever           │   │
│  │  └─ predicate_validator: PredicateCompositionValidator  │   │
│  └────────────────────────┬────────────────────────────────┘   │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  SAFETY LAYERS                           │   │
│  │                                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │   Predicate  │  │    Mesa      │  │   Failure    │  │   │
│  │  │ Composition  │  │  Detection   │  │ Classification│  │   │
│  │  │  Validator   │  │              │  │              │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │   │
│  │          │                │                 │           │   │
│  │          ▼                ▼                 ▼           │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │              DETECTION RESULTS                   │   │   │
│  │  │  ├─ Infrastructure conflicts                     │   │   │
│  │  │  ├─ Suspicion score (0.0 - 1.0)                 │   │   │
│  │  │  ├─ Complexity metrics                          │   │   │
│  │  │  ├─ Spec coverage ratio                         │   │   │
│  │  │  └─ Failure class (10 categories)               │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      CRDT STORE                                  │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   GSet      │  │ LWWRegister │  │  PNCounter  │             │
│  │ guardrails  │  │ spec.current│  │budget.tokens│             │
│  │ test.cases  │  │ phase.status│  │             │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│        ▲                                                         │
│        │                                                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Backends: Redis (PNC/LWW) + RocksDB (GSet)             │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Safety Detection Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                MESA-OPTIMIZATION DETECTION                       │
└─────────────────────────────────────────────────────────────────┘

Input: Implementation Code + Specification + Test Results

         │
         ▼
┌─────────────────┐
│ Complexity Est. │──┬── Cyclomatic ──────┐
│                 │  ├── Halstead          │
│                 │  ├── Semantic          ├──► Ensemble Score
│                 │  └── Compression ──────┘
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Spec Coverage   │─── Jaccard Similarity ───► Coverage Ratio
│   Analyzer      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Gaming Detector │─── Pattern matching ─────► Gaming Indicators
│                 │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Suspicion Score │─── Weighted combination:
│   Calculator    │     30% (1 - coverage) +
│                 │     25% low_complexity +
│                 │     20% divergence +
│                 │     25% indicators
└────────┬────────┘
         │
         ├──── suspicion < 0.6 ────► CONTINUE
         │
         ├──── suspicion ≥ 0.6 ────► WARNING
         │                           Log elevated suspicion
         │
         └──── suspicion ≥ 0.8 ────► ESCALATE
                                     Request human review
                                     OR adversarial game
```

## Failure Classification Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                  FAILURE CLASSIFICATION                          │
└─────────────────────────────────────────────────────────────────┘

Input: Error Message + Stack Trace

         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  Regex Pattern Matching (Deterministic, No LLM)          │
│                                                          │
│  SPEC_AMBIGUITY    → ambiguous|unclear|not specified    │
│  CONTEXT_ROT       → context.*?exceed|token limit       │
│  IMPLEMENTATION_ERROR → syntax error|runtime error      │
│  VERIFICATION_FAILURE → assertion failed|test failed    │
│  INFRASTRUCTURE_FAILURE → connection|timeout|memory     │
│  MESA_OPTIMIZATION → gaming|hardcoded|shortcut          │
│  TIMEOUT           → timeout|timed out|deadline         │
│  RESOURCE_EXHAUSTION → out of memory|disk full          │
│  CONTRACT_VIOLATION → precondition|postcondition        │
│  UNCERTAINTY_ESCALATION → uncertain|need clarification  │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Classification Result                                  │
│  ├─ FailureClass (enum)                                 │
│  └─ Confidence Score (0.0 - 1.0)                        │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Causal Fingerprint Generation                          │
│  ├─ Normalize error (lowercase, remove addresses)       │
│  ├─ Combine: role + agent_id + normalized_error         │
│  └─ SHA-256 hash (first 32 chars)                       │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  StructuredFailure                                      │
│  ├─ failure_class: FailureClass                         │
│  ├─ causal_fingerprint: str                             │
│  ├─ agent_role: AgentRole                               │
│  ├─ agent_id: AgentId                                   │
│  ├─ phase: Phase                                        │
│  ├─ error_message: str                                  │
│  ├─ stack_trace: Optional[str]                          │
│  └─ timestamp: datetime                                 │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Store in CRDT (GSet)                                   │
│  Key: guardrails.{module}                               │
│  Value: StructuredFailure (JSON)                        │
└─────────────────────────────────────────────────────────┘
```

## Predicate Validation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              PREDICATE COMPOSITION VALIDATION                    │
└─────────────────────────────────────────────────────────────────┘

Input: Predicate Definitions P1, P2

         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  Extract Infrastructure Requirements                    │
│                                                          │
│  P1: [test_framework: pytest]                           │
│      [coverage_tool: coverage]                          │
│                                                          │
│  P2: [test_framework: pytest]                           │
│      [container_runtime: docker]                        │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Compare Resource Types                                 │
│  ├─ Find shared resource types                          │
│  └─ Check critical property overlap                     │
│                                                          │
│  Shared: test_framework                                  │
│  Properties P1: {assertions, mocking}                   │
│  Properties P2: {fixture_management}                    │
│  Overlap: {}  ← No overlap, OK                          │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ├──── No shared resources ────► OK
                          │
                          ├──── Shared but no property
                          │     overlap ────────────────► OK
                          │
                          └──── Shared + property
                                overlap ──────────────────► ERROR
                                                          │
                                                          ▼
                                        ┌─────────────────┐
                                        │ Raise           │
                                        │ Composition     │
                                        │ Vulnerability   │
                                        │ Error           │
                                        └─────────────────┘
```

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA FLOW IN ENHANCED RALPH                   │
└─────────────────────────────────────────────────────────────────┘

Phase: DISCUSS → PLAN → EXECUTE → VERIFY

EXECUTE Phase (Enhanced Ralph Loop):

  ┌──────────┐
  │  Agent   │──────► Generates Implementation
  └────┬─────┘
       │
       ▼
  ┌──────────┐
  │  Mesa    │──────► Calculates Suspicion Score
  │ Detector │       (Complexity + Coverage + Gaming)
  └────┬─────┘
       │
       ├──── suspicion < 0.6 ────► Continue
       │
       └──── suspicion ≥ 0.8 ────► Human Review
       │
       ▼
  ┌──────────┐
  │ Predicate│──────► Verifies Implementation
  │  Check   │       (Pass/Fail)
  └────┬─────┘
       │
       ├──── PASS ───────────────► Next Phase (VERIFY)
       │
       └──── FAIL ───────────────► Classify & Store
            │
            ▼
       ┌──────────┐
       │ Failure  │──────► FailureClass + Fingerprint
       │ Classifier
       └────┬─────┘
            │
            ▼
       ┌──────────┐
       │  CRDT    │──────► GSet guardrails.{module}
       │  Store   │       Append-only, distributed
       └──────────┘

Key Invariants:
- Mesa detection runs on EVERY iteration
- Failure classification is deterministic (regex, not LLM)
- Guardrails accumulate in GSet (grow-only)
- Causal fingerprints enable near-miss detection
- Predicate validation prevents gaming across layers
```
