# Architecture

## Summary

Ultimate System is a local orchestration stack with direct upstream Paperclip, Hermes, and OpenClaw integrations wrapped by explicit local contracts.

The active layered mapping is:

- Paperclip for company / goal / issue / document / comment synchronization
- Hermes Agent for provider-backed worker execution through the upstream gateway
- OpenClaw for gateway-backed agent execution, tool and skill discovery, and task-scoped session continuity
- Superpowers for spec / plan / slice / TDD / review workflow discipline
- gstack for structured product, engineering, QA, security, and release hardening

The system is composed rather than blended: upstream systems are run as external services, while the control plane, worker, store, and dashboard remain thin local layers around explicit contracts.

## Repository Shape

```text
apps/
  cli/             Terminal User Interface (TUI) for interactive task execution
  control-plane/   Express API and control-plane orchestration boundary
  worker/          BullMQ worker, runtime adapters, and verification command runner
  web/             Vite/React operations dashboard
mcp/               Integrated MCP (Model Context Protocol) servers
packages/
  contracts/       Zod schemas and typed domain contracts
  core/            Interfaces, policies, review gates, orchestration services
  sqlite-store/    Node SQLite persistence and dashboard read model
docs/
  skills/          External agent skills and capabilities
  ADRs/            architecture decisions
  checklists/      neutralized gstack-style review assets
  templates/       Superpowers-style spec and plan templates
scripts/
  setup/dev/test/demo/clean entrypoints
tests/
  API, orchestration, adapter, and end-to-end coverage
```

## Runtime Topology

The supported local stack is seven cooperating services:

1. Redis
2. upstream Paperclip server
3. upstream Hermes gateway
4. upstream OpenClaw gateway
5. control-plane API
6. worker runtime
7. web dashboard

### Control plane

`apps/control-plane` exposes the HTTP boundary, persists to SQLite, enqueues BullMQ jobs, and coordinates direct Paperclip synchronization.

Responsibilities:

- validate task, approval, gate, auth, and user-management input with Zod
- create tasks with approval, idempotency, retry, budget, and capability metadata
- expose dashboard, task, gate, execution, event, memory, and session reads
- persist audit events for lifecycle and gate transitions
- synchronize task creation and status to upstream Paperclip

### Worker runtime

`apps/worker` consumes BullMQ jobs, claims tasks atomically from SQLite, calls the selected adapter, and writes auditable execution state back to the same database.

Responsibilities:

- register the default worker
- emit heartbeats
- drain approved queued tasks into BullMQ on boot
- match tasks to worker capabilities and execution modes
- claim tasks atomically
- run the selected adapter
- persist execution records, memory entries, and session history
- evaluate structured review and release gates
- synchronize completion artifacts and comments back to upstream Paperclip

### Dashboard

`apps/web` is a thin operational console.

Responsibilities:

- poll `/api/state`
- submit tasks
- show selected task detail and worker detail
- surface execution records, gate evidence, audit events, memory, and sessions
- expose approval actions

The UI does not own orchestration logic.

## External Service Topology

### Redis and BullMQ

- Redis is the queue broker
- BullMQ carries the worker jobs
- queue names are per-worker: `ultimate-system.tasks.{workerId}`

### Upstream Paperclip

Started by [scripts/start-paperclip.sh](/home/donovan/Projects/Auto/scripts/start-paperclip.sh) from the pinned checkout in `.cache/upstreams/paperclip`.

Current usage:

- org -> company
- team -> goal
- task -> issue
- worker artifacts -> issue documents
- lifecycle summary -> issue comment

### Upstream Hermes

Started by [scripts/start-hermes.sh](/home/donovan/Projects/Auto/scripts/start-hermes.sh) from the pinned checkout in `.cache/upstreams/hermes-agent`.

Current usage:

- upstream gateway `/v1/responses`
- pinned provider/model resolution
- conversation continuity with persisted response ids
- Docker terminal sandbox for command execution inside Hermes

### Upstream OpenClaw

Started by [scripts/start-openclaw.sh](/home/donovan/Projects/Auto/scripts/start-openclaw.sh) from the pinned checkout in `.cache/upstreams/openclaw`.

Current usage:

- gateway boot and health verification through `GET /healthz` and gateway RPC
- task-scoped `agent` RPC execution from the worker runtime
- skill discovery through `skills list --json`
- tool catalog loading from the built upstream distribution
- task-scoped session keys persisted to `TaskIntegrationRefs.openclaw`
- HTTP session-history retrieval for audit evidence after each run

## Persistence Model

Persistence lives in `packages/sqlite-store` and uses Node 22 `node:sqlite`.

Tables:

- `orgs`
- `teams`
- `workers`
- `tasks`
- `gates`
- `events`
- `memory_entries`
- `worker_sessions`
- `task_executions`
- `users`
- `sessions`

Important persistence behaviors:

- `tasks.idempotency_key` has a unique partial index.
- task claiming is atomic via `UPDATE ... WHERE status = 'queued'`.
- gate saves update both gate rows and the task release decision.
- execution records persist prompts, responses, tool-call summaries, usage, and errors.
- org and worker spend are updated on task completion.
- worker sessions and memory entries persist deterministic, Hermes, and OpenClaw execution context.

`node:sqlite` is still an experimental Node API, so Node emits experimental warnings. The tradeoff is improved portability because setup no longer requires a native SQLite addon.

## Core Contracts

The orchestration layer is intentionally explicit:

- `TaskStore`
- `ExecutionStore`
- `WorkerStore`
- `OrgStore`
- `MemoryStore`
- `BudgetPolicy`
- `ApprovalPolicy`
- `DispatchPolicy`
- `FailurePolicy`
- `WorkerAdapter`
- `ReviewGate`
- `ReleaseGate`
- `EventBus`

These contracts are defined in [interfaces.ts](/home/donovan/Projects/Auto/packages/core/src/interfaces.ts) and implemented by [sqliteStore.ts](/home/donovan/Projects/Auto/packages/sqlite-store/src/sqliteStore.ts), [defaults.ts](/home/donovan/Projects/Auto/packages/core/src/defaults.ts), and the runtime adapters in [runtimeAdapters.ts](/home/donovan/Projects/Auto/apps/worker/src/runtimeAdapters.ts).

## Worker Runtime Modes

### Deterministic mode

`DeterministicRuntimeAdapter` is local and real. It:

- builds a runtime prompt from task, recall, and skills
- runs repository verification commands through the configured runner
- persists structured artifacts derived from those commands
- stores a full execution record
- throws a structured failure if any required command fails

Default verification commands:

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run test`

The supported default backend is Docker.

### Provider-backed mode

Three real provider paths exist:

- `OpenAIResponsesAdapter`
- `HermesResponsesAdapter`
- `OpenClawAgentAdapter`

Both:

- call a real remote responses endpoint
- request structured output
- parse the provider response into typed artifacts
- persist prompt, response, model, usage, and errors
- run the same local verification suite before allowing success

`OpenClawAgentAdapter` differs slightly from the responses-style adapters:

- it invokes the OpenClaw gateway `agent` RPC directly
- it passes an explicit task-scoped session key instead of relying on the CLI default session
- it reads the resulting conversation back through the scoped HTTP session-history endpoint
- it extracts tool-call evidence from OpenClaw message history for auditability

Provider output is treated as untrusted data only. Verification and gates remain authoritative.

## Auth, Governance, and Release Gates

### Auth and approvals

- local identities are stored in SQLite
- passwords are hashed with `scrypt`
- session tokens are hashed before persistence
- `viewer` is read-only
- `requester` can create tasks
- `approver` can approve tasks and override gates
- `admin` can also manage users

### Review and release gates

The worker persists five required gates for every task:

- `product`
- `engineering`
- `qa`
- `security`
- `release`

The release gate also produces a persisted `releaseDecision` with:

- `allowed`
- `reasons`
- `blockingReasons`
- `decidedAt`

See [REVIEW_GATES.md](/home/donovan/Projects/Auto/docs/REVIEW_GATES.md) for the exact rules.

## End-to-End Task Flow

1. `POST /api/tasks` validates the input with `CreateTaskInputSchema`.
2. `TaskCreationService` applies approval policy, creates the task, persists default gates, emits `task.created`, and triggers Paperclip issue creation.
3. The control plane enqueues the approved task to the selected worker queue in BullMQ.
4. The worker consumes the BullMQ job and claims the task atomically.
5. `WorkerRunService` opens a worker session, loads recent memory recall, resolves skills, and invokes the selected adapter.
6. The adapter returns structured artifacts, memory additions, and an auditable execution record, or throws a structured execution failure.
7. The store persists execution records, memory entries, completion state, gate evaluations, and release decision.
8. When OpenClaw executes the task, the worker persists OpenClaw agent, run, session, and gateway references and pulls conversation history back into the execution record.
9. The worker syncs status, spec, plan, and summary comment back to Paperclip.
10. The control plane exposes the resulting read model through `/api/state`, detail endpoints, and OpenClaw insight endpoints.
11. The dashboard renders the task lifecycle, gate evidence, execution transcripts, session history, memory, and the OpenClaw capability surface.

## Portability and Setup

The supported bootstrap path from a clean checkout is:

1. `./scripts/setup.sh`
2. `./scripts/test.sh`
3. `./scripts/demo.sh`
4. `./scripts/dev.sh`

The scripts are the supported public interface for local operation. They pin upstream refs, resolve the repo root, and coordinate Redis, Paperclip, Hermes, OpenClaw, the control plane, the worker, and the dashboard consistently.

## Constraints

- SQLite remains the single control-store implementation.
- Redis is real and distributed, but the shared SQLite file still constrains cross-host deployment.
- Bootstrap identities are local rather than backed by an external identity provider.
- Provider cost is estimated before dispatch and recorded precisely after execution.
- OpenClaw execution is real, but successful generation still depends on the provider/model configured for the local OpenClaw agent.
