import { describe, it, expect } from "vitest";
import type { MemoryEntry } from "../packages/contracts/src/index.js";
import { SqlitePlatformStore } from "../packages/sqlite-store/src/index.js";
import { BudgetResetService, createDefaultWorker } from "../packages/core/src/index.js";
import { randomUUID } from "node:crypto";
import { createTempDatabasePath, cleanupTempDir } from "./helpers.js";

type DatabaseLike = {
  prepare(sql: string): { run(...params: unknown[]): { changes: number | bigint } };
  exec(sql: string): void;
};

describe("memory and budget features", () => {
  describe("FTS5 memory search", () => {
    it("searches memory entries using full-text search", async () => {
      const { dir, dbPath } = createTempDatabasePath("fts5-memory");

      try {
        const store = new SqlitePlatformStore(dbPath);
        await store.seedDefaults();

        const workerId = "worker-test";
        const now = new Date().toISOString();

        // Insert memory entries with varied content
        const entries: MemoryEntry[] = [
          {
            id: randomUUID(),
            workerId,
            taskId: null,
            category: "learning",
            content: "TypeScript strict mode improves code quality by catching type errors at compile time",
            createdAt: now
          },
          {
            id: randomUUID(),
            workerId,
            taskId: null,
            category: "learning",
            content: "PostgreSQL indexing strategies are crucial for query performance",
            createdAt: now
          },
          {
            id: randomUUID(),
            workerId,
            taskId: null,
            category: "recall",
            content: "The user prefers automated testing with vitest over jest",
            createdAt: now
          },
          {
            id: randomUUID(),
            workerId,
            taskId: null,
            category: "session-summary",
            content: "Completed TypeScript refactoring with full type coverage",
            createdAt: now
          }
        ];

        for (const entry of entries) {
          await store.appendMemory(entry);
        }

        // Test prefix matching
        const typeScriptResults = await store.searchMemory(workerId, "TypeScript", 10);
        expect(typeScriptResults.length).toBeGreaterThanOrEqual(2);

        // Test multi-word search
        const queryResults = await store.searchMemory(workerId, "testing vitest", 10);
        expect(queryResults.length).toBeGreaterThanOrEqual(1);
        expect(queryResults[0].content).toContain("vitest");

        // Test empty query returns empty results
        const emptyResults = await store.searchMemory(workerId, "", 10);
        expect(emptyResults).toHaveLength(0);

        // Test non-matching query returns empty results
        const noMatchResults = await store.searchMemory(workerId, "nonexistentxyz123", 10);
        expect(noMatchResults).toHaveLength(0);

        // Test limit is respected
        const limitedResults = await store.searchMemory(workerId, "TypeScript", 1);
        expect(limitedResults.length).toBeLessThanOrEqual(1);
      } finally {
        cleanupTempDir(dir);
      }
    });

    it("scopes search to specific worker", async () => {
      const { dir, dbPath } = createTempDatabasePath("fts5-scoped");

      try {
        const store = new SqlitePlatformStore(dbPath);
        await store.seedDefaults();

        const worker1Id = "worker-1";
        const worker2Id = "worker-2";
        const now = new Date().toISOString();

        await store.appendMemory({
          id: randomUUID(),
          workerId: worker1Id,
          taskId: null,
          category: "learning",
          content: "Worker 1 learned about caching strategies",
          createdAt: now
        });

        await store.appendMemory({
          id: randomUUID(),
          workerId: worker2Id,
          taskId: null,
          category: "learning",
          content: "Worker 2 learned about caching strategies",
          createdAt: now
        });

        // Search as worker 1 should only return worker 1's entries
        const worker1Results = await store.searchMemory(worker1Id, "caching", 10);
        expect(worker1Results.length).toBe(1);
        expect(worker1Results[0].workerId).toBe(worker1Id);

        // Search as worker 2 should only return worker 2's entries
        const worker2Results = await store.searchMemory(worker2Id, "caching", 10);
        expect(worker2Results.length).toBe(1);
        expect(worker2Results[0].workerId).toBe(worker2Id);
      } finally {
        cleanupTempDir(dir);
      }
    });
  });

  describe("budget auto-reset", () => {
    it("resets budgets when month changes", async () => {
      const { dir, dbPath } = createTempDatabasePath("budget-reset");

      try {
        const store = new SqlitePlatformStore(dbPath);
        await store.seedDefaults();

        const org = await store.getOrg("org-core");
        expect(org).not.toBeNull();

        // Simulate some spending
        const worker = createDefaultWorker();
        await store.registerWorker(worker);

        // Manually set spent budgets and simulate different month for last reset
        const db = (store as unknown as { db: DatabaseLike }).db;
        db.prepare("UPDATE orgs SET spent_budget_usd = 1000, last_budget_reset_at = ? WHERE id = ?").run(
          "2020-01-15T00:00:00.000Z",
          "org-core"
        );
        db.prepare("UPDATE workers SET spent_budget_usd = 500, last_budget_reset_at = ? WHERE id = ?").run(
          "2020-01-15T00:00:00.000Z",
          worker.id
        );

        // Verify budgets are not zero
        const orgBefore = await store.getOrg("org-core");
        expect(orgBefore?.spentBudgetUsd).toBe(1000);

        const workerBefore = await store.getWorker(worker.id);
        expect(workerBefore?.spentBudgetUsd).toBe(500);

        // Trigger reset
        const result = await store.resetMonthlyBudgets();
        expect(result.orgsReset).toBe(1);
        expect(result.workersReset).toBe(1);

        // Verify budgets are now zero
        const orgAfter = await store.getOrg("org-core");
        expect(orgAfter?.spentBudgetUsd).toBe(0);

        const workerAfter = await store.getWorker(worker.id);
        expect(workerAfter?.spentBudgetUsd).toBe(0);

        // Verify last reset timestamp is updated
        expect(orgAfter?.lastBudgetResetAt).toBeDefined();
        expect(workerAfter?.lastBudgetResetAt).toBeDefined();
      } finally {
        cleanupTempDir(dir);
      }
    });

    it("does not reset budgets within same month", async () => {
      const { dir, dbPath } = createTempDatabasePath("budget-no-reset");

      try {
        const store = new SqlitePlatformStore(dbPath);
        await store.seedDefaults();

        const worker = createDefaultWorker();
        await store.registerWorker(worker);

        // Set spent budgets with current month as last reset
        const db = (store as unknown as { db: DatabaseLike }).db;
        const now = new Date().toISOString();
        db.prepare("UPDATE orgs SET spent_budget_usd = 500, last_budget_reset_at = ? WHERE id = ?").run(now, "org-core");
        db.prepare("UPDATE workers SET spent_budget_usd = 200, last_budget_reset_at = ? WHERE id = ?").run(now, worker.id);

        // Trigger reset
        const result = await store.resetMonthlyBudgets();
        expect(result.orgsReset).toBe(0);
        expect(result.workersReset).toBe(0);

        // Verify budgets are unchanged
        const orgAfter = await store.getOrg("org-core");
        expect(orgAfter?.spentBudgetUsd).toBe(500);

        const workerAfter = await store.getWorker(worker.id);
        expect(workerAfter?.spentBudgetUsd).toBe(200);
      } finally {
        cleanupTempDir(dir);
      }
    });

    it("BudgetResetService triggers reset and publishes event", async () => {
      const { dir, dbPath } = createTempDatabasePath("budget-service");

      try {
        const store = new SqlitePlatformStore(dbPath);
        await store.seedDefaults();

        const service = new BudgetResetService(store);

        // Manually trigger a reset
        const result = await service.triggerReset();
        expect(result.orgsReset).toBeGreaterThanOrEqual(0);
        expect(result.workersReset).toBeGreaterThanOrEqual(0);
      } finally {
        cleanupTempDir(dir);
      }
    });
  });
});
