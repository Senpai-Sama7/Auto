# AGENTS.md — Ultimate System

**Read this file before changing code.** This TypeScript monorepo implements a local orchestration stack with BullMQ task queuing, SQLite persistence, and a Vite/React dashboard.

---

## Build Commands

```bash
# Full validation pipeline
pnpm lint
pnpm typecheck
pnpm build
pnpm test

# Individual app commands
pnpm --filter @ultimate-system/control-plane dev
pnpm --filter @ultimate-system/worker dev
pnpm --filter @ultimate-system/web dev

# Run single test file
pnpm test -- --run tests/worker-run-service.test.ts
pnpm test -- --run tests/control-plane-api.test.ts
pnpm test -- --run tests/orchestration-hardening.test.ts
pnpm test -- --run tests/system-lifecycle.e2e.test.ts
pnpm test -- --run tests/deterministic-runtime-adapter.test.ts

# Run in watch mode
pnpm test -- --watch

# Scripts
./scripts/setup.sh    # Clean checkout setup
./scripts/dev.sh     # Full dev stack
./scripts/test.sh    # Full validation
./scripts/demo.sh    # Demo flow
pnpm clean           # Clean build artifacts
```

---

## Code Style Guidelines

### Types & TypeScript
- **Strict mode enabled** — `noUncheckedIndexedAccess`, `noImplicitOverride`
- **No `any`** — ESLint enforces `@typescript-eslint/no-explicit-any: error`
- **Consistent type imports** — Use `import type { ... }` for type-only imports
- **Use Zod schemas** for all domain validation (from `zod`)
- **Prefer interfaces** over type aliases for object shapes

```typescript
// Good
import type { TaskRecord, WorkerRecord } from "@ultimate-system/contracts";
import { z } from "zod";

// Bad
import { TaskRecord } from "@ultimate-system/contracts"; // imports value when only type needed
```

### Naming Conventions
| Entity | Convention | Example |
|--------|------------|---------|
| Classes | PascalCase | `WorkerRunService`, `ConservativeBudgetPolicy` |
| Interfaces | PascalCase | `TaskStore`, `BudgetPolicy` |
| Types/Schemas | PascalCase | `TaskStatus`, `GateType` |
| Enums | PascalCase | `TaskStatusSchema` |
| Functions | camelCase | `createTask()`, `claimTask()` |
| Variables | camelCase | `workerId`, `taskRecord` |
| Constants | camelCase | `DEFAULT_ORG_ID` (all caps if module-level) |
| Database tables | snake_case | `task_executions`, `worker_sessions` |
| Domain events | dot notation | `task.created`, `worker.registered` |

### Imports & Module Structure
- **Path aliases** available:
  - `@ultimate-system/contracts`
  - `@ultimate-system/core`
  - `@ultimate-system/sqlite-store`
- **Explicit `.js` extensions** for ESM (required by TypeScript)
- **Layer ordering**: imports → types → functions/classes

```typescript
import { randomUUID } from "node:crypto";
import type { TaskRecord } from "@ultimate-system/contracts";
import { nowIso } from "./defaults.js";
import type { TaskStore } from "./interfaces.js";
```

### Error Handling
- **Worker errors**: Use `WorkerExecutionFailure` class that carries an `ExecutionRecord`
- **Command errors**: Cast as `Error & { code?: number; stdout?: string; stderr?: string }`
- **SQLite errors**: Let propagate; wrap in transactions for atomicity

```typescript
// Pattern for exec errors
} catch (error) {
  const execError = error as Error & { code?: number; stdout?: string; stderr?: string };
  // handle code, stdout, stderr
}
```

### Transactions (SQLite)
```typescript
this.db.exec("BEGIN IMMEDIATE");
// ... logic ...
this.db.exec("COMMIT");
} catch {
  this.db.exec("ROLLBACK");
  throw error;
}
```

### Timestamps
- **Always use `nowIso()`** from `packages/core/src/defaults.ts` — never `new Date().toISOString()`

### Package Layering (enforced)
```
packages/contracts        → no internal deps
packages/core            → contracts only
packages/sqlite-store    → contracts, core
apps/control-plane       → contracts, core, sqlite-store
apps/worker              → contracts, core, sqlite-store
apps/web                 → no package deps (HTTP-only)
```

### Frontend (React)
- **Components**: PascalCase `.tsx` files, default exports
- **No business logic in components** — keep orchestration in services
- **CSS**: Plain CSS in `styles.css`, no CSS-in-JS
- **Design system**: `Fraunces` (display), `IBM Plex Sans` (body), warm paper + teal/rust

### File Organization
- One class/interface per file for core types
- Services as single files (e.g., `services.ts`, `defaults.ts`)
- Tests co-located: `foo.ts` → `foo.test.ts`

### Validation Rules (enforced by ESLint)
- `@typescript-eslint/consistent-type-imports: error`
- `@typescript-eslint/no-explicit-any: error`
- React hooks rules from `eslint-plugin-react-hooks`

---

## Testing Patterns

```typescript
import { createTempDatabasePath, cleanupTempDir } from "./helpers.js";

// Pattern for all tests
const { dir, dbPath } = createTempDatabasePath("test-name");
try {
  // test code using dbPath
} finally {
  cleanupTempDir(dir);
}
```

---

## Quick Reference

| What you need | Where to look |
|--------------|---------------|
| Domain types | `packages/contracts/src/domain.ts` |
| Services & orchestration | `packages/core/src/services.ts` |
| Policies (budget, approval, gates) | `packages/core/src/defaults.ts` |
| SQLite persistence | `packages/sqlite-store/src/sqliteStore.ts` |
| HTTP API | `apps/control-plane/src/app.ts` |
| Worker adapters | `apps/worker/src/runtimeAdapters.ts` |
| Test helpers | `tests/helpers.ts` |

---

## What NOT to Do
- ❌ Bypass Zod validation at HTTP/provider boundaries
- ❌ Put raw SQLite in apps (keep in `sqlite-store`)
- ❌ Move orchestration logic into React components
- ❌ Treat provider output as trusted/executable
- ❌ Reintroduce native SQLite addons (`better-sqlite3`)
- ❌ Poll for tasks manually (use BullMQ consumer)

---

## API Keys & Credentials

| Provider | Environment Variable | Config Location |
|----------|---------------------|----------------|
| OpenRouter | `OPENROUTER_API_KEY` | `.env.local`, agent `models.json` |
| DeepSeek | `DEEPSEEK_API_KEY` | `.env.local` |
| Mistral | `MISTRAL_API_KEY` | `.env.local` |
| NVIDIA | `NVIDIA_API_KEY` | `.env.local` |

### OpenRouter Models (Available via OpenCode)
- `openrouter/auto` - Best model for task
- `openrouter/anthropic/claude-sonnet-4` - Balanced performance
- `openrouter/anthropic/claude-opus-4` - Highest capability
- `openrouter/google/gemini-2.5-flash` - Fast & cheap
- `openrouter/deepseek/deepseek-r1` - Reasoning model

OpenCode uses the `OPENROUTER_API_KEY` from `.env.local` automatically.

---

## Revenue Orchestrator Configuration

Autonomous revenue generation is controlled via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `REVENUE_DISABLED` | `false` | Set to `"true"` to disable revenue orchestrator |
| `REVENUE_AUTO_START` | `false` | Set to `"true"` to auto-start on server boot |
| `REVENUE_DISCOVERY_INTERVAL` | `15` | Minutes between opportunity discovery cycles |
| `REVENUE_MAX_DAILY_TASKS` | `50` | Maximum tasks created per day |
| `REVENUE_BUDGET_PER_TASK` | `2.0` | Default budget cap per revenue task (USD) |
| `APEX_MCP_ENDPOINT` | `http://localhost:4000` | Apex MCP tool server (Brave Search, HubSpot, Slack) |
| `MONEY_ENDPOINT` | `http://localhost:8000` | Money HVAC dispatch service |
| `CLEARDESK_ENDPOINT` | `https://clear-desk-ten.vercel.app` | ClearDesk document processing service |

### Revenue Streams

The orchestrator discovers opportunities across four streams:

1. **Lead Generation** - Searches Brave for companies hiring for AI/automation
2. **Document Processing** - Polls ClearDesk for invoice/contract OCR jobs
3. **Market Research** - Analyzes trending topics for content opportunities
4. **Sales Outreach** - Checks HubSpot for contacts needing follow-up

### Usage

```bash
# Enable autonomous revenue generation
REVENUE_AUTO_START=true REVENUE_MAX_DAILY_TASKS=100 pnpm --filter @ultimate-system/control-plane dev

# Or start manually via API (requires approver/admin role)
curl -X POST http://localhost:4100/api/revenue/start
```

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/revenue/status` | User | Get orchestrator statistics |
| `POST` | `/api/revenue/start` | Approver | Start autonomous revenue generation |
| `POST` | `/api/revenue/stop` | Approver | Stop orchestrator |

### Dashboard

Access the revenue dashboard from **Settings** → **Revenue Orchestrator** section to monitor:
- Running/stopped status
- Daily task progress
- Active revenue streams
- Estimated daily revenue

---

## RALPH BUILD PROTOCOL
**Retry · Assess · Log · Prove · Harden**
---
### PRIME DIRECTIVE
You are operating in ZERO-TRUST mode. The build is broken until a gate command 
proves otherwise. No claim of functionality is valid without terminal output. 
Nothing faked, simulated, mocked, or deferred. No TODOs. No placeholders. 
If a feature cannot be implemented right now, say so explicitly — do not scaffold it.
---
### STEP 0 — PRE-FLIGHT AUDIT (run before writing a single line of code)
1. Run the current build gate and capture output:
   ```
   npm run build 2>&1 | tee build-preflight.log
   npm run typecheck 2>&1 | tee typecheck-preflight.log  # if configured
   npm run lint 2>&1 | tee lint-preflight.log            # if configured
   ```
2. Count and categorize every existing error. Do not suppress warnings.
3. Document the baseline failure state in PROGRESS_TRACKER.md before touching anything.
4. Do not proceed to Phase 1 until this baseline is logged.
---
### EXECUTION RULES (apply to every phase and every task)
**Planning:**
- Use step-by-step reasoning to produce the implementation plan. 
  Show your reasoning before code — but the plan is not proof of completion.
**Gates (non-negotiable before marking any task [x]):**
- Every task must pass its gate command before being marked complete.
- Gate command output must appear verbatim in the Proof line (trimmed to relevant lines + timestamp).
- If the gate fails: task stays [ ], error is logged under ❌ FAIL:, and you fix 
  before continuing. You do not move to the next task on a failing gate.
**Failures:**
- Do NOT delete original implementation attempts that failed.
- Keep the original code/approach, append ❌ FAIL: with the exact error, 
  then append ✅ FIX: with what replaced it and why it worked.
**Proof format (required on every task):**
```
Proof: `<exact command>` → `<trimmed output with exit code>` @ <timestamp>
```
Example:
```
Proof: `npm run build` → `✓ Built in 3.2s, 0 errors` (exit 0) @ 2025-03-13T14:22:01Z
```
---
### TRACKER MUTATION RULES — PERMANENT, NON-NEGOTIABLE
These rules apply to every agent (human or AI) editing this file. Violating them 
invalidates the proof chain.

1. **Permitted changes on completion only:**
   - `[ ]` → `[x]`
   - Replace `_pending_` with actual proof (command + output + timestamp)
   - Append a row to the Completion Log table

2. **Forbidden at all times:**
   - Rewriting, removing, or reordering any task
   - Adding or removing sections
   - Editing any uncompleted task
   - Replacing proof text without retaining the original attempt record

3. **On failure:** Leave `[ ]`. Append below the Proof line:
   ```
   ❌ FAIL: [error message, timestamp]
   ✅ FIX: [what replaced it and why]
   Proof: [final passing result]
   ```

These rules were established at project init and apply permanently.
