# Ultimate System

**New here, an executive, or supporting non-technical teammates?** Start with the **[Definitive User Manual](docs/USER_MANUAL.md)**. It provides a comprehensive, cumulative, consolidated, coherent, and cohesive guide detailing real-world enterprise use cases, workflow instructions, architecture, integration layers, and security mechanisms.

Ultimate System is a pinned-integration monorepo that composes five upstream projects into one local orchestration stack:

- `paperclipai/paperclip` for company, goal, issue, comment, and document sync
- `NousResearch/hermes-agent` for gateway-backed model execution and session continuity
- `hire/openclaw` for gateway-backed agent skills, tool surface, and task-scoped sessions
- `obra/superpowers` for the execution discipline encoded in templates and workflow
- `garrytan/gstack` for product, engineering, QA, security, and release hardening patterns

This repository is not a thought exercise or a demo scaffold. The supported path boots real upstream Paperclip, Hermes, and OpenClaw services from pinned checkouts, routes work through Redis-backed BullMQ queues, persists state in SQLite, runs verification in Docker, and exposes the full lifecycle through an authenticated premium control plane and immersive dashboard.

## 0. Build & Engineering Protocol (RALPH)

All contributions and system modifications follow the **RALPH Build Protocol**:
- **Retry**: Robust error handling and automatic retry logic.
- **Assess**: Pre-flight audits and impact analysis before changes.
- **Log**: Comprehensive logging of build gates and runtime events.
- **Prove**: Verifiable proof via terminal output for every task completion.
- **Harden**: Zero-trust security, strict input validation (Zod), and RBAC enforcement.

Refer to `AGENTS.md` and `PROGRESS_TRACKER.md` for the current system state and audit trails.

## 1. What This System Does

At a high level, Ultimate System lets you:

1. create work in the control plane (Manual or AI-assisted via Chat)
2. approve or reject it with role-backed identity (RBAC)
3. route it to a worker through Redis + BullMQ
4. execute it through a deterministic or provider-backed runtime with **secure, sandboxed command execution** and **dynamic markdown-based skill loading**
5. persist memory, sessions, executions, events, gate evidence, and release decisions
6. synchronize work artifacts and lifecycle state to upstream Paperclip
7. inspect the entire lifecycle in an **Ultra-Premium Obsidian Glass Dashboard** with high-fidelity visualizations and real-time chat control

## 2. System Knowledge Graph

This is the mental model for the repo and the running system.

```text
Org
  ├── Team[]
  │     └── Worker[]
  │            ├── WorkerSession[]
  │            ├── MemoryEntry[]
  │            └── BullMQ queue: ultimate-system.tasks.{workerId}
  └── Task[]
         ├── GateRecord[product, engineering, qa, security, release]
         ├── TaskEvent[]
         ├── ExecutionRecord[]
         ├── TaskArtifacts
         ├── ReleaseDecision
         └── TaskIntegrationRefs
                ├── PaperclipTaskRef
                ├── HermesTaskRef
                └── OpenClawTaskRef
```

### Entity semantics

| Entity | Meaning | Source of truth |
|---|---|---|
| `Org` | top-level budget and mission boundary | SQLite |
| `Team` | delivery scope inside the org | SQLite |
| `WorkerRecord` | executable runtime identity with capabilities and budgets | SQLite |
| `TaskRecord` | work request plus approval, routing, and release state | SQLite |
| `GateRecord` | persisted workflow stage result | SQLite |
| `ExecutionRecord` | auditable execution transcript | SQLite |
| `WorkerSession` | one worker run session with start/end state | SQLite |
| `MemoryEntry` | searchable worker memory | SQLite |
| `TaskIntegrationRefs.paperclip` | links to upstream Paperclip company/goal/issue | SQLite |
| `TaskIntegrationRefs.hermes` | Hermes conversation and response references | SQLite |
| `TaskIntegrationRefs.openclaw` | OpenClaw agent, run, session, and gateway references | SQLite |

### End-to-end execution graph

```text
Browser/API client
  -> Control plane
  -> SQLite + BullMQ enqueue
  -> Worker dequeues job
  -> Worker claims task atomically
  -> Runtime adapter executes
  -> Verification suite runs in Docker
  -> Execution/memory/sessions/gates persisted
  -> Paperclip issue updated
  -> Dashboard/API expose resulting state
```

## 3. Runtime Topology

The supported local stack is seven active services plus a shared store:

1. Redis
2. upstream Paperclip server
3. upstream Hermes gateway
4. upstream OpenClaw gateway
5. control-plane API
6. worker runtime
7. web dashboard
8. shared SQLite control store

### Live endpoints

- **unified access point: `http://localhost:8888`** (recommended)
- control plane: `http://localhost:4100`
- web dashboard: `http://localhost:4173`
- Paperclip API: `http://127.0.0.1:3100`
- Hermes gateway: `http://127.0.0.1:8642`
- OpenClaw gateway: `ws://127.0.0.1:28789`
- OpenClaw health: `http://127.0.0.1:28789/healthz`
- Redis queue: `redis://127.0.0.1:6380`

**Note:** The unified access point provides both the dashboard and API on a single port. All features are available through `http://localhost:8888`.

## 4. Repository Map

```text
apps/
  cli/             Terminal User Interface (TUI) for interactive task execution
  control-plane/   Express API, auth, approvals, queue producer, Paperclip sync
  unified/         Unified server serving dashboard + API on a single port
  worker/          BullMQ consumer, runtime adapters, verification runner
  web/             Vite/React operational dashboard
mcp/               Integrated MCP (Model Context Protocol) servers
packages/
  contracts/       Zod schemas and typed domain language
  core/            Policies, interfaces, services, Paperclip client, gate logic
  sqlite-store/    SQLite schema, mappers, stores, read model
docs/
  skills/          External agent skills and capabilities
  ADRs/            architecture decisions
  checklists/      neutralized gstack-derived review assets
  templates/       Superpowers-aligned spec/plan templates
scripts/
  setup/dev/test/demo/clean/start/stop entrypoints
  start-unified.sh  Start all services with unified access point
tests/
  API, orchestration, adapter, and end-to-end verification
infra/
  upstream-lock.json  pinned upstream refs
```

## 5. Upstream Pins

Pinned refs live in [infra/upstream-lock.json](/home/donovan/Projects/Auto/infra/upstream-lock.json):

- Paperclip: `0ac01a04e5a83e487ee5069338f8fbe91ed445af`
- Hermes Agent: `b6b87dedd4acdee8d8dca32062fc45edcb049a69`
- gstack: `11695e3acafe16d5a524ce37c243714b9eb6d154`
- Superpowers: `eafe962b18f6c5dc70fb7c8cc7e83e61f4cdde06`

## 6. Clean-Clone Quickstart

### Requirements

- Node.js 22+
- `pnpm` 10+
- `git`
- Python 3.11 + `uv`
- Docker

Docker is required for the worker and Hermes terminal sandboxes. It is also used as the Redis fallback when `redis-server` is not installed locally.

### Standard bootstrap path

```bash
./scripts/setup.sh
./scripts/test.sh
./scripts/demo.sh
./scripts/dev.sh
```

### What `setup.sh` does

- clones or refreshes the pinned upstream repositories into `.cache/upstreams`
- creates `.env` from `.env.example` if needed
- installs the workspace dependencies
- installs and builds the upstream Paperclip server packages
- creates the Hermes virtual environment and installs Hermes Agent in editable mode
- installs and builds the pinned OpenClaw checkout used by the worker and control plane

## 7. Default Local Accounts

The checked-in defaults live in [.env.example](/home/donovan/Projects/Auto/.env.example), but the running stack uses your local [.env](/home/donovan/Projects/Auto/.env) if it exists.

- admin: `admin@ultimate-system.local` / `change-this-password`
- requester: `requester@ultimate-system.local` / `requester-password`
- approver: `approver@ultimate-system.local` / `approver-password`
- viewer: `viewer@ultimate-system.local` / `viewer-password`

### Passkeys and biometrics

The control plane supports real WebAuthn passkeys. On a supported browser and secure origin, users can:

- sign in with a passkey instead of a password
- enroll a new passkey from the signed-in workspace
- remove old passkeys from the Account and Access panel

For local development the default relying-party settings are:

- `AUTH_RP_NAME=Ultimate System`
- `AUTH_RP_IDS=localhost`
- `AUTH_ORIGINS=http://localhost:4173`

When you deploy the web app to Vercel, GitHub Pages, or a custom host, update those values to match the actual browser origin and hostname.

### Role model

| Role | Can read | Can create tasks | Can approve tasks | Can override gates | Can manage users |
|---|---|---:|---:|---:|---:|
| `viewer` | yes | no | no | no | no |
| `requester` | yes | yes | no | no | no |
| `approver` | yes | yes | yes | yes | no |
| `admin` | yes | yes | yes | yes | yes |

## 8. Operator Workflows

### Workflow A: Full-stack local run (Unified Access)

```bash
./scripts/unified
```

Then:

1. open `http://localhost:8888` (single URL for everything)
2. log in with one of the local accounts
3. create a task
4. approve it as an `approver` or `admin`
5. watch the task move through `queued -> running -> completed/released`

The unified server provides both the dashboard and API on port 8888. The dashboard automatically discovers the API at the same origin.

### Workflow B: Traditional multi-port run

```bash
./scripts/dev.sh
```

Then:

1. open `http://localhost:4173`
2. log in with one of the local accounts
3. create a task
4. approve it as an `approver` or `admin`
5. watch the task move through `queued -> running -> completed/released`

### Workflow D: One-command lifecycle proof

```bash
./scripts/demo.sh
```

This:

- stops stale processes
- starts Redis, Paperclip, Hermes, OpenClaw, the control plane, the worker, and the web app
- logs into the control plane
- creates and approves a real deterministic task by default
- waits for real worker execution through the configured runtime
- prints the resulting task, gate, execution, memory, and integration state as JSON

Provider-backed variants stay available explicitly:

```bash
DEMO_PROVIDER=hermes ./scripts/demo.sh
DEMO_PROVIDER=openclaw ./scripts/demo.sh
```

### Workflow E: Release gate proof

```bash
pnpm release:local
```

This:

- starts missing services
- runs lint, typecheck, build, and test
- runs canary and benchmark checks
- writes `data/release-decision.json`
- exits non-zero if any step fails

## 9. OpenClaw Runtime Surface

OpenClaw is integrated in two places:

- control-plane insight endpoints:
  - `GET /api/openclaw/status`
  - `GET /api/openclaw/skills`
  - `GET /api/openclaw/tools`
- worker provider runtime:
  - `WORKER_PROVIDER=openclaw`
  - `OpenClawAgentAdapter` in [apps/worker/src/runtimeAdapters.ts](/home/donovan/Projects/Auto/apps/worker/src/runtimeAdapters.ts)

The worker does not rely on the OpenClaw CLI's implicit `main` session routing. It calls the OpenClaw gateway `agent` RPC with an explicit task-scoped session key:

```text
agent:<agentId>:task:<taskId>
```

That session key is persisted into `TaskIntegrationRefs.openclaw` and later reused against OpenClaw's scoped HTTP session-history endpoint so tool activity remains auditable.

## 10. Web Deployment

The web app is a static Vite build. It can be deployed independently to Vercel or GitHub Pages as long as it can reach a live control-plane API.

### Runtime API resolution

The dashboard resolves its API base in this order:

1. `window.__ULTIMATE_SYSTEM_API_BASE_URL__`
2. `localStorage["ultimate-system.api-base"]`
3. `VITE_API_BASE_URL`
4. current origin for non-localhost deployments
5. `http://localhost:4100` as the local fallback

That means the deployed frontend does not need secrets baked into the bundle. Operators can point the UI at a reachable control plane from the login screen.

### Vercel

- Config file: [vercel.json](/home/donovan/Projects/Auto/vercel.json)
- Framework target: Vite
- Build output: `apps/web/dist`

Typical deploy flow:

```bash
pnpm install --frozen-lockfile
pnpm --filter @ultimate-system/web build
```

Set this environment variable in Vercel when the API is not same-origin:

- `VITE_API_BASE_URL=https://your-control-plane.example.com`

### GitHub Pages

- Workflow file: [.github/workflows/web-pages.yml](/home/donovan/Projects/Auto/.github/workflows/web-pages.yml)
- Uses `VITE_BASE_PATH=/<repo-name>/` for project pages
- Reads `VITE_API_BASE_URL` from GitHub Actions repository variables

Required repository configuration:

1. Enable GitHub Pages with GitHub Actions as the source.
2. Add repository variable `VITE_API_BASE_URL`.
3. Ensure the control-plane API is reachable from the public Pages site and allows credentialed CORS for that origin.

## 11. API Quick Reference

### Health and state

- `GET /api/health`
- `GET /api/state`

### Auth

- `POST /api/auth/login`
- `POST /api/auth/passkeys/login/options`
- `POST /api/auth/passkeys/login/verify`
- `GET /api/auth/passkeys`
- `POST /api/auth/passkeys/register/options`
- `POST /api/auth/passkeys/register/verify`
- `DELETE /api/auth/passkeys/:credentialId`
- `POST /api/auth/logout`
- `GET /api/auth/session`

### Tasks

- `GET /api/tasks`
- `GET /api/tasks/:taskId`
- `GET /api/tasks/:taskId/detail`
- `GET /api/tasks/:taskId/events`
- `GET /api/tasks/:taskId/executions`
- `GET /api/tasks/:taskId/gates`
- `POST /api/tasks`
- `POST /api/tasks/:taskId/approval`
- `POST /api/gates/:taskId/:gateType`

### Workers

- `GET /api/workers`
- `GET /api/workers/:workerId`
- `GET /api/workers/:workerId/detail`
- `GET /api/workers/:workerId/memory`
- `GET /api/workers/:workerId/sessions`

### OpenClaw insight

- `GET /api/openclaw/status`
- `GET /api/openclaw/skills`
- `GET /api/openclaw/tools`

### Curl example

```bash
curl -i \
  -c /tmp/ultimate-system.cookies \
  -H 'content-type: application/json' \
  -d '{"email":"admin@ultimate-system.local","password":"change-this-password"}' \
  http://localhost:4100/api/auth/login

curl -i \
  -b /tmp/ultimate-system.cookies \
  -H 'content-type: application/json' \
  -d '{
    "title":"Ship a provider-backed lifecycle",
    "description":"Create, approve, run, gate, and release one task.",
    "requestedBy":"readme",
    "executionMode":"provider",
    "budgetCapUsd":25,
    "requiredCapabilities":["planning","review","qa","security","release"]
  }' \
  http://localhost:4100/api/tasks
```

## 12. Domain Reference

### Task statuses

- `queued`
- `dispatched`
- `running`
- `completed`
- `released`
- `failed`

### Approval states

- `pending`
- `approved`
- `rejected`

### Execution modes

- `deterministic`
- `provider`

### Gate types

- `product`
- `engineering`
- `qa`
- `security`
- `release`

### Event types

- `task.created`
- `task.claimed`
- `task.started`
- `task.completed`
- `task.released`
- `task.failed`
- `task.retry_scheduled`
- `task.approval_updated`
- `worker.registered`
- `worker.heartbeat`
- `memory.appended`
- `gate.updated`
- `execution.recorded`

## 13. What Is Real Right Now

### Directly integrated

- upstream Paperclip server
- upstream Hermes gateway
- upstream OpenClaw gateway, skills catalog, tool catalog, and agent RPC
- BullMQ + Redis queueing
- cookie-session auth and role-backed approvals
- Docker-backed worker verification
- Docker-backed Hermes terminal execution
- release automation through `pnpm canary`, `pnpm benchmark`, and `pnpm release:local`

### Composed on purpose

- Superpowers is integrated as workflow discipline and templates, not a runtime package
- gstack is integrated as review assets, gate logic, and automation, not Claude-only slash commands

### No demo-only runtime path

The supported execution path does not rely on mock queues, mock providers, or placeholder integrations. Deterministic mode is real local verification. Provider mode is real remote execution followed by real local verification.

OpenClaw generation still depends on the provider/model configured for the local OpenClaw agent. The runtime path, task-scoped session routing, and history capture are real even when a provider account blocks generation.

## 14. Code Navigation Guide

When you need to answer “where does this live?”, start here:

| Question | Start here |
|---|---|
| task lifecycle, retries, budgets, approvals | [packages/core/src/services.ts](/home/donovan/Projects/Auto/packages/core/src/services.ts) |
| gate logic and policy defaults | [packages/core/src/defaults.ts](/home/donovan/Projects/Auto/packages/core/src/defaults.ts) |
| domain types and schemas | [packages/contracts/src/domain.ts](/home/donovan/Projects/Auto/packages/contracts/src/domain.ts) |
| persistence, queries, atomic claims | [packages/sqlite-store/src/sqliteStore.ts](/home/donovan/Projects/Auto/packages/sqlite-store/src/sqliteStore.ts) |
| auth, login, session cookies, RBAC | [apps/control-plane/src/auth.ts](/home/donovan/Projects/Auto/apps/control-plane/src/auth.ts) |
| HTTP routes and Paperclip sync | [apps/control-plane/src/app.ts](/home/donovan/Projects/Auto/apps/control-plane/src/app.ts) |
| runtime adapters and provider execution | [apps/worker/src/runtimeAdapters.ts](/home/donovan/Projects/Auto/apps/worker/src/runtimeAdapters.ts) |
| sandboxed verification runner | [apps/worker/src/commandRunner.ts](/home/donovan/Projects/Auto/apps/worker/src/commandRunner.ts) |
| dashboard behavior | [apps/web/src/App.tsx](/home/donovan/Projects/Auto/apps/web/src/App.tsx) |
| upstream pinning | [infra/upstream-lock.json](/home/donovan/Projects/Auto/infra/upstream-lock.json) |

## 15. Troubleshooting

### `setup.sh` fails because Hermes cannot install

Check:

- Python 3.11 is installed
- `uv` is installed

### `demo.sh` or `dev.sh` fails because ports are busy

Run:

```bash
./scripts/stop-stack.sh
```

Then retry.

### Paperclip starts in the wrong database mode

The startup script now scrubs ambient `DATABASE_URL` and `PG*` variables before booting Paperclip. If you changed that script, re-check [scripts/start-paperclip.sh](/home/donovan/Projects/Auto/scripts/start-paperclip.sh).

### Worker verification fails inside Docker because `pnpm` is missing

The Docker runner bootstraps `corepack` and `pnpm` explicitly. Check [apps/worker/src/commandRunner.ts](/home/donovan/Projects/Auto/apps/worker/src/commandRunner.ts) if this regresses.

### Canary hits the wrong web host

The supported default is `http://localhost:4173`, not `127.0.0.1:4173`. See [scripts/canary.ts](/home/donovan/Projects/Auto/scripts/canary.ts).

## 16. Verification Commands

```bash
npm run lint
npm run typecheck
npm run build
npm run test
pnpm canary
pnpm benchmark
pnpm release:local
```

## 17. Cleanup

```bash
./scripts/stop-stack.sh
npm run clean
```

`npm run clean` removes generated artifacts such as `node_modules`, `dist`, `data`, `*.tsbuildinfo`, and preflight logs. The pinned upstream checkouts in `.cache/upstreams` are intentionally retained.

## 18. Deeper Docs

- [docs/ARCHITECTURE.md](/home/donovan/Projects/Auto/docs/ARCHITECTURE.md)
- [docs/RUNBOOK.md](/home/donovan/Projects/Auto/docs/RUNBOOK.md)
- [docs/INTEGRATION_STATUS.md](/home/donovan/Projects/Auto/docs/INTEGRATION_STATUS.md)
- [docs/REVIEW_GATES.md](/home/donovan/Projects/Auto/docs/REVIEW_GATES.md)
- [docs/SECURITY_MODEL.md](/home/donovan/Projects/Auto/docs/SECURITY_MODEL.md)
- [docs/OPEN_GAPS.md](/home/donovan/Projects/Auto/docs/OPEN_GAPS.md)
- [AGENTS.md](/home/donovan/Projects/Auto/AGENTS.md)
# Auto
