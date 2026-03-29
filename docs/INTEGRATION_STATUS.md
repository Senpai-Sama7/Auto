# Integration Status

This file is intentionally blunt about what is actually wired today.

## Directly Integrated

### Upstream Paperclip

- pinned checkout in `.cache/upstreams/paperclip`
- local server booted by [scripts/start-paperclip.sh](/home/donovan/Projects/Auto/scripts/start-paperclip.sh)
- health-checked at `GET /api/health`
- company sync from org metadata
- goal sync from team metadata
- issue creation on task creation
- issue status updates from task lifecycle transitions
- spec and plan documents synced from worker artifacts
- status comments posted from worker completion and release data

### Upstream Hermes Agent

- pinned checkout in `.cache/upstreams/hermes-agent`
- gateway booted by [scripts/start-hermes.sh](/home/donovan/Projects/Auto/scripts/start-hermes.sh)
- health-checked at `GET /health`
- `HermesResponsesAdapter` calling upstream `/v1/responses`
- conversation continuity persisted through `TaskIntegrationRefs.hermes`
- Docker-backed terminal sandbox configured in Hermes `config.yaml`

### Upstream OpenClaw

- pinned checkout in `.cache/upstreams/openclaw`
- gateway booted by [scripts/start-openclaw.sh](/home/donovan/Projects/Auto/scripts/start-openclaw.sh)
- health-checked through gateway RPC and `GET /healthz`
- control-plane insight endpoints expose real gateway status, skills, and tool catalog
- `OpenClawAgentAdapter` invokes the gateway `agent` RPC directly instead of relying on implicit CLI session routing
- task-scoped session keys persisted through `TaskIntegrationRefs.openclaw`
- OpenClaw session history pulled back through the scoped HTTP history endpoint for auditability

### Auth, governance, and task routing

- cookie-session auth in [apps/control-plane/src/auth.ts](/home/donovan/Projects/Auto/apps/control-plane/src/auth.ts)
- identity-backed RBAC with `viewer`, `requester`, `approver`, and `admin`
- approval transitions enforced by role
- idempotent task creation
- capability-aware worker selection
- bounded retry policy
- persisted audit events and release decisions

### Queueing and coordination

- BullMQ + Redis queueing
- per-worker queues named `ultimate-system.tasks.{workerId}`
- worker dequeue through BullMQ
- atomic task claim in SQLite to prevent double execution
- multi-worker coordination against the shared queue and shared control-store file

### Sandboxed execution

- worker verification commands run through Docker by default
- Hermes terminal backend also uses Docker
- shell mode still exists, but the supported default in `.env.example` is Docker

### Release automation

- `pnpm canary`
- `pnpm benchmark`
- `pnpm release:local`
- release decision persisted to `data/release-decision.json`

## Composed, Not Embedded

### Superpowers

Superpowers is integrated as workflow discipline, not as a runtime package:

- spec and plan templates in `docs/templates`
- skill phases and task slices in the typed domain model
- orchestration flow enforcing spec -> plan -> slice -> verify -> review -> release evidence

### gstack

gstack is integrated as neutralized hardening assets and gate logic:

- review checklists in `docs/checklists`
- persisted product / engineering / QA / security / release gates
- canary, benchmark, and release scripts

## No Deliberate Simulation In The Runtime Path

The active task path does not rely on mock queues, mock providers, manufactured gate pass conditions, or placeholder integrations. Deterministic mode is real local verification. Provider mode is real remote execution followed by real local verification.

## Operational Limits

- The control store is a shared SQLite file, so cross-host deployment still needs a shared filesystem or a different store implementation.
- Bootstrap identities are local SQLite users, not an external IdP.
- Pre-dispatch provider cost is still estimated before the actual execution record is written.
- Audit history is stored locally; there is no external SIEM or signed ledger.
- OpenClaw generation still depends on the configured provider credentials and model access for the local OpenClaw agent.
