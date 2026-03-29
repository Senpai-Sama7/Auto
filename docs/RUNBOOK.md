# Runbook

## Prerequisites

- Node.js 22 or newer
- `pnpm` 10 or newer
- `git`
- Python 3.11
- `uv`
- Docker

Docker is required for the supported sandboxed verification path and for Hermes' terminal backend. Redis can be provided by a local `redis-server` binary or by Docker.

## Clean Boot

From a clean checkout:

```bash
./scripts/setup.sh
```

What it does:

- clones and pins upstream Paperclip, Hermes Agent, gstack, and Superpowers into `.cache/upstreams`
- creates `.env` from `.env.example` if missing
- installs the workspace dependencies
- installs upstream Paperclip dependencies and builds the server packages if needed
- creates the Hermes virtualenv and installs Hermes Agent in editable mode
- installs and builds the pinned OpenClaw checkout used by the control plane and worker

## Full Validation

```bash
./scripts/test.sh
```

That runs:

```bash
./scripts/start-redis.sh
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

## Demo

```bash
./scripts/demo.sh
```

The demo:

- stops any stale local stack processes
- starts Redis, Paperclip, Hermes, OpenClaw, the control plane, the worker, and the web app
- logs into the control plane
- creates and approves a deterministic task by default
- waits for the worker to execute through the configured real runtime
- prints a JSON summary with task status, gate results, execution metadata, memory counts, and integration references

Provider-backed demo variants are explicit:

```bash
DEMO_PROVIDER=hermes ./scripts/demo.sh
DEMO_PROVIDER=openclaw ./scripts/demo.sh
```

## Development Stack

```bash
./scripts/dev.sh
```

Services:

- Redis: `redis://127.0.0.1:6380`
- Paperclip: `http://127.0.0.1:3100`
- Hermes: `http://127.0.0.1:8642`
- OpenClaw: `ws://127.0.0.1:28789`
- control plane: `http://localhost:4100`
- web dashboard: `http://localhost:4173`
- worker runtime: background BullMQ consumer against the shared SQLite store

## Release Automation

```bash
pnpm canary
pnpm benchmark
pnpm release:local
```

- `pnpm canary` verifies API, state, web, Paperclip health, and Hermes health across multiple passes.
- `pnpm benchmark` samples API, web, Paperclip, and Hermes latency against thresholds.
- `pnpm release:local` starts missing services, runs lint/typecheck/build/test/canary/benchmark, writes `data/release-decision.json`, and exits non-zero if any step fails.

## Environment

The default [.env.example](/home/donovan/Projects/Auto/.env.example) supports:

- `API_PORT`
- `WEB_PORT`
- `VITE_API_BASE_URL`
- `REDIS_URL`
- `WORKER_EXECUTION_MODE`
- `WORKER_PROVIDER`
- `WORKER_VERIFICATION_BACKEND`
- `ULTIMATE_SYSTEM_DATA_DIR`
- `ULTIMATE_SYSTEM_DB_PATH`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_RESPONSES_URL`
- `HERMES_API_HOST`
- `HERMES_API_PORT`
- `HERMES_API_KEY`
- `OPENCLAW_GATEWAY_HOST`
- `OPENCLAW_GATEWAY_PORT`
- `OPENCLAW_GATEWAY_TOKEN`
- `OPENCLAW_HOME_DIR`
- `OPENCLAW_AGENT_ID`
- `OPENCLAW_AGENT_MODEL`
- `PAPERCLIP_URL`

Hermes provider resolution is:

1. explicit `HERMES_INFERENCE_PROVIDER`
2. `~/.codex/auth.json` -> `openai-codex`
3. `OPENAI_API_KEY` or `OPENAI_BASE_URL` -> `custom`
4. `ANTHROPIC_API_KEY` -> `anthropic`

`WORKER_EXECUTION_MODE` values:

- `deterministic`
- `provider`

`WORKER_PROVIDER` values:

- `deterministic`
- `openai`
- `hermes`
- `openclaw`

`WORKER_VERIFICATION_BACKEND` values:

- `docker`
- `shell`

## Default Local Accounts

- admin: `DouglasMitchell@ReliantAI.org` / `Hiphop12!`
- requester: `requester@ultimate-system.local` / `requester-password`
- approver: `approver@ultimate-system.local` / `approver-password`
- viewer: `viewer@ultimate-system.local` / `viewer-password`

## Useful Commands

```bash
./scripts/stop-stack.sh
npm run clean
npm run lint
npm run typecheck
npm run build
npm run test
pnpm demo
pnpm canary
pnpm benchmark
pnpm release:local
```

`npm run clean` removes local runtime and build artifacts, including `node_modules`, `dist`, `*.tsbuildinfo`, `data`, and preflight logs. The upstream checkouts in `.cache/upstreams` remain in place.

## API Surface

### Health and dashboard

- `GET /api/health`
- `GET /api/state`

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

## Operational Notes

- The API and worker resolve the repo root internally before resolving the database path. Running them under `pnpm --filter` still targets the same database.
- The supported verification path is Docker-backed. Shell execution is still available for local debugging.
- Provider-backed execution still requires local verification commands to pass before the task can succeed.
- OpenClaw sessions are task-scoped and persisted into the task integration refs rather than relying on a shared default session.
- OpenClaw generation still depends on whichever provider/model the local OpenClaw agent can actually access.
- `./scripts/stop-stack.sh` is the supported way to clear stale local Redis, Paperclip, Hermes, OpenClaw, control-plane, worker, and web processes before a fresh run.
