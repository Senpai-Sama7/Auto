import { describe, expect, it } from "vitest";
import type {
  TaskArtifacts,
  WorkerExecutionInput,
  WorkerExecutionResult
} from "../packages/contracts/src/index.js";
import { CreateTaskInputSchema, TaskArtifactsSchema } from "../packages/contracts/src/index.js";
import type { WorkerAdapter } from "../packages/core/src/index.js";
import {
  BoundedRetryPolicy,
  CapabilityDispatchPolicy,
  ConservativeBudgetPolicy,
  DefaultApprovalPolicy,
  DefaultSkillRegistry,
  TaskApprovalService,
  TaskCreationService,
  WorkerRunService,
  createDefaultWorker
} from "../packages/core/src/index.js";
import { SqlitePlatformStore } from "../packages/sqlite-store/src/index.js";
import { WorkerExecutionFailure } from "../apps/worker/src/runtimeAdapters.js";
import {
  cleanupTempDir,
  createTempDatabasePath
} from "./helpers.js";

function createArtifacts(overrides: Partial<TaskArtifacts> = {}): TaskArtifacts {
  return TaskArtifactsSchema.parse({
    specDoc: "# Spec\n\nConcrete runtime spec.",
    planDoc: "# Plan\n\n1. Execute.\n2. Verify.",
    acceptanceCriteria: ["Task is persisted.", "Execution is auditable."],
    taskSlices: ["Persist task", "Persist execution"],
    risks: [],
    tddNotes: ["Write a failing test first."],
    reviewFindings: [
      {
        title: "No blocking findings",
        severity: "low",
        detail: "Execution stayed within expected constraints."
      }
    ],
    qaChecks: [
      {
        id: "build",
        area: "runtime",
        command: "npm run build",
        expected: "exit 0"
      }
    ],
    securityControls: [
      {
        id: "audit",
        category: "audit",
        control: "Persist audit records.",
        status: "implemented"
      },
      {
        id: "validation",
        category: "validation",
        control: "Validate task payloads.",
        status: "implemented"
      },
      {
        id: "trust-boundary",
        category: "trust-boundary",
        control: "Treat model output as data.",
        status: "implemented"
      }
    ],
    releaseChecks: [
      {
        id: "build-release",
        item: "Build passes",
        status: "satisfied",
        source: "npm run build"
      }
    ],
    learningNotes: ["Structured evidence reduces ambiguity."],
    ...overrides
  });
}

function createExecutionResult(input: WorkerExecutionInput, overrides: Partial<WorkerExecutionResult> = {}): WorkerExecutionResult {
  const summary = overrides.summary ?? `Executed ${input.task.title}`;
  const artifacts = overrides.artifacts ?? createArtifacts();
  return {
    summary,
    artifacts,
    memoryAdditions: overrides.memoryAdditions ?? [
      {
        category: "session-summary",
        content: summary
      }
    ],
    execution: overrides.execution ?? {
      id: `exec-${input.task.id}`,
      taskId: input.task.id,
      workerId: input.worker.id,
      adapter: "fixture-adapter",
      executionMode: input.task.executionMode,
      provider: "test",
      model: "fixture",
      prompt: "prompt",
      response: "response",
      summary,
      toolCalls: [],
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0
      },
      status: "succeeded",
      error: null,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    },
    estimatedCostUsd: overrides.estimatedCostUsd ?? 0,
    actualCostUsd: overrides.actualCostUsd ?? 0
  };
}

class ProviderSuccessAdapter implements WorkerAdapter {
  readonly name = "provider-success-adapter";
  readonly executionMode = "provider" as const;
  calls = 0;

  async execute(input: WorkerExecutionInput): Promise<WorkerExecutionResult> {
    this.calls += 1;
    return createExecutionResult(input, {
      execution: {
        id: `exec-${input.task.id}`,
        taskId: input.task.id,
        workerId: input.worker.id,
        adapter: this.name,
        executionMode: this.executionMode,
        provider: "test-provider",
        model: "fixture-provider",
        prompt: "provider prompt",
        response: "provider response",
        summary: `Executed ${input.task.title}`,
        toolCalls: [],
        usage: {
          inputTokens: 20,
          outputTokens: 10,
          totalTokens: 30,
          costUsd: 0.05
        },
        status: "succeeded",
        error: null,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      },
      estimatedCostUsd: 0.05,
      actualCostUsd: 0.05
    });
  }
}

class BlockingGateAdapter implements WorkerAdapter {
  readonly name = "blocking-gate-adapter";
  readonly executionMode = "deterministic" as const;

  async execute(input: WorkerExecutionInput): Promise<WorkerExecutionResult> {
    return createExecutionResult(input, {
      artifacts: createArtifacts({
        reviewFindings: [
          {
            title: "Blocking architecture issue",
            severity: "high",
            detail: "A required review issue remains unresolved."
          }
        ],
        releaseChecks: [
          {
            id: "release-blocked",
            item: "Review findings are resolved",
            status: "blocked",
            source: "engineering-review"
          }
        ]
      })
    });
  }
}

class FailingAdapter implements WorkerAdapter {
  readonly name = "failing-adapter";
  readonly executionMode = "deterministic" as const;
  calls = 0;

  async execute(input: WorkerExecutionInput): Promise<WorkerExecutionResult> {
    this.calls += 1;
    throw new WorkerExecutionFailure(
      `forced failure ${this.calls}`,
      {
        id: `exec-failed-${this.calls}`,
        taskId: input.task.id,
        workerId: input.worker.id,
        adapter: this.name,
        executionMode: this.executionMode,
        provider: "test",
        model: "fixture",
        prompt: "failure prompt",
        response: "failure response",
        summary: "forced failure",
        toolCalls: [],
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: 0
        },
        status: "failed",
        error: `forced failure ${this.calls}`,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      }
    );
  }
}

describe("orchestration hardening", () => {
  it("rejects provider execution when the task budget cap is below the estimated cost", async () => {
    const { dir, dbPath } = createTempDatabasePath("budget-rejection");

    try {
      const store = new SqlitePlatformStore(dbPath);
      const providerWorker = {
        ...createDefaultWorker(["provider"]),
        adapter: "provider-success-adapter"
      };
      await store.seedDefaults();
      await store.registerWorker(providerWorker);

      const taskService = new TaskCreationService(store, new DefaultApprovalPolicy());
      const approvalService = new TaskApprovalService(store);
      const task = await taskService.createTask(CreateTaskInputSchema.parse({
        title: "Provider task budget rejection",
        description: "This task should be blocked before provider execution starts.",
        requestedBy: "vitest",
        budgetCapUsd: 0.00001,
        executionMode: "provider"
      }));
      await approvalService.updateApproval(task.id, "reviewer", "approved", "Approved for policy test.");

      const adapter = new ProviderSuccessAdapter();
      const runService = new WorkerRunService(
        store,
        new ConservativeBudgetPolicy(),
        new DefaultSkillRegistry(),
        new CapabilityDispatchPolicy(),
        new BoundedRetryPolicy(),
        adapter
      );

      const result = await runService.runNext(providerWorker.id);
      const events = await store.listByTask(task.id);
      const updatedTask = await store.getTask(task.id);

      expect(result).toBeNull();
      expect(updatedTask?.status).toBe("queued");
      expect(adapter.calls).toBe(0);
      expect(events.some((event) => event.eventType === "task.claimed")).toBe(false);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("keeps a completed task blocked when review or release evidence is not satisfied", async () => {
    const { dir, dbPath } = createTempDatabasePath("gate-block");

    try {
      const store = new SqlitePlatformStore(dbPath);
      await store.seedDefaults();
      await store.registerWorker(createDefaultWorker());

      const taskService = new TaskCreationService(store, new DefaultApprovalPolicy());
      const task = await taskService.createTask(CreateTaskInputSchema.parse({
        title: "Gate blocking task",
        description: "Return succeeded execution with blocking review evidence.",
        requestedBy: "vitest",
        budgetCapUsd: 10
      }));

      const runService = new WorkerRunService(
        store,
        new ConservativeBudgetPolicy(),
        new DefaultSkillRegistry(),
        new CapabilityDispatchPolicy(),
        new BoundedRetryPolicy(),
        new BlockingGateAdapter()
      );

      const result = await runService.runNext("worker-runtime-local");
      const gates = await store.listGates(task.id);

      expect(result?.status).toBe("completed");
      expect(gates.find((gate) => gate.gateType === "engineering")?.status).toBe("blocked");
      expect(gates.find((gate) => gate.gateType === "release")?.status).toBe("blocked");
      expect(result?.releaseDecision?.allowed).toBe(false);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("retries once and then fails when the worker adapter keeps failing", async () => {
    const { dir, dbPath } = createTempDatabasePath("worker-failure");

    try {
      const store = new SqlitePlatformStore(dbPath);
      await store.seedDefaults();
      await store.registerWorker(createDefaultWorker());

      const taskService = new TaskCreationService(store, new DefaultApprovalPolicy());
      const task = await taskService.createTask(CreateTaskInputSchema.parse({
        title: "Worker retry policy",
        description: "The first failure should requeue and the second should fail permanently.",
        requestedBy: "vitest",
        budgetCapUsd: 10,
        maxRetries: 1
      }));

      const adapter = new FailingAdapter();
      const runService = new WorkerRunService(
        store,
        new ConservativeBudgetPolicy(),
        new DefaultSkillRegistry(),
        new CapabilityDispatchPolicy(),
        new BoundedRetryPolicy(),
        adapter
      );

      const first = await runService.runNext("worker-runtime-local");
      const second = await runService.runNext("worker-runtime-local");
      const executions = await store.listExecutions(task.id);

      expect(first?.status).toBe("queued");
      expect(first?.retryCount).toBe(1);
      expect(second?.status).toBe("failed");
      expect(second?.retryCount).toBe(2);
      expect(executions).toHaveLength(2);
      expect(adapter.calls).toBe(2);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("returns the existing task when the same idempotency key is reused", async () => {
    const { dir, dbPath } = createTempDatabasePath("idempotency");

    try {
      const store = new SqlitePlatformStore(dbPath);
      await store.seedDefaults();
      const taskService = new TaskCreationService(store, new DefaultApprovalPolicy());

      const first = await taskService.createTask(CreateTaskInputSchema.parse({
        title: "Idempotent creation",
        description: "Create the same task twice using one idempotency key.",
        requestedBy: "vitest",
        budgetCapUsd: 10,
        idempotencyKey: "idempotency-key-1"
      }));
      const second = await taskService.createTask(CreateTaskInputSchema.parse({
        title: "Idempotent creation",
        description: "Create the same task twice using one idempotency key.",
        requestedBy: "vitest",
        budgetCapUsd: 10,
        idempotencyKey: "idempotency-key-1"
      }));

      expect(second.id).toBe(first.id);
      expect((await store.listTasks())).toHaveLength(1);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("allows only one worker to claim the same queued task", async () => {
    const { dir, dbPath } = createTempDatabasePath("claim-protection");

    try {
      const store = new SqlitePlatformStore(dbPath);
      await store.seedDefaults();
      const taskService = new TaskCreationService(store, new DefaultApprovalPolicy());
      const task = await taskService.createTask(CreateTaskInputSchema.parse({
        title: "Concurrent claim protection",
        description: "Two workers compete for the same queued task.",
        requestedBy: "vitest",
        budgetCapUsd: 10
      }));

      const [claimOne, claimTwo] = await Promise.all([
        store.claimTask(task.id, "worker-a", new Date().toISOString()),
        store.claimTask(task.id, "worker-b", new Date().toISOString())
      ]);

      const successes = [claimOne, claimTwo].filter((claim) => claim !== null);
      expect(successes).toHaveLength(1);
      expect((await store.getTask(task.id))?.assignedWorkerId).toBe(successes[0]?.assignedWorkerId ?? null);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("recovers stale dispatched or running tasks for a restarted worker", async () => {
    const { dir, dbPath } = createTempDatabasePath("stale-recovery");

    try {
      const store = new SqlitePlatformStore(dbPath);
      await store.seedDefaults();
      await store.registerWorker(createDefaultWorker());
      const taskService = new TaskCreationService(store, new DefaultApprovalPolicy());

      const task = await taskService.createTask(CreateTaskInputSchema.parse({
        title: "Recover stale worker task",
        description: "A restarted worker should requeue its stranded task before processing new work.",
        requestedBy: "vitest",
        budgetCapUsd: 10
      }));

      await store.claimTask(task.id, "worker-runtime-local", new Date().toISOString());
      await store.markTaskRunning(task.id, "worker-runtime-local", new Date().toISOString(), 0.5);

      const recovered = await store.recoverTasksForWorker(
        "worker-runtime-local",
        new Date().toISOString(),
        "Recovered stale task after worker restart."
      );
      const result = await store.getTask(task.id);

      expect(recovered.map((entry) => entry.id)).toContain(task.id);
      expect(result?.status).toBe("queued");
      expect(result?.assignedWorkerId).toBeNull();
      expect(result?.lastError).toContain("Recovered stale task");
    } finally {
      cleanupTempDir(dir);
    }
  });
});
