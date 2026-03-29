# Build Log

## 2026-03-27 Hardening Pass

This repo started as a credible local MVP. The first hardening pass replaced fragile native SQLite handling, added lint/typecheck/build/test automation, and established the control-plane, worker, UI, and gate structure that the later direct integrations build on.

## 2026-03-28 Direct Integration Hardening

This section records the transition from a local MVP to a repo that boots and exercises the pinned upstream Paperclip, Hermes, and OpenClaw services for the supported path.

### OpenClaw runtime hardening

- fixed the worker OpenClaw adapter to invoke the gateway `agent` RPC directly instead of depending on implicit CLI session routing
- switched OpenClaw session continuity to explicit task-scoped session keys
- corrected OpenClaw model normalization so bare model names are resolved to explicit provider/model refs
- corrected OpenClaw gateway calls so health checks use explicit repo-local config and history reads use the stable scoped HTTP endpoint
- hardened provider failure handling so plain-text billing/access errors are persisted as real execution failures instead of being misclassified as invalid JSON
- added API and helper tests for the OpenClaw insight surface and task-scoped session behavior
- fixed `start-worker.sh` so caller-supplied worker overrides survive `.env` loading
- changed `./scripts/demo.sh` to use deterministic execution by default and require explicit `DEMO_PROVIDER=...` for provider-backed runs

### Integration and runtime fixes

- Fixed `scripts/start-paperclip.sh` so ambient `DATABASE_URL` and `PG*` variables do not force Paperclip into the wrong database mode.
- Fixed `scripts/stop-stack.sh` so stale worker, API, and Vite child processes are terminated instead of leaking across runs.
- Fixed the Docker command runner so `pnpm` bootstrap works under non-root container execution.
- Fixed the operational scripts to load `.env` consistently.
- Fixed the web canary target to match the actual Vite bind address.
- Tightened provider artifact synthesis so gate-critical evidence comes from real verification results instead of provider-only claims.

### Verified commands

#### Paperclip health

Command:

```bash
./scripts/stop-stack.sh && rm -rf data && mkdir -p data && ./scripts/start-paperclip.sh && curl -fsS http://127.0.0.1:3100/api/health
```

Result:

```json
{"status":"ok","version":"0.3.1","deploymentMode":"local_trusted","deploymentExposure":"private","authReady":true}
```

Exit code: `0`

#### Hermes health

Command:

```bash
./scripts/start-hermes.sh && curl -fsS http://127.0.0.1:8642/health
```

Result:

```json
{"status":"ok","service":"gateway"}
```

Exit code: `0`

#### OpenClaw gateway health

Command:

```bash
./scripts/start-openclaw.sh && curl -fsS http://127.0.0.1:28789/healthz && OPENCLAW_HOME=$(pwd)/data/openclaw-home OPENCLAW_GATEWAY_URL=ws://127.0.0.1:28789 OPENCLAW_GATEWAY_TOKEN=ultimate-system-openclaw-dev-key OPENCLAW_SKIP_CHANNELS=1 node .cache/upstreams/openclaw/openclaw.mjs gateway health --url ws://127.0.0.1:28789 --token ultimate-system-openclaw-dev-key --json
```

Result excerpt:

```json
{
  "healthz": {
    "ok": true,
    "status": "live"
  },
  "gateway": {
    "ok": true,
    "agents": [
      {
        "agentId": "ultimate-system",
        "sessions": {
          "count": 2,
          "recent": [
            {
              "key": "agent:ultimate-system:task:shape-test"
            }
          ]
        }
      }
    ]
  }
}
```

Exit code: `0`

#### OpenClaw model resolution

Command:

```bash
OPENCLAW_HOME=$(pwd)/data/openclaw-home OPENCLAW_GATEWAY_URL=ws://127.0.0.1:28789 OPENCLAW_GATEWAY_TOKEN=ultimate-system-openclaw-dev-key OPENCLAW_SKIP_CHANNELS=1 node .cache/upstreams/openclaw/openclaw.mjs models status --json --agent ultimate-system
```

Result excerpt:

```json
{
  "defaultModel": "openai/gpt-5.4",
  "resolvedDefault": "openai/gpt-5.4",
  "modelConfig": {
    "defaultSource": "agent"
  }
}
```

Exit code: `0`

#### OpenClaw task-scoped history

Command:

```bash
curl -fsS -H 'authorization: Bearer ultimate-system-openclaw-dev-key' -H 'x-openclaw-scopes: operator.read' 'http://127.0.0.1:28789/sessions/agent%3Aultimate-system%3Atask%3Ashape-test/history?limit=5'
```

Result excerpt:

```json
{
  "sessionKey": "agent:ultimate-system:task:shape-test",
  "items": [
    {
      "role": "assistant",
      "model": "gpt-4o-mini",
      "errorMessage": "Your account is not active, please check your billing details on our website."
    }
  ],
  "hasMore": false
}
```

Exit code: `0`

#### OpenClaw websocket history probe failure discovered and corrected

Command:

```bash
OPENCLAW_HOME=$(pwd)/data/openclaw-home OPENCLAW_GATEWAY_URL=ws://127.0.0.1:28789 OPENCLAW_GATEWAY_TOKEN=ultimate-system-openclaw-dev-key OPENCLAW_SKIP_CHANNELS=1 node .cache/upstreams/openclaw/openclaw.mjs gateway call chat.history --url ws://127.0.0.1:28789 --token ultimate-system-openclaw-dev-key --params '{"sessionKey":"agent:ultimate-system:task:shape-test","limit":5}' --json
```

Result excerpt:

```text
Gateway call failed: Error: gateway timeout after 10000ms
```

Exit code: `1`

Resolution:

```text
Switched the worker audit pullback from websocket RPC to OpenClaw's scoped HTTP history endpoint at /sessions/<sessionKey>/history.
```

#### Core workspace gates

Commands:

```bash
npm run lint
npm run typecheck
npm run build
npm run test
```

Result:

```text
lint: exit 0
typecheck: exit 0
build: exit 0
test: Test Files  6 passed (6); Tests  16 passed (16)
```

#### OpenClaw API contract test

Command:

```bash
npm run test -- --run tests/control-plane-api.test.ts
```

Result:

```text
✓ tests/control-plane-api.test.ts (3 tests)
Tests  3 passed (3)
```

#### Historical provider-backed lifecycle

Command:

```bash
DEMO_PROVIDER=hermes ./scripts/demo.sh
```

Result excerpt:

```json
{
  "task": {
    "status": "released",
    "approvalState": "approved",
    "executionMode": "provider"
  },
  "integrationRefs": {
    "paperclip": {
      "issueId": "...",
      "issueIdentifier": "..."
    },
    "hermes": {
      "conversationId": "...",
      "lastResponseId": "..."
    }
  },
  "releaseDecision": {
    "allowed": true
  },
  "executions": [
    {
      "provider": "hermes",
      "model": "gpt-5.4",
      "status": "succeeded"
    }
  ]
}
```

Exit code: `0`

#### Clean-state deterministic demo

Command:

```bash
./scripts/stop-stack.sh && rm -rf data && mkdir -p data && ./scripts/demo.sh
```

Result excerpt:

```json
{
  "task": {
    "status": "released",
    "approvalState": "approved",
    "executionMode": "deterministic"
  },
  "gates": [
    { "gateType": "engineering", "status": "passed" },
    { "gateType": "product", "status": "passed" },
    { "gateType": "qa", "status": "passed" },
    { "gateType": "release", "status": "passed" },
    { "gateType": "security", "status": "passed" }
  ],
  "executions": [
    {
      "adapter": "deterministic-runtime-adapter",
      "provider": "local-runtime",
      "status": "succeeded"
    }
  ],
  "memoryCount": 3,
  "sessionCount": 1
}
```

Exit code: `0`

#### Canary

Command:

```bash
pnpm canary
```

Result excerpt:

```json
{
  "passed": true,
  "checks": [
    { "name": "api-health-pass-1", "ok": true },
    { "name": "api-state-pass-1", "ok": true },
    { "name": "web-root-pass-1", "ok": true },
    { "name": "paperclip-health-pass-1", "ok": true },
    { "name": "hermes-health-pass-1", "ok": true }
  ]
}
```

Exit code: `0`

#### Benchmark

Command:

```bash
pnpm benchmark
```

Result excerpt:

```json
{
  "passed": true,
  "reports": [
    { "name": "api-health", "p95Ms": 10.21 },
    { "name": "api-state", "p95Ms": 11.87 },
    { "name": "web-root", "p95Ms": 13.25 },
    { "name": "paperclip-health", "p95Ms": 10.06 },
    { "name": "hermes-health", "p95Ms": 7.08 }
  ]
}
```

Exit code: `0`

#### Release automation

Command:

```bash
pnpm release:local
```

Result excerpt:

```json
{
  "allowed": true,
  "reasons": [
    "redis passed",
    "paperclip passed",
    "hermes passed",
    "control-plane passed",
    "worker passed",
    "web passed",
    "lint passed",
    "typecheck passed",
    "build passed",
    "test passed",
    "canary passed",
    "benchmark passed"
  ]
}
```

Exit code: `0`
