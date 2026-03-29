# Claude Agent Context: Ultimate System

Canonical repo context lives in [AGENTS.md](./AGENTS.md).

Read `AGENTS.md` first — it is the primary intelligence file for all agents. This file provides Claude-specific guidance for making high-quality contributions to this repository.

## Stack Summary

```
pnpm workspaces | TypeScript ESM | Node 22 | node:sqlite | Express 5 | BullMQ | Vite/React
```

```text
apps/cli           → Terminal User Interface (TUI) for interactive task execution
apps/control-plane → Express HTTP API + BullMQ producer
apps/worker        → BullMQ consumer + WorkerAdapter (deterministic | openai | hermes)
apps/web           → React/Vite operational dashboard
mcp/               → Integrated Model Context Protocol servers
packages/contracts → Single source of truth for all domain types (Zod schemas)
packages/core      → Business logic, interfaces, policies, services
packages/sqlite-store → SqlitePlatformStore (node:sqlite built-in, no native addons)
```

## How to Start Working

```bash
# From a clean checkout
./scripts/setup.sh    # Install deps, build packages, seed DB, seed admin user

# Run the full stack
./scripts/dev.sh      # Starts control-plane (4100), worker, and web (4173)

# Run all checks
./scripts/test.sh     # lint + typecheck + build + vitest
```

## Decision Framework for Common Requests

When asked to add or change something, pick the right layer:

| Request type | Start here | Then propagate to |
|---|---|---|
| New domain field or enum | `packages/contracts/src/domain.ts` | migrations.ts → sqliteStore.ts → API/service/UI |
| New API endpoint | `apps/control-plane/src/app.ts` | Zod validation → requireUser/requireApprover |
| New gate logic | `packages/core/src/defaults.ts` | `createDefaultGates()` → interface in `interfaces.ts` |
| New approval or budget rule | `packages/core/src/defaults.ts` | `TaskCreationService` if threshold changes |
| New runtime provider | `apps/worker/src/runtimeAdapters.ts` | `createWorkerAdapterFromEnv()` → `env.ts` → `.env.example` |
| New memory or session behavior | `packages/sqlite-store/src/sqliteStore.ts` | `MemoryStore` interface in `interfaces.ts` |
| New orchestration behavior | `packages/core/src/services.ts` | `WorkerRunService.executeClaimedTask()` |
| UI change | `apps/web/src/App.tsx`, `styles.css` | Maintain existing design tokens |

## Critical Code Invariants

These must be preserved in all changes:

1. **`claimTask()` is atomic** — `WHERE status = 'queued'` guarantees single-worker ownership. Do not change this condition.
2. **`BEGIN IMMEDIATE` for all writes that span multiple tables** — see `createTask()`, `completeTask()`, `saveGates()`.
3. **`WorkerExecutionFailure` must carry an `ExecutionRecord`** — `WorkerRunService.executeClaimedTask()` catches it and persists partial records. Never throw plain `Error` from a `WorkerAdapter`.
4. **Gate status transitions are additive** — `saveGates()` writes all 5 gates in one transaction.
5. **Paperclip sync is optional** — `PaperclipClient` failures during task creation return `502` to the caller (task is failed), not silently swallowed.
6. **`nowIso()` is the canonical timestamp function** — do not use `new Date().toISOString()` in service or store code.

## Key Type Relationships

```
TaskRecord
  .status          → TaskStatus (queued|dispatched|running|completed|released|failed)
  .approvalState   → ApprovalState (pending|approved|rejected)
  .executionMode   → ExecutionMode (deterministic|provider)
  .artifacts       → TaskArtifacts | null
  .integrationRefs → TaskIntegrationRefs | null  (paperclip + hermes refs)
  .releaseDecision → ReleaseDecision | null

GateRecord.gateType → GateType (product|engineering|qa|security|release)
GateRecord.status   → GateStatus (pending|passed|blocked|failed)

WorkerExecutionInput  = { task, worker, recall: MemoryEntry[], skills: SkillDefinition[] }
WorkerExecutionResult = { summary, artifacts, memoryAdditions, execution, integrationRefs, estimatedCostUsd, actualCostUsd }
```

## Policy Defaults (reference these before proposing policy changes)

| Policy | Class | Key threshold |
|---|---|---|
| Approval | `DefaultApprovalPolicy` | Auto-approve if deterministic AND budgetCapUsd ≤ $50 |
| Budget estimation | `ConservativeBudgetPolicy` | `(title.length + desc.length + 600) / 4` input tokens + 1200 output tokens |
| Budget guard | `ConservativeBudgetPolicy.canDispatch()` | Blocks if task cap, worker monthly, or org monthly would be exceeded |
| Dispatch | `CapabilityDispatchPolicy` | Worker must have all `requiredCapabilities`; must support `executionMode` |
| Retry | `BoundedRetryPolicy` | `retryCount <= maxRetries` → re-queue; exhausted → failed |
| Release | `DefaultReleaseGate` | PRIOR_GATES_PASSED + TASK_APPROVED + EXECUTION_SUCCEEDED + RELEASE_CHECKLIST_SATISFIED |

## Testing Conventions

All tests use isolated SQLite databases. Standard pattern:

```typescript
import { createTempDatabasePath, cleanupTempDir } from "./helpers.js";
import { SqlitePlatformStore } from "@ultimate-system/sqlite-store";

let dir: string;

beforeAll(async () => {
  const result = createTempDatabasePath("my-test");
  dir = result.dir;
  const store = new SqlitePlatformStore(result.dbPath);
  await store.seedDefaults();
  // ...test setup
});

afterAll(() => cleanupTempDir(dir));
```

For API tests requiring auth:
```typescript
import { loginAsAdmin } from "./helpers.js";

const cookie = await loginAsAdmin(baseUrl);
const response = await fetch(`${baseUrl}/api/tasks`, {
  headers: { cookie }
});
```

For adapter tests requiring commands:
```typescript
import { createSuccessfulCommandRunner, createSelectiveCommandRunner } from "./helpers.js";

// All pass
const adapter = new DeterministicRuntimeAdapter({
  commandRunner: createSuccessfulCommandRunner()
});

// Specific failures
const adapter = new DeterministicRuntimeAdapter({
  commandRunner: createSelectiveCommandRunner({ lint: "ESLint failed" })
});
```

## Common Searching Patterns

```bash
# Domain types
rg -n "export const.*Schema\|export type" packages/contracts/src/domain.ts

# Interface definitions
rg -n "^export interface" packages/core/src/interfaces.ts

# SQL methods
rg -n "async " packages/sqlite-store/src/sqliteStore.ts | grep -v "private"

# Event emissions
rg -n "store\.publish\|stores\.publish" .

# Route handlers
rg -n "app\.(get|post|patch|delete)" apps/control-plane/src/app.ts

# Adapter classes
rg -n "export class.*Adapter\|implements WorkerAdapter" apps/worker/src
```

## Response Format Expectations

When making code changes, follow these expectations:
- **Show diffs or replacement blocks** for non-trivial edits (do not reprint hundreds of unmodified lines)
- **Cite file + line** when referencing code: e.g., `sqliteStore.ts:380`
- **Describe gate impact** when touching task lifecycle or artifacts — which gate rule does this affect?
- **Call out transaction scope** when SQL changes span multiple tables

## What Not to Do

- Do not add SQL joins or queries outside `packages/sqlite-store/src/sqliteStore.ts`
- Do not use `body-parser` or override Express middleware in `app.ts` without understanding the existing session middleware chain
- Do not add new npm packages without checking whether the built-in Node 22 stdlib covers the need
- Do not call `new Date()` for persistence timestamps — use `nowIso()` from `@ultimate-system/core`
- Do not validate domain objects more than once — validate at the boundary (HTTP), trust internally
- Do not add global state or singletons to the worker — the BullMQ job handler is the correct entry point
- Do not try to share BullMQ queue instances across processes — each process creates its own `Queue` instance pointed at the same Redis

## Debugging Runbook

```bash
# Control-plane not responding
curl http://localhost:4100/api/health

# Check task lifecycle
curl -b <cookie> http://localhost:4100/api/tasks/<taskId>/detail

# Check gate status
curl -b <cookie> http://localhost:4100/api/tasks/<taskId>/gates

# Check worker memory
curl -b <cookie> http://localhost:4100/api/workers/worker-runtime-local/memory

# Check recent events
curl -b <cookie> http://localhost:4100/api/state | jq '.recentEvents'

# Check if Redis is accessible
redis-cli -p 6380 ping

# Reinitialize DB and seed
./scripts/setup.sh
```
