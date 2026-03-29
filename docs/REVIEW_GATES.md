# Review Gates

This repository treats review, QA, security, and release as persisted workflow stages with structured rule evidence.

## Gate Inventory

Each task is created with five required gates:

1. `product`
2. `engineering`
3. `qa`
4. `security`
5. `release`

Gates are stored in SQLite and exposed through:

- `GET /api/state`
- `GET /api/tasks/:taskId/gates`
- `GET /api/tasks/:taskId/detail`
- `POST /api/gates/:taskId/:gateType`

## Evidence Schema

Every gate stores:

- `summary`
- `rules[]`
- `generatedAt`

Each rule stores:

- `code`
- `passed`
- `message`

The release gate also persists a `releaseDecision` object on the task:

- `allowed`
- `reasons`
- `blockingReasons`
- `decidedAt`

## Rule Sets

### Product gate

Implemented in `ProductGate`.

Rules:

- `SPEC_PRESENT`
- `PLAN_PRESENT`
- `ACCEPTANCE_CRITERIA_PRESENT`

Pass criteria:

- non-trivial spec exists
- non-trivial plan exists
- acceptance criteria exist

### Engineering gate

Implemented in `EngineeringGate`.

Rules:

- `TASK_SLICES_PRESENT`
- `TDD_NOTES_PRESENT`
- `EXECUTION_SUCCEEDED`
- `NO_BLOCKING_FINDINGS`

Pass criteria:

- task slices exist
- TDD notes exist
- latest execution succeeded
- no high-severity review finding remains

### QA gate

Implemented in `QaGate`.

Rules:

- `API_CHECK_PRESENT`
- `RUNTIME_CHECK_PRESENT`
- `QA_CHECKS_STRUCTURED`

Pass criteria:

- QA evidence includes at least one API check
- QA evidence includes at least one runtime check
- QA checks have structured command and expected fields

### Security gate

Implemented in `SecurityGate`.

Rules:

- `VALIDATION_CONTROL_PRESENT`
- `TRUST_BOUNDARY_CONTROL_PRESENT`
- `AUDIT_CONTROL_PRESENT`
- `ALL_CONTROLS_IMPLEMENTED`

Pass criteria:

- validation controls are declared
- trust-boundary controls are declared
- audit controls are declared
- all declared controls are marked `implemented`

### Release gate

Implemented in `DefaultReleaseGate`.

Rules:

- `PRIOR_GATES_PASSED`
- `TASK_APPROVED`
- `EXECUTION_SUCCEEDED`
- `RELEASE_CHECKLIST_SATISFIED`

Pass criteria:

- all non-release gates passed
- task approval state is `approved`
- latest execution succeeded
- all release checks are `satisfied`

If the release gate passes, the task status is updated to `released`. Otherwise the task remains `completed`.

## Evidence Sources

Gate evaluation reads persisted task artifacts and execution records, not free-form UI state.

Important sources:

- task artifacts persisted during worker execution
- execution record status and usage
- approval state on the task
- release checklist entries inside task artifacts

## Automatic and Manual Paths

### Automatic evaluation

`WorkerRunService.applyGates()` evaluates all gates after a successful execution and persists:

- updated gate rows
- `gate.updated` events
- task release decision

### Manual override

The control plane exposes `POST /api/gates/:taskId/:gateType` for manual gate updates.

Use this only when a human review has stronger evidence than the default worker-generated evidence. Manual overrides are also audit-logged.

## What These Gates Do Not Guarantee

- human code review actually happened
- provider output is truthful by itself
- production rollout safety beyond the local validation stack

The runtime verification commands are sandboxed with Docker by default, but the gate system is still a local governance layer rather than a substitute for a full production change-management process.
