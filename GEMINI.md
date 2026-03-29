# Gemini Agent Context: Ultimate System

Canonical repo context lives in [AGENTS.md](./AGENTS.md).

Read `AGENTS.md` first — this is the primary intelligence file for all agents. This file covers Gemini-specific operational notes for working in this repository.

## Stack Summary

pnpm TypeScript monorepo | Node 22 | `node:sqlite` | Express 5 | BullMQ | Vite/React

```text
apps/cli           → Terminal User Interface (TUI) for interactive task execution
apps/control-plane → Express HTTP API + BullMQ producer
apps/worker        → BullMQ consumer + WorkerAdapter (deterministic | openai | hermes)
apps/web           → React/Vite operational dashboard
mcp/               → Integrated Model Context Protocol servers
packages/contracts → Zod domain schemas (source of truth for all types)
packages/core      → Interfaces + policies + services (no HTTP, no SQL)
packages/sqlite-store → SqlitePlatformStore (node:sqlite, no native addons)
```

## Quick Start for a Clean Checkout

```bash
./scripts/setup.sh    # Install deps, build packages, seed DB
./scripts/dev.sh      # Start all three processes (control-plane, worker, web)
./scripts/test.sh     # Full validation: lint, typecheck, build, test
```

## Gemini-Specific Operational Notes

### Tool Selection Priority

When navigating this codebase, always use the following symbol lookup order:

1. **`packages/contracts/src/domain.ts`** — Start here for any question about a domain type
2. **`packages/core/src/interfaces.ts`** — For interface definitions (stores, policies, adapters, gates)
3. **`packages/core/src/services.ts`** — For orchestration logic (TaskCreationService, WorkerRunService)
4. **`packages/core/src/defaults.ts`** — For policy and gate implementations
5. **`packages/sqlite-store/src/sqliteStore.ts`** — For persistence and row mappers
6. **`apps/control-plane/src/app.ts`** — For HTTP route behavior
7. **`apps/worker/src/runtimeAdapters.ts`** — For adapter execution behavior

### When Searching for Symbols

Use `rg` (ripgrep) with `-n` flags for context-aware navigation:

```bash
# Find a type definition
rg -n "TaskArtifacts\|TaskRecord\|GateRecord\|WorkerRecord" packages/contracts/src

# Find interface implementations
rg -n "implements WorkerAdapter\|implements BudgetPolicy\|implements Stores" .

# Find SQL method implementations
rg -n "claimTask\|completeTask\|saveGates\|getDashboardState" packages/sqlite-store/src

# Find all event emissions
rg -n "stores\.publish\|store\.publish" .
```

### Key Conventions to Follow

- **Use `nowIso()`** from `@ultimate-system/core` — never call `new Date().toISOString()` directly in service code
- **Validate input with Zod** at the HTTP boundary in `app.ts`. Schemas live in `@ultimate-system/contracts`
- **Internal calls never need validation** — trust that `services.ts` receives already-validated input
- **Transactions use the pattern:** `this.db.exec("BEGIN IMMEDIATE")` → logic → `this.db.exec("COMMIT")` with catch → `ROLLBACK`
- **Worker adapters must throw `WorkerExecutionFailure`** (not plain `Error`) on failure so the service can persist the incomplete execution record

### Architectural Rules for Gemini Contributions

1. **No SQL outside `packages/sqlite-store`** — add methods to `SqlitePlatformStore`, add to the `Stores` composite interface
2. **No HTTP-specific logic outside `apps/control-plane`**
3. **No provider-specific logic outside `apps/worker/src/runtimeAdapters.ts`**
4. **All new domain fields** require changes in this order: domain.ts → migrations.ts → sqliteStore.ts → services/api

### SQLite Specifics

This project uses **Node 22 `node:sqlite`** (built-in — no `better-sqlite3` needed). Key behaviors:
- `DatabaseSync` is used (synchronous API)
- BigInt values from the DB must be handled: `boolFromInt(value)` checks for `1` or `1n`, `numeric()` converts bigint to number
- Defensive mode is enabled: `new DatabaseSync(path, { defensive: true })`
- WAL mode is not set explicitly — `BEGIN IMMEDIATE` is used for write transactions

### BullMQ Queue Naming

Queue names follow a strict pattern: `ultimate-system.tasks.{workerId}`. This is defined in `packages/core/src/queue.ts`:

```typescript
export const TASK_QUEUE_PREFIX = "ultimate-system.tasks";
export function taskQueueName(workerId: string) {
  return `${TASK_QUEUE_PREFIX}.${workerId}`;
}
```

Both `apps/control-plane/src/queue.ts` and `apps/worker/src/queue.ts` use this shared utility.

### Gate Evaluation Pipeline

Gates are created as `pending` at task creation, then evaluated after completion:

```
task.completed
  → WorkerRunService.applyGates()
    → ProductGate.evaluate()    → determines specDoc, planDoc, criteria presence
    → EngineeringGate.evaluate() → checks taskSlices, tddNotes, execution status, findings
    → QaGate.evaluate()          → checks qaChecks cover "api" and "runtime"
    → SecurityGate.evaluate()    → checks securityControls cover validation+trust-boundary+audit
    → DefaultReleaseGate.evaluate(context, nonReleaseGates)
        → PRIOR_GATES_PASSED + TASK_APPROVED + EXECUTION_SUCCEEDED + RELEASE_CHECKLIST_SATISFIED
  → SqlitePlatformStore.saveGates()  [BEGIN IMMEDIATE tx]
    → status = "released" if release gate passed, else "completed"
```

### Paperclip Integration

`PaperclipClient` is optional — it gracefully degrades. When enabled:
- Company ← Org (by name)
- Goal ← Team (by title)
- Issue ← Task (created on first sync)
- Status mapped on task status changes: `released` → `done`, `failed` → `blocked`, `running` → `in_progress`

Paperclip sync failure during `POST /api/tasks` causes the task to transition to `failed` and return `502`.

### Hermes Integration

`HermesResponsesAdapter` sends to `http://127.0.0.1:8642/v1/responses` with:
- `conversation: input.task.id` — session continuity
- `store: true` — persist conversation state on Hermes side
- No `json_schema` enforcement (unlike OpenAI adapter) — expects raw JSON string in `output_text`

### Performance & Scaling

This system is optimized for high-throughput local orchestration. Follow these rules to maintain stability as the task volume grows:

1. **SQLite Concurrent Access**: The project uses `node:sqlite` in **WAL mode** (`PRAGMA journal_mode = WAL`). This allows concurrent readers while a single writer is active.
2. **Transaction Integrity**: Always use `BEGIN IMMEDIATE` for write operations to avoid `SQLITE_BUSY` errors during high-concurrency dispatch. 
3. **Prepared Statements**: Use `db.prepare()` for all queries to benefit from internal query plan caching and prevent SQL injection.
4. **Experimental Mode**: Be aware that `node:sqlite` is currently experimental. For absolute production stability, prefer standard third-party libraries if non-experimental status is a hard requirement.
5. **Worker Offloading**: If performing extremely CPU-intensive verification suites, the worker should be run on a separate host or within a dedicated container to avoid starving the control plane.

### Testing Patterns

```typescript
// Standard test setup
const { dir, dbPath } = createTempDatabasePath("mytest");
const store = new SqlitePlatformStore(dbPath);
await store.seedDefaults();

// Use createSuccessfulCommandRunner() for adapter tests
const adapter = new DeterministicRuntimeAdapter({ commandRunner: createSuccessfulCommandRunner() });

// Cleanup
afterAll(() => cleanupTempDir(dir));
```

### Auth Cookie Pattern

Tests against the API must use a live session cookie:

```typescript
const cookie = await loginAsAdmin(baseUrl);
const response = await fetch(`${baseUrl}/api/tasks`, {
  headers: { cookie }
});
```

The `loginAsAdmin()` helper in `tests/helpers.ts` handles the full login → extract cookie flow.
