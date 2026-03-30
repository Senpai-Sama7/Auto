import { randomUUID } from "node:crypto";
import type {
  CreateTaskInput,
  ExecutionRecord,
  GateRecord,
  MemoryEntry,
  TaskEvent,
  TaskRecord,
  WorkerExecutionResult,
  WorkerSession
} from "@ultimate-system/contracts";
import {
  createDefaultGates,
  defaultReviewGates,
  DefaultReleaseGate,
  nowIso
} from "./defaults.js";
import type {
  ApprovalPolicy,
  BudgetPolicy,
  DispatchPolicy,
  FailurePolicy,
  SkillRegistry,
  Stores,
  WorkerAdapter
} from "./interfaces.js";

function makeEvent(
  eventType: TaskEvent["eventType"],
  actor: string,
  detail: TaskEvent["detail"],
  taskId: string | null = null,
  workerId: string | null = null
): TaskEvent {
  return {
    id: randomUUID(),
    taskId,
    workerId,
    eventType,
    actor,
    detail,
    createdAt: nowIso()
  };
}

function getExecutionFromError(error: unknown): ExecutionRecord | null {
  if (!error || typeof error !== "object" || !("execution" in error)) {
    return null;
  }

  const candidate = (error as { execution?: ExecutionRecord }).execution;
  return candidate ?? null;
}

export class TaskCreationService {
  constructor(
    private readonly stores: Stores,
    private readonly approvalPolicy: ApprovalPolicy
  ) {}

  async createTask(input: CreateTaskInput): Promise<TaskRecord> {
    if (input.idempotencyKey) {
      const existing = await this.stores.findTaskByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    const timestamp = nowIso();
    const approval = this.approvalPolicy.evaluate(input);
    const task: TaskRecord = {
      id: randomUUID(),
      orgId: input.orgId,
      teamId: input.teamId,
      title: input.title,
      description: input.description,
      requestedBy: input.requestedBy,
      skillHint: input.skillHint ?? null,
      requiredCapabilities: input.requiredCapabilities,
      executionMode: input.executionMode,
      status: "queued",
      approvalState: approval.approvalState,
      approvalReason: approval.approvalReason,
      approvedBy: approval.approvalState === "approved" ? "control-plane-policy" : null,
      approvedAt: approval.approvalState === "approved" ? timestamp : null,
      route: "control-plane -> worker-adapter",
      assignedWorkerId: null,
      budgetCapUsd: input.budgetCapUsd,
      budgetEstimateUsd: 0,
      budgetActualUsd: 0,
      idempotencyKey: input.idempotencyKey ?? null,
      retryCount: 0,
      maxRetries: input.maxRetries,
      lastError: null,
      resultSummary: null,
      artifacts: null,
      integrationRefs: null,
      releaseDecision: null,
      startedAt: null,
      completedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const gates = createDefaultGates(task.id);
    await this.stores.createTask(task, gates);
    await this.stores.publish(
      makeEvent("task.created", input.requestedBy, {
        title: task.title,
        route: task.route,
        budgetCapUsd: task.budgetCapUsd,
        executionMode: task.executionMode,
        approvalState: task.approvalState
      }, task.id)
    );
    await this.stores.publish(
      makeEvent("task.approval_updated", task.approvedBy ?? "control-plane-policy", {
        approvalState: task.approvalState,
        approvalReason: task.approvalReason
      }, task.id)
    );
    return task;
  }
}

export class TaskApprovalService {
  constructor(private readonly stores: Stores) {}

  async updateApproval(taskId: string, actor: string, approvalState: TaskRecord["approvalState"], reason: string): Promise<TaskRecord | null> {
    const timestamp = nowIso();
    const task = await this.stores.updateApproval(taskId, {
      approvalState,
      approvalReason: reason,
      approvedBy: approvalState === "approved" ? actor : null,
      approvedAt: approvalState === "approved" ? timestamp : null,
      updatedAt: timestamp
    });

    if (task) {
      await this.stores.publish(
        makeEvent("task.approval_updated", actor, {
          approvalState,
          approvalReason: reason
        }, task.id)
      );
    }

    return task;
  }
}

export class WorkerRunService {
  private readonly releaseGate = new DefaultReleaseGate();

  constructor(
    private readonly stores: Stores,
    private readonly budgetPolicy: BudgetPolicy,
    private readonly skillRegistry: SkillRegistry,
    private readonly dispatchPolicy: DispatchPolicy,
    private readonly failurePolicy: FailurePolicy,
    private readonly adapter: WorkerAdapter
  ) {}

  private async getRequiredWorker(workerId: string) {
    const worker = await this.stores.getWorker(workerId);
    if (!worker) {
      throw new Error(`Unknown worker: ${workerId}`);
    }
    return worker;
  }

  private async claimTaskForWorker(
    worker: Awaited<ReturnType<Stores["getWorker"]>> & {},
    workerId: string,
    requestedTaskId?: string
  ): Promise<TaskRecord | null> {
    const candidateTasks = requestedTaskId
      ? [await this.stores.getTask(requestedTaskId)].filter((task): task is TaskRecord => Boolean(task))
      : await this.stores.listQueuedTasks();

    for (const task of candidateTasks) {
      if (task.status !== "queued" || task.approvalState !== "approved") {
        continue;
      }
      
      // Upstream quota reservation check
      const org = await this.stores.getOrg(task.orgId);
      if (!org) continue;
      
      const budgetDecision = this.budgetPolicy.canDispatch(task, worker, org);
      if (!budgetDecision.allowed) continue;

      const dispatchDecision = this.dispatchPolicy.canWorkerExecute(task, worker);
      if (!dispatchDecision.allowed) {
        continue;
      }

      const claimed = await this.stores.claimTask(task.id, workerId, nowIso());
      if (claimed) {
        await this.stores.publish(
          makeEvent("task.claimed", worker.name, {
            workerId,
            executionMode: claimed.executionMode,
            estimatedCostUsd: budgetDecision.estimatedCostUsd
          }, claimed.id, workerId)
        );
        return claimed;
      }
    }

    return null;
  }

  async runTask(workerId: string, taskId: string): Promise<TaskRecord | null> {
    const worker = await this.getRequiredWorker(workerId);
    const runningTask = await this.claimTaskForWorker(worker, workerId, taskId);
    if (!runningTask) {
      return null;
    }

    return this.executeClaimedTask(workerId, worker, runningTask);
  }

  async runNext(workerId: string): Promise<TaskRecord | null> {
    const worker = await this.getRequiredWorker(workerId);
    const runningTask = await this.claimTaskForWorker(worker, workerId);
    if (!runningTask) {
      return null;
    }

    return this.executeClaimedTask(workerId, worker, runningTask);
  }

  private async executeClaimedTask(
    workerId: string,
    worker: Awaited<ReturnType<Stores["getWorker"]>> & {},
    runningTask: TaskRecord
  ): Promise<TaskRecord | null> {

    const org = await this.stores.getOrg(runningTask.orgId);
    if (!org) {
      throw new Error(`Unknown org: ${runningTask.orgId}`);
    }

    const budgetDecision = this.budgetPolicy.canDispatch(runningTask, worker, org);
    if (!budgetDecision.allowed) {
      const failed = await this.stores.recordFailure(runningTask.id, {
        failedAt: nowIso(),
        error: budgetDecision.reason ?? "Budget policy blocked execution.",
        nextStatus: "failed",
        retryCount: runningTask.retryCount
      });
      await this.stores.publish(
        makeEvent("task.failed", "budget-policy", {
          reason: budgetDecision.reason
        }, runningTask.id, workerId)
      );
      return failed;
    }

    const runningTaskRecord = await this.stores.markTaskRunning(
      runningTask.id,
      workerId,
      nowIso(),
      budgetDecision.estimatedCostUsd
    );

    if (!runningTaskRecord) {
      return null;
    }
    runningTask = runningTaskRecord;

    await this.stores.updateWorkerStatus(workerId, "busy", runningTask.id, `Executing ${runningTask.title}`);
    await this.stores.publish(
      makeEvent("task.started", worker.name, {
        adapter: this.adapter.name,
        executionMode: this.adapter.executionMode,
        estimatedCostUsd: budgetDecision.estimatedCostUsd
      }, runningTask.id, workerId)
    );

    const recall = await this.stores.listRecentMemory(workerId, 5);
    const session: WorkerSession = {
      id: randomUUID(),
      workerId,
      taskId: runningTask.id,
      status: "open",
      startedAt: nowIso(),
      endedAt: null,
      recallSummary: recall.map((entry) => entry.content).join("\n")
    };
    await this.stores.createSession(session);

    let result: WorkerExecutionResult;
    try {
      result = await this.adapter.execute({
        task: runningTask,
        worker,
        recall,
        skills: this.skillRegistry.resolve(runningTask)
      });
    } catch (error) {
      const failureSummary = error instanceof Error ? error.message : "Unknown worker execution failure.";
      const failureExecution = getExecutionFromError(error);
      if (failureExecution) {
        await this.stores.appendExecution(failureExecution);
        await this.stores.publish(
          makeEvent("execution.recorded", this.adapter.name, {
            executionId: failureExecution.id,
            status: failureExecution.status
          }, runningTask.id, workerId)
        );
      }

      const failureDecision = this.failurePolicy.onFailure(runningTask, failureSummary);
      const failedTask = await this.stores.recordFailure(runningTask.id, {
        failedAt: nowIso(),
        error: failureSummary,
        nextStatus: failureDecision.nextStatus,
        retryCount: failureDecision.retryCount
      });
      await this.stores.closeSession(session.id, nowIso());
      await this.stores.updateWorkerStatus(workerId, "idle", null, failureSummary);

      const failureEventType = failureDecision.nextStatus === "queued" ? "task.retry_scheduled" : "task.failed";
      await this.stores.publish(
        makeEvent(failureEventType, this.adapter.name, {
          error: failureSummary,
          retryCount: failureDecision.retryCount
        }, runningTask.id, workerId)
      );
      return failedTask;
    }

    await this.stores.appendExecution(result.execution);
    await this.stores.publish(
      makeEvent("execution.recorded", this.adapter.name, {
        executionId: result.execution.id,
        mode: result.execution.executionMode,
        provider: result.execution.provider,
        model: result.execution.model
      }, runningTask.id, workerId)
    );

    const mergedIntegrationRefs = result.integrationRefs
      ? {
          ...(runningTask.integrationRefs ?? {}),
          ...result.integrationRefs
        }
      : runningTask.integrationRefs;
    if (result.integrationRefs) {
      const updatedTask = await this.stores.updateTaskIntegrationRefs(runningTask.id, mergedIntegrationRefs ?? null);
      if (updatedTask) {
        runningTask = updatedTask;
      }
    }

    for (const addition of result.memoryAdditions) {
      const memoryEntry: MemoryEntry = {
        id: randomUUID(),
        workerId,
        taskId: runningTask.id,
        category: addition.category,
        content: addition.content,
        createdAt: nowIso()
      };
      await this.stores.appendMemory(memoryEntry);
      await this.stores.publish(
        makeEvent("memory.appended", this.adapter.name, {
          category: memoryEntry.category
        }, runningTask.id, workerId)
      );
    }

    const completedTask = await this.stores.completeTask(runningTask.id, {
      completedAt: nowIso(),
      summary: result.summary,
      artifacts: result.artifacts,
      budgetActualUsd: result.actualCostUsd,
      releaseDecision: null
    });

    if (!completedTask) {
      throw new Error("Task disappeared during completion.");
    }

    const finalizedTask = await this.applyGates(completedTask);
    await this.stores.closeSession(session.id, nowIso());
    await this.stores.updateWorkerStatus(workerId, "idle", null, result.summary);
    await this.stores.publish(
      makeEvent("task.completed", this.adapter.name, {
        actualCostUsd: result.actualCostUsd,
        estimatedCostUsd: result.estimatedCostUsd
      }, finalizedTask.id, workerId)
    );

    if (finalizedTask.status === "released") {
      await this.stores.publish(
        makeEvent("task.released", "release-gate", {
          releaseDecision: finalizedTask.releaseDecision
        }, finalizedTask.id, workerId)
      );
    }

    return finalizedTask;
  }

  private async applyGates(task: TaskRecord): Promise<TaskRecord> {
    const currentGates = await this.stores.listGates(task.id);
    const executions = await this.stores.listExecutions(task.id);
    const context = {
      task,
      executions
    };

    const nextGates: GateRecord[] = currentGates.map((gate) => {
      const reviewGate = defaultReviewGates.find((candidate) => candidate.gateType === gate.gateType);
      if (!reviewGate) {
        return gate;
      }

      const evaluation = reviewGate.evaluate(context);
      return {
        ...gate,
        status: evaluation.status,
        evidence: evaluation.evidence,
        updatedAt: nowIso()
      };
    });

    let releaseDecision = task.releaseDecision;
    const releaseIndex = nextGates.findIndex((gate) => gate.gateType === "release");
    if (releaseIndex >= 0) {
      const nonRelease = nextGates.filter((gate) => gate.gateType !== "release");
      const currentRelease = nextGates[releaseIndex];
      if (currentRelease) {
        const evaluation = this.releaseGate.evaluate(context, nonRelease);
        nextGates[releaseIndex] = {
          ...currentRelease,
          status: evaluation.status,
          evidence: evaluation.evidence,
          updatedAt: nowIso()
        };
        releaseDecision = evaluation.decision;
      }
    }

    await this.stores.saveGates(task.id, nextGates, releaseDecision ?? null);
    for (const gate of nextGates) {
      await this.stores.publish(
        makeEvent("gate.updated", "gate-orchestrator", {
          gateType: gate.gateType,
          status: gate.status,
          evidenceSummary: gate.evidence.summary
        }, task.id)
      );
    }

    return (await this.stores.getTask(task.id)) ?? task;
  }
}

export class BudgetResetService {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly stores: Stores,
    private readonly resetCheckIntervalMs: number = 60 * 60 * 1000 // Check hourly by default
  ) {}

  start(): void {
    if (this.intervalId) {
      return;
    }

    // Run immediately on start
    this.checkAndReset();

    // Then schedule periodic checks
    this.intervalId = setInterval(() => {
      this.checkAndReset();
    }, this.resetCheckIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async checkAndReset(): Promise<void> {
    try {
      const result = await this.stores.resetMonthlyBudgets();
      if (result.orgsReset > 0 || result.workersReset > 0) {
        await this.stores.publish(
          makeEvent("budget.reset", "budget-reset-service", {
            orgsReset: result.orgsReset,
            workersReset: result.workersReset,
            resetAt: nowIso()
          })
        );
      }
    } catch (error) {
      console.error("BudgetResetService: Failed to reset budgets:", error);
    }
  }

  // Manual trigger for immediate reset
  async triggerReset(): Promise<{ orgsReset: number; workersReset: number }> {
    return this.stores.resetMonthlyBudgets();
  }
}
