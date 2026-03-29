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
