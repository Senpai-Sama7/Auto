import { describe, expect, it } from "vitest";
import { CreateTaskInputSchema } from "../packages/contracts/src/index.js";
import {
  BoundedRetryPolicy,
  CapabilityDispatchPolicy,
  ConservativeBudgetPolicy,
  DefaultApprovalPolicy,
  DefaultSkillRegistry,
  TaskCreationService,
  WorkerRunService,
  createDefaultWorker
} from "../packages/core/src/index.js";
import { SqlitePlatformStore } from "../packages/sqlite-store/src/index.js";
import { DeterministicRuntimeAdapter } from "../apps/worker/src/runtimeAdapters.js";
import { cleanupTempDir, createSuccessfulCommandRunner, createTempDatabasePath } from "./helpers.js";

describe("WorkerRunService", () => {
  it("persists a task through release with memory, sessions, and gate evidence", async () => {
    const { dir, dbPath } = createTempDatabasePath("run-service");

    try {
      const store = new SqlitePlatformStore(dbPath);
      await store.seedDefaults();
      await store.registerWorker(createDefaultWorker());

      const taskService = new TaskCreationService(store, new DefaultApprovalPolicy());
      const task = await taskService.createTask(CreateTaskInputSchema.parse({
        title: "Implement orchestration happy path",
        description: "Verify the worker adapter completes a task and persists evidence.",
        requestedBy: "vitest",
        budgetCapUsd: 25
      }));

      const runService = new WorkerRunService(
        store,
        new ConservativeBudgetPolicy(),
        new DefaultSkillRegistry(),
        new CapabilityDispatchPolicy(),
        new BoundedRetryPolicy(),
        new DeterministicRuntimeAdapter({
          commandRunner: createSuccessfulCommandRunner()
        })
      );

      const taskAfterRun = await runService.runNext("worker-runtime-local");
      const storedTask = await store.getTask(task.id);
      const gates = await store.listGates(task.id);
      const executions = await store.listExecutions(task.id);
      const memory = await store.listRecentMemory("worker-runtime-local", 10);
      const searchMatches = await store.searchMemory("worker-runtime-local", "Operational evidence", 10);
      const sessions = await store.listSessions("worker-runtime-local");
      const events = await store.listByTask(task.id);
      const dashboard = await store.getDashboardState("org-core");

      expect(taskAfterRun?.id).toBe(task.id);
      expect(taskAfterRun?.status).toBe("released");
      expect(storedTask?.status).toBe("released");
      expect(storedTask?.artifacts?.planDoc).toContain("Execution Plan");
      expect(executions).toHaveLength(1);
      expect(executions[0]?.toolCalls.length).toBeGreaterThan(0);
      expect(gates).toHaveLength(5);
      expect(gates.every((gate) => gate.status === "passed")).toBe(true);
      expect(memory.length).toBeGreaterThanOrEqual(2);
      expect(searchMatches.length).toBeGreaterThanOrEqual(1);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.status).toBe("closed");
      expect(events.map((event) => event.eventType)).toContain("task.created");
      expect(events.map((event) => event.eventType)).toContain("task.claimed");
      expect(events.map((event) => event.eventType)).toContain("task.started");
      expect(events.map((event) => event.eventType)).toContain("task.completed");
      expect(events.map((event) => event.eventType)).toContain("task.released");
      expect(events.map((event) => event.eventType)).toContain("execution.recorded");
      expect(events.filter((event) => event.eventType === "gate.updated").length).toBe(5);
      expect(dashboard.org.spentBudgetUsd).toBe(0);
    } finally {
      cleanupTempDir(dir);
    }
  });
});
