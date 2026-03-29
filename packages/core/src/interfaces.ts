import type {
  ApprovalState,
  CreateTaskInput,
  ExecutionMode,
  ExecutionRecord,
  GateEvidence,
  GateRecord,
  MemoryEntry,
  Org,
  ReleaseDecision,
  SkillDefinition,
  TaskEvent,
  TaskIntegrationRefs,
  TaskRecord,
  Team,
  WorkerExecutionInput,
  WorkerExecutionResult,
  WorkerRecord,
  WorkerSession
} from "@ultimate-system/contracts";

export interface TaskStore {
  createTask(task: TaskRecord, gates: GateRecord[]): Promise<void>;
  findTaskByIdempotencyKey(idempotencyKey: string): Promise<TaskRecord | null>;
  getTask(taskId: string): Promise<TaskRecord | null>;
  listTasks(): Promise<TaskRecord[]>;
  listQueuedTasks(): Promise<TaskRecord[]>;
  updateTaskIntegrationRefs(taskId: string, integrationRefs: TaskIntegrationRefs | null): Promise<TaskRecord | null>;
  claimTask(taskId: string, workerId: string, dispatchedAt: string): Promise<TaskRecord | null>;
  recoverTasksForWorker(workerId: string, recoveredAt: string, reason: string): Promise<TaskRecord[]>;
  markTaskRunning(taskId: string, workerId: string, startedAt: string, budgetEstimateUsd: number): Promise<TaskRecord | null>;
  completeTask(taskId: string, update: {
    completedAt: string;
    summary: string;
    artifacts: WorkerExecutionResult["artifacts"];
    budgetActualUsd: number;
    releaseDecision: ReleaseDecision | null;
  }): Promise<TaskRecord | null>;
  updateApproval(taskId: string, update: {
    approvalState: ApprovalState;
    approvalReason: string;
    approvedBy: string | null;
    approvedAt: string | null;
    updatedAt: string;
  }): Promise<TaskRecord | null>;
  recordFailure(taskId: string, update: {
    failedAt: string;
    error: string;
    nextStatus: Extract<TaskRecord["status"], "queued" | "failed">;
    retryCount: number;
  }): Promise<TaskRecord | null>;
  listGates(taskId: string): Promise<GateRecord[]>;
  saveGates(taskId: string, gates: GateRecord[], releaseDecision: ReleaseDecision | null): Promise<void>;
}

export interface ExecutionStore {
  appendExecution(record: ExecutionRecord): Promise<void>;
  listExecutions(taskId: string): Promise<ExecutionRecord[]>;
}

export interface WorkerStore {
  registerWorker(worker: WorkerRecord): Promise<void>;
  updateWorkerStatus(workerId: string, status: WorkerRecord["status"], currentTaskId: string | null, summary?: string): Promise<void>;
  heartbeat(workerId: string, heartbeatAt: string): Promise<void>;
  listWorkers(): Promise<WorkerRecord[]>;
  getWorker(workerId: string): Promise<WorkerRecord | null>;
}

export interface OrgStore {
  getOrg(orgId: string): Promise<Org | null>;
  listTeams(orgId: string): Promise<Team[]>;
  seedDefaults(worker?: WorkerRecord | null): Promise<void>;
}

export interface MemoryStore {
  createSession(session: WorkerSession): Promise<void>;
  closeSession(sessionId: string, endedAt: string): Promise<void>;
  appendMemory(entry: MemoryEntry): Promise<void>;
  listRecentMemory(workerId: string, limit: number): Promise<MemoryEntry[]>;
  searchMemory(workerId: string, query: string, limit: number): Promise<MemoryEntry[]>;
  listSessions(workerId: string): Promise<WorkerSession[]>;
}

export interface BudgetPolicy {
  estimateDispatchCost(task: TaskRecord): number;
  canDispatch(task: TaskRecord, worker: WorkerRecord, org: Org): {
    allowed: boolean;
    reason?: string;
    estimatedCostUsd: number;
  };
}

export interface ApprovalPolicy {
  evaluate(input: CreateTaskInput): {
    approvalState: ApprovalState;
    approvalReason: string | null;
  };
}

export interface FailurePolicy {
  onFailure(task: TaskRecord, error: string): {
    nextStatus: Extract<TaskRecord["status"], "queued" | "failed">;
    retryCount: number;
  };
}

export interface SkillRegistry {
  resolve(task: TaskRecord): SkillDefinition[];
  list(): SkillDefinition[];
}

export interface DispatchPolicy {
  canWorkerExecute(task: TaskRecord, worker: WorkerRecord): {
    allowed: boolean;
    reason?: string;
  };
}

export type GateEvaluationContext = {
  task: TaskRecord;
  executions: ExecutionRecord[];
};

export type GateEvaluationResult = {
  status: GateRecord["status"];
  evidence: GateEvidence;
};

export interface ReviewGate {
  readonly gateType: Exclude<GateRecord["gateType"], "release">;
  evaluate(context: GateEvaluationContext): GateEvaluationResult;
}

export interface ReleaseGate {
  evaluate(context: GateEvaluationContext, priorGates: GateRecord[]): GateEvaluationResult & {
    decision: ReleaseDecision;
  };
}

export interface EventBus {
  publish(event: TaskEvent): Promise<void>;
  listRecent(limit: number): Promise<TaskEvent[]>;
  listByTask(taskId: string): Promise<TaskEvent[]>;
}

export interface WorkerAdapter {
  readonly name: string;
  readonly executionMode: ExecutionMode;
  describeRuntime?(): Promise<{
    capabilities?: string[];
    metadata?: Record<string, unknown>;
  }>;
  execute(input: WorkerExecutionInput): Promise<WorkerExecutionResult>;
}

export interface ControlPlaneQuery {
  getDashboardState(orgId: string): Promise<{
    org: Org;
    teams: Team[];
    workers: WorkerRecord[];
    tasks: TaskRecord[];
    gates: GateRecord[];
    recentEvents: TaskEvent[];
  }>;
}

export interface Stores extends TaskStore, ExecutionStore, WorkerStore, OrgStore, MemoryStore, EventBus, ControlPlaneQuery {}

export type CreateTaskCommand = CreateTaskInput;
