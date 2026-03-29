import { mkdirSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { dirname } from "node:path";
import type {
  AuthMethod,
  DashboardState,
  ExecutionRecord,
  GateEvidence,
  GateRecord,
  MemoryEntry,
  Org,
  PasskeyChallengeRecord,
  PasskeyCredentialRecord,
  PasskeyCredentialSummary,
  ReleaseDecision,
  SessionRecord,
  TaskArtifacts,
  TaskIntegrationRefs,
  TaskEvent,
  TaskRecord,
  Team,
  UserRecord,
  WorkerExecutionResult,
  WorkerRecord,
  WorkerSession
} from "@ultimate-system/contracts";
import { createDefaultOrg, nowIso } from "@ultimate-system/core";
import type { ControlPlaneQuery, Stores } from "@ultimate-system/core";
import { schemaSql } from "./migrations.js";

type RowValue = string | number | bigint | Uint8Array | null | undefined;
type SqlParam = Exclude<RowValue, undefined>;
type Row = Record<string, RowValue>;

function parseJson<T>(value: RowValue, fallback: T): T {
  if (typeof value !== "string") {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function text(value: RowValue, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableText(value: RowValue): string | null {
  return typeof value === "string" ? value : null;
}

function numeric(value: RowValue, fallback = 0): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return fallback;
}

function boolFromInt(value: RowValue): boolean {
  return value === 1 || value === 1n;
}

function getRow(statement: StatementSync, ...params: SqlParam[]): Row | undefined {
  const row = statement.get(...params);
  return row as Row | undefined;
}

function allRows(statement: StatementSync, ...params: SqlParam[]): Row[] {
  return statement.all(...params) as Row[];
}

function toOrg(row: Row): Org {
  return {
    id: text(row.id),
    name: text(row.name),
    mission: text(row.mission),
    monthlyBudgetUsd: numeric(row.monthly_budget_usd),
    spentBudgetUsd: numeric(row.spent_budget_usd),
    createdAt: text(row.created_at)
  };
}

function toTeam(row: Row): Team {
  return {
    id: text(row.id),
    orgId: text(row.org_id),
    name: text(row.name),
    purpose: text(row.purpose),
    createdAt: text(row.created_at)
  };
}

function toTask(row: Row): TaskRecord {
  return {
    id: text(row.id),
    orgId: text(row.org_id),
    teamId: text(row.team_id),
    title: text(row.title),
    description: text(row.description),
    requestedBy: text(row.requested_by),
    skillHint: nullableText(row.skill_hint),
    requiredCapabilities: parseJson<string[]>(row.required_capabilities_json, []),
    executionMode: text(row.execution_mode, "deterministic") as TaskRecord["executionMode"],
    status: text(row.status) as TaskRecord["status"],
    approvalState: text(row.approval_state) as TaskRecord["approvalState"],
    approvalReason: nullableText(row.approval_reason),
    approvedBy: nullableText(row.approved_by),
    approvedAt: nullableText(row.approved_at),
    route: text(row.route),
    assignedWorkerId: nullableText(row.assigned_worker_id),
    budgetCapUsd: numeric(row.budget_cap_usd),
    budgetEstimateUsd: numeric(row.budget_estimate_usd),
    budgetActualUsd: numeric(row.budget_actual_usd),
    idempotencyKey: nullableText(row.idempotency_key),
    retryCount: numeric(row.retry_count),
    maxRetries: numeric(row.max_retries),
    lastError: nullableText(row.last_error),
    resultSummary: nullableText(row.result_summary),
    artifacts: parseJson<TaskArtifacts | null>(row.artifacts_json, null),
    integrationRefs: parseJson<TaskIntegrationRefs | null>(row.integration_refs_json, null),
    releaseDecision: parseJson<ReleaseDecision | null>(row.release_decision_json, null),
    startedAt: nullableText(row.started_at),
    completedAt: nullableText(row.completed_at),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at)
  };
}

function toWorker(row: Row): WorkerRecord {
  return {
    id: text(row.id),
    orgId: text(row.org_id),
    teamId: text(row.team_id),
    name: text(row.name),
    role: text(row.role),
    adapter: text(row.adapter),
    status: text(row.status) as WorkerRecord["status"],
    currentTaskId: nullableText(row.current_task_id),
    capabilities: parseJson<string[]>(row.capabilities_json, []),
    executionModes: parseJson<WorkerRecord["executionModes"]>(row.execution_modes_json, ["deterministic"]),
    monthlyBudgetUsd: numeric(row.monthly_budget_usd),
    spentBudgetUsd: numeric(row.spent_budget_usd),
    lastHeartbeatAt: nullableText(row.last_heartbeat_at),
    lastSummary: nullableText(row.last_summary),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at)
  };
}

function toGate(row: Row): GateRecord {
  return {
    id: text(row.id),
    taskId: text(row.task_id),
    gateType: text(row.gate_type) as GateRecord["gateType"],
    status: text(row.status) as GateRecord["status"],
    required: boolFromInt(row.required),
    evidence: parseJson<GateEvidence>(row.evidence_json, {
      summary: "Gate evidence missing.",
      rules: [],
      generatedAt: nowIso()
    }),
    updatedAt: text(row.updated_at)
  };
}

function toEvent(row: Row): TaskEvent {
  return {
    id: text(row.id),
    taskId: nullableText(row.task_id),
    workerId: nullableText(row.worker_id),
    eventType: text(row.event_type) as TaskEvent["eventType"],
    actor: text(row.actor),
    detail: parseJson<Record<string, unknown>>(row.detail_json, {}),
    createdAt: text(row.created_at)
  };
}

function toMemory(row: Row): MemoryEntry {
  return {
    id: text(row.id),
    workerId: text(row.worker_id),
    taskId: nullableText(row.task_id),
    category: text(row.category) as MemoryEntry["category"],
    content: text(row.content),
    createdAt: text(row.created_at)
  };
}

function toWorkerSession(row: Row): WorkerSession {
  return {
    id: text(row.id),
    workerId: text(row.worker_id),
    taskId: text(row.task_id),
    status: text(row.status) as WorkerSession["status"],
    startedAt: text(row.started_at),
    endedAt: nullableText(row.ended_at),
    recallSummary: text(row.recall_summary)
  };
}

function toExecution(row: Row): ExecutionRecord {
  return {
    id: text(row.id),
    taskId: text(row.task_id),
    workerId: text(row.worker_id),
    adapter: text(row.adapter),
    executionMode: text(row.execution_mode) as ExecutionRecord["executionMode"],
    provider: text(row.provider),
    model: text(row.model),
    prompt: text(row.prompt),
    response: text(row.response),
    summary: text(row.summary),
    toolCalls: parseJson<ExecutionRecord["toolCalls"]>(row.tool_calls_json, []),
    usage: parseJson<ExecutionRecord["usage"]>(row.usage_json, {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0
    }),
    status: text(row.status) as ExecutionRecord["status"],
    error: nullableText(row.error),
    createdAt: text(row.created_at),
    completedAt: text(row.completed_at)
  };
}

function toUser(row: Row): UserRecord {
  return {
    id: text(row.id),
    email: text(row.email),
    name: text(row.name),
    role: text(row.role) as UserRecord["role"],
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    lastLoginAt: nullableText(row.last_login_at)
  };
}

function toAuthSession(row: Row): SessionRecord {
  return {
    id: text(row.id),
    userId: text(row.user_id),
    tokenHash: text(row.token_hash),
    authMethod: text(row.auth_method, "password") as AuthMethod,
    createdAt: text(row.created_at),
    expiresAt: text(row.expires_at)
  };
}

function toPasskeyCredential(row: Row): PasskeyCredentialRecord {
  return {
    id: text(row.id),
    userId: text(row.user_id),
    webauthnUserId: text(row.webauthn_user_id),
    publicKey: text(row.public_key),
    counter: numeric(row.counter),
    deviceType: text(row.device_type) as PasskeyCredentialRecord["deviceType"],
    backedUp: boolFromInt(row.backed_up),
    transports: parseJson<string[]>(row.transports_json, []),
    label: nullableText(row.label),
    createdAt: text(row.created_at),
    lastUsedAt: nullableText(row.last_used_at)
  };
}

function toPasskeyCredentialSummary(row: Row): PasskeyCredentialSummary {
  const credential = toPasskeyCredential(row);
  return {
    id: credential.id,
    userId: credential.userId,
    deviceType: credential.deviceType,
    backedUp: credential.backedUp,
    transports: credential.transports,
    label: credential.label,
    createdAt: credential.createdAt,
    lastUsedAt: credential.lastUsedAt
  };
}

function toPasskeyChallenge(row: Row): PasskeyChallengeRecord {
  return {
    id: text(row.id),
    userId: nullableText(row.user_id),
    flowType: text(row.flow_type) as PasskeyChallengeRecord["flowType"],
    challenge: text(row.challenge),
    context: parseJson<Record<string, unknown>>(row.context_json, {}),
    createdAt: text(row.created_at),
    expiresAt: text(row.expires_at)
  };
}

export class SqlitePlatformStore implements Stores, ControlPlaneQuery {
  private readonly db: DatabaseSync;

  constructor(private readonly databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath, {
      timeout: 5000,
      defensive: true
    });
    this.db.exec(schemaSql);
    this.ensureColumn("sessions", "auth_method", "TEXT NOT NULL DEFAULT 'password'");
  }

  close(): void {
    this.db.close();
  }

  private ensureColumn(tableName: string, columnName: string, definitionSql: string): void {
    const columns = allRows(this.db.prepare(`PRAGMA table_info(${tableName})`));
    const hasColumn = columns.some((column) => text(column.name) === columnName);
    if (!hasColumn) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
    }
  }

  async seedDefaults(worker?: WorkerRecord | null): Promise<void> {
    const org = createDefaultOrg();
    const team: Team = {
      id: "team-platform",
      orgId: org.id,
      name: "Platform",
      purpose: "Orchestration, worker runtime, governance, and release control.",
      createdAt: nowIso()
    };

    this.db.prepare(
      `INSERT INTO orgs (id, name, mission, monthly_budget_usd, spent_budget_usd, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`
    ).run(org.id, org.name, org.mission, org.monthlyBudgetUsd, org.spentBudgetUsd, org.createdAt);

    this.db.prepare(
      `INSERT INTO teams (id, org_id, name, purpose, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`
    ).run(team.id, team.orgId, team.name, team.purpose, team.createdAt);

    if (worker) {
      await this.registerWorker(worker);
    }
  }

  async createTask(task: TaskRecord, gates: GateRecord[]): Promise<void> {
    const insertTask = this.db.prepare(
      `INSERT INTO tasks (
        id, org_id, team_id, title, description, requested_by, skill_hint, required_capabilities_json,
        execution_mode, status, approval_state, approval_reason, approved_by, approved_at, route,
        assigned_worker_id, budget_cap_usd, budget_estimate_usd, budget_actual_usd, idempotency_key,
        retry_count, max_retries, last_error, result_summary, artifacts_json, release_decision_json,
        integration_refs_json, started_at, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertGate = this.db.prepare(
      `INSERT INTO gates (id, task_id, gate_type, status, required, evidence_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    this.db.exec("BEGIN IMMEDIATE");
    try {
      insertTask.run(
        task.id,
        task.orgId,
        task.teamId,
        task.title,
        task.description,
        task.requestedBy,
        task.skillHint,
        JSON.stringify(task.requiredCapabilities),
        task.executionMode,
        task.status,
        task.approvalState,
        task.approvalReason,
        task.approvedBy,
        task.approvedAt,
        task.route,
        task.assignedWorkerId,
        task.budgetCapUsd,
        task.budgetEstimateUsd,
        task.budgetActualUsd,
        task.idempotencyKey,
        task.retryCount,
        task.maxRetries,
        task.lastError,
        task.resultSummary,
        task.artifacts ? JSON.stringify(task.artifacts) : null,
        task.releaseDecision ? JSON.stringify(task.releaseDecision) : null,
        task.integrationRefs ? JSON.stringify(task.integrationRefs) : null,
        task.startedAt,
        task.completedAt,
        task.createdAt,
        task.updatedAt
      );

      for (const gate of gates) {
        insertGate.run(
          gate.id,
          gate.taskId,
          gate.gateType,
          gate.status,
          gate.required ? 1 : 0,
          JSON.stringify(gate.evidence),
          gate.updatedAt
        );
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async findTaskByIdempotencyKey(idempotencyKey: string): Promise<TaskRecord | null> {
    const row = getRow(this.db.prepare("SELECT * FROM tasks WHERE idempotency_key = ?"), idempotencyKey);
    return row ? toTask(row) : null;
  }

  async getTask(taskId: string): Promise<TaskRecord | null> {
    const row = getRow(this.db.prepare("SELECT * FROM tasks WHERE id = ?"), taskId);
    return row ? toTask(row) : null;
  }

  async listTasks(): Promise<TaskRecord[]> {
    return allRows(this.db.prepare("SELECT * FROM tasks ORDER BY created_at DESC")).map(toTask);
  }

  async listQueuedTasks(): Promise<TaskRecord[]> {
    return allRows(
      this.db.prepare("SELECT * FROM tasks WHERE status = 'queued' ORDER BY created_at ASC")
    ).map(toTask);
  }

  async claimTask(taskId: string, workerId: string, dispatchedAt: string): Promise<TaskRecord | null> {
    const result = this.db.prepare(
      `UPDATE tasks
       SET status = 'dispatched', assigned_worker_id = ?, updated_at = ?
       WHERE id = ? AND status = 'queued'`
    ).run(workerId, dispatchedAt, taskId);

    if (result.changes !== 1) {
      return null;
    }

    return this.getTask(taskId);
  }

  async recoverTasksForWorker(workerId: string, recoveredAt: string, reason: string): Promise<TaskRecord[]> {
    const rows = allRows(
      this.db.prepare(
        `SELECT id
         FROM tasks
         WHERE assigned_worker_id = ?
           AND status IN ('dispatched', 'running')
         ORDER BY created_at ASC`
      ),
      workerId
    );
    const taskIds = rows.map((row) => text(row.id));
    if (taskIds.length === 0) {
      return [];
    }

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const statement = this.db.prepare(
        `UPDATE tasks
         SET status = 'queued',
             last_error = ?,
             assigned_worker_id = NULL,
             started_at = NULL,
             updated_at = ?
         WHERE id = ?
           AND assigned_worker_id = ?
           AND status IN ('dispatched', 'running')`
      );

      for (const taskId of taskIds) {
        statement.run(reason, recoveredAt, taskId, workerId);
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    const recoveredTasks = await Promise.all(taskIds.map(async (taskId) => this.getTask(taskId)));
    return recoveredTasks.filter((task): task is TaskRecord => task !== null);
  }

  async markTaskRunning(taskId: string, workerId: string, startedAt: string, budgetEstimateUsd: number): Promise<TaskRecord | null> {
    this.db.prepare(
      `UPDATE tasks
       SET status = 'running',
           assigned_worker_id = ?,
           started_at = ?,
           budget_estimate_usd = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(workerId, startedAt, budgetEstimateUsd, startedAt, taskId);
    return this.getTask(taskId);
  }

  async completeTask(taskId: string, update: {
    completedAt: string;
    summary: string;
    artifacts: WorkerExecutionResult["artifacts"];
    budgetActualUsd: number;
    releaseDecision: ReleaseDecision | null;
  }): Promise<TaskRecord | null> {
    const task = await this.getTask(taskId);
    if (!task) {
      return null;
    }

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(
        `UPDATE tasks
         SET status = 'completed',
             completed_at = ?,
             result_summary = ?,
             artifacts_json = ?,
             budget_actual_usd = ?,
             release_decision_json = ?,
             updated_at = ?
         WHERE id = ?`
      ).run(
        update.completedAt,
        update.summary,
        JSON.stringify(update.artifacts),
        update.budgetActualUsd,
        update.releaseDecision ? JSON.stringify(update.releaseDecision) : null,
        update.completedAt,
        taskId
      );

      this.db.prepare(
        `UPDATE workers
         SET spent_budget_usd = spent_budget_usd + ?, updated_at = ?
         WHERE id = ?`
      ).run(update.budgetActualUsd, update.completedAt, task.assignedWorkerId);

      this.db.prepare(
        `UPDATE orgs
         SET spent_budget_usd = spent_budget_usd + ?
         WHERE id = ?`
      ).run(update.budgetActualUsd, task.orgId);

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return this.getTask(taskId);
  }

  async updateApproval(taskId: string, update: {
    approvalState: TaskRecord["approvalState"];
    approvalReason: string;
    approvedBy: string | null;
    approvedAt: string | null;
    updatedAt: string;
  }): Promise<TaskRecord | null> {
    this.db.prepare(
      `UPDATE tasks
       SET approval_state = ?, approval_reason = ?, approved_by = ?, approved_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      update.approvalState,
      update.approvalReason,
      update.approvedBy,
      update.approvedAt,
      update.updatedAt,
      taskId
    );
    return this.getTask(taskId);
  }

  async updateTaskIntegrationRefs(taskId: string, integrationRefs: TaskIntegrationRefs | null): Promise<TaskRecord | null> {
    this.db.prepare(
      `UPDATE tasks
       SET integration_refs_json = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      integrationRefs ? JSON.stringify(integrationRefs) : null,
      nowIso(),
      taskId
    );
    return this.getTask(taskId);
  }

  async recordFailure(taskId: string, update: {
    failedAt: string;
    error: string;
    nextStatus: Extract<TaskRecord["status"], "queued" | "failed">;
    retryCount: number;
  }): Promise<TaskRecord | null> {
    this.db.prepare(
      `UPDATE tasks
       SET status = ?, last_error = ?, retry_count = ?, assigned_worker_id = NULL, updated_at = ?
       WHERE id = ?`
    ).run(update.nextStatus, update.error, update.retryCount, update.failedAt, taskId);
    return this.getTask(taskId);
  }

  async listGates(taskId: string): Promise<GateRecord[]> {
    return allRows(
      this.db.prepare("SELECT * FROM gates WHERE task_id = ? ORDER BY gate_type ASC"),
      taskId
    ).map(toGate);
  }

  async saveGates(taskId: string, gates: GateRecord[], releaseDecision: ReleaseDecision | null): Promise<void> {
    const updateGate = this.db.prepare(
      `UPDATE gates
       SET status = ?, evidence_json = ?, updated_at = ?
       WHERE id = ? AND task_id = ?`
    );
    const releaseGate = gates.find((gate) => gate.gateType === "release");
    const nextTaskStatus = releaseGate?.status === "passed" ? "released" : "completed";
    const releaseUpdatedAt = releaseGate?.updatedAt ?? nowIso();

    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const gate of gates) {
        updateGate.run(
          gate.status,
          JSON.stringify(gate.evidence),
          gate.updatedAt,
          gate.id,
          taskId
        );
      }

      this.db.prepare(
        `UPDATE tasks
         SET status = ?, release_decision_json = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        nextTaskStatus,
        releaseDecision ? JSON.stringify(releaseDecision) : null,
        releaseUpdatedAt,
        taskId
      );

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async appendExecution(record: ExecutionRecord): Promise<void> {
    this.db.prepare(
      `INSERT INTO task_executions (
        id, task_id, worker_id, adapter, execution_mode, provider, model, prompt, response, summary,
        tool_calls_json, usage_json, status, error, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      record.id,
      record.taskId,
      record.workerId,
      record.adapter,
      record.executionMode,
      record.provider,
      record.model,
      record.prompt,
      record.response,
      record.summary,
      JSON.stringify(record.toolCalls),
      JSON.stringify(record.usage),
      record.status,
      record.error,
      record.createdAt,
      record.completedAt
    );
  }

  async listExecutions(taskId: string): Promise<ExecutionRecord[]> {
    return allRows(
      this.db.prepare("SELECT * FROM task_executions WHERE task_id = ? ORDER BY created_at DESC"),
      taskId
    ).map(toExecution);
  }

  async upsertUser(user: {
    id: string;
    email: string;
    name: string;
    passwordHash: string;
    role: UserRecord["role"];
    createdAt: string;
    updatedAt: string;
  }): Promise<void> {
    this.db.prepare(
      `INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(email) DO UPDATE SET
         name = excluded.name,
         password_hash = excluded.password_hash,
         role = excluded.role,
         updated_at = excluded.updated_at`
    ).run(
      user.id,
      user.email,
      user.name,
      user.passwordHash,
      user.role,
      user.createdAt,
      user.updatedAt
    );
  }

  async listUsers(): Promise<UserRecord[]> {
    return allRows(
      this.db.prepare("SELECT * FROM users ORDER BY created_at ASC")
    ).map(toUser);
  }

  async getUserByEmail(email: string): Promise<(UserRecord & { passwordHash: string }) | null> {
    const row = getRow(this.db.prepare("SELECT * FROM users WHERE email = ?"), email);
    if (!row) {
      return null;
    }
    return {
      ...toUser(row),
      passwordHash: text(row.password_hash)
    };
  }

  async getUserById(userId: string): Promise<UserRecord | null> {
    const row = getRow(this.db.prepare("SELECT * FROM users WHERE id = ?"), userId);
    return row ? toUser(row) : null;
  }

  async touchUserLogin(userId: string, loginAt: string): Promise<void> {
    this.db.prepare(
      `UPDATE users
       SET last_login_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(loginAt, loginAt, userId);
  }

  async createAuthSession(session: SessionRecord): Promise<void> {
    this.db.prepare(
      `INSERT INTO sessions (id, user_id, token_hash, auth_method, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      session.id,
      session.userId,
      session.tokenHash,
      session.authMethod,
      session.createdAt,
      session.expiresAt
    );
  }

  async getSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const row = getRow(
      this.db.prepare("SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?"),
      tokenHash,
      nowIso()
    );
    return row ? toAuthSession(row) : null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }

  async savePasskeyCredential(credential: PasskeyCredentialRecord): Promise<void> {
    this.db.prepare(
      `INSERT INTO passkey_credentials (
        id, user_id, webauthn_user_id, public_key, counter, device_type, backed_up, transports_json,
        label, created_at, last_used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        public_key = excluded.public_key,
        counter = excluded.counter,
        device_type = excluded.device_type,
        backed_up = excluded.backed_up,
        transports_json = excluded.transports_json,
        label = COALESCE(excluded.label, passkey_credentials.label),
        last_used_at = COALESCE(excluded.last_used_at, passkey_credentials.last_used_at)`
    ).run(
      credential.id,
      credential.userId,
      credential.webauthnUserId,
      credential.publicKey,
      credential.counter,
      credential.deviceType,
      credential.backedUp ? 1 : 0,
      JSON.stringify(credential.transports),
      credential.label,
      credential.createdAt,
      credential.lastUsedAt
    );
  }

  async listPasskeyCredentialsByUser(userId: string): Promise<PasskeyCredentialRecord[]> {
    return allRows(
      this.db.prepare("SELECT * FROM passkey_credentials WHERE user_id = ? ORDER BY created_at DESC"),
      userId
    ).map(toPasskeyCredential);
  }

  async listPasskeyCredentialSummariesByUser(userId: string): Promise<PasskeyCredentialSummary[]> {
    return allRows(
      this.db.prepare("SELECT * FROM passkey_credentials WHERE user_id = ? ORDER BY created_at DESC"),
      userId
    ).map(toPasskeyCredentialSummary);
  }

  async getPasskeyCredential(credentialId: string): Promise<PasskeyCredentialRecord | null> {
    const row = getRow(
      this.db.prepare("SELECT * FROM passkey_credentials WHERE id = ?"),
      credentialId
    );
    return row ? toPasskeyCredential(row) : null;
  }

  async updatePasskeyCredentialUsage(
    credentialId: string,
    update: Pick<PasskeyCredentialRecord, "counter" | "deviceType" | "backedUp"> & { lastUsedAt: string }
  ): Promise<void> {
    this.db.prepare(
      `UPDATE passkey_credentials
       SET counter = ?, device_type = ?, backed_up = ?, last_used_at = ?
       WHERE id = ?`
    ).run(
      update.counter,
      update.deviceType,
      update.backedUp ? 1 : 0,
      update.lastUsedAt,
      credentialId
    );
  }

  async deletePasskeyCredential(userId: string, credentialId: string): Promise<boolean> {
    const result = this.db.prepare(
      "DELETE FROM passkey_credentials WHERE id = ? AND user_id = ?"
    ).run(credentialId, userId);
    return numeric(result.changes, 0) > 0;
  }

  async createPasskeyChallenge(record: PasskeyChallengeRecord): Promise<void> {
    this.db.prepare(
      `INSERT INTO passkey_challenges (id, user_id, flow_type, challenge, context_json, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      record.id,
      record.userId,
      record.flowType,
      record.challenge,
      JSON.stringify(record.context),
      record.createdAt,
      record.expiresAt
    );
  }

  async consumePasskeyChallenge(
    challengeId: string,
    flowType: PasskeyChallengeRecord["flowType"]
  ): Promise<PasskeyChallengeRecord | null> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = getRow(
        this.db.prepare(
          "SELECT * FROM passkey_challenges WHERE id = ? AND flow_type = ? AND expires_at > ?"
        ),
        challengeId,
        flowType,
        nowIso()
      );
      if (!row) {
        this.db.exec("COMMIT");
        return null;
      }

      this.db.prepare("DELETE FROM passkey_challenges WHERE id = ?").run(challengeId);
      this.db.exec("COMMIT");
      return toPasskeyChallenge(row);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async registerWorker(worker: WorkerRecord): Promise<void> {
    this.db.prepare(
      `INSERT INTO workers (
        id, org_id, team_id, name, role, adapter, status, current_task_id, capabilities_json,
        execution_modes_json, monthly_budget_usd, spent_budget_usd, last_heartbeat_at, last_summary,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        role = excluded.role,
        adapter = excluded.adapter,
        status = excluded.status,
        current_task_id = excluded.current_task_id,
        capabilities_json = excluded.capabilities_json,
        execution_modes_json = excluded.execution_modes_json,
        monthly_budget_usd = excluded.monthly_budget_usd,
        spent_budget_usd = excluded.spent_budget_usd,
        last_heartbeat_at = excluded.last_heartbeat_at,
        last_summary = excluded.last_summary,
        updated_at = excluded.updated_at`
    ).run(
      worker.id,
      worker.orgId,
      worker.teamId,
      worker.name,
      worker.role,
      worker.adapter,
      worker.status,
      worker.currentTaskId,
      JSON.stringify(worker.capabilities),
      JSON.stringify(worker.executionModes),
      worker.monthlyBudgetUsd,
      worker.spentBudgetUsd,
      worker.lastHeartbeatAt,
      worker.lastSummary,
      worker.createdAt,
      worker.updatedAt
    );
  }

  async updateWorkerStatus(workerId: string, status: WorkerRecord["status"], currentTaskId: string | null, summary?: string): Promise<void> {
    this.db.prepare(
      `UPDATE workers
       SET status = ?, current_task_id = ?, last_summary = COALESCE(?, last_summary), updated_at = ?
       WHERE id = ?`
    ).run(status, currentTaskId, summary ?? null, nowIso(), workerId);
  }

  async heartbeat(workerId: string, heartbeatAt: string): Promise<void> {
    this.db.prepare(
      "UPDATE workers SET last_heartbeat_at = ?, updated_at = ? WHERE id = ?"
    ).run(heartbeatAt, heartbeatAt, workerId);
  }

  async listWorkers(): Promise<WorkerRecord[]> {
    return allRows(this.db.prepare("SELECT * FROM workers ORDER BY created_at ASC")).map(toWorker);
  }

  async getWorker(workerId: string): Promise<WorkerRecord | null> {
    const row = getRow(this.db.prepare("SELECT * FROM workers WHERE id = ?"), workerId);
    return row ? toWorker(row) : null;
  }

  async getOrg(orgId: string): Promise<Org | null> {
    const row = getRow(this.db.prepare("SELECT * FROM orgs WHERE id = ?"), orgId);
    return row ? toOrg(row) : null;
  }

  async listTeams(orgId: string): Promise<Team[]> {
    return allRows(
      this.db.prepare("SELECT * FROM teams WHERE org_id = ? ORDER BY created_at ASC"),
      orgId
    ).map(toTeam);
  }

  async createSession(session: WorkerSession): Promise<void> {
    this.db.prepare(
      `INSERT INTO worker_sessions (id, worker_id, task_id, status, started_at, ended_at, recall_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      session.id,
      session.workerId,
      session.taskId,
      session.status,
      session.startedAt,
      session.endedAt,
      session.recallSummary
    );
  }

  async closeSession(sessionId: string, endedAt: string): Promise<void> {
    this.db.prepare(
      "UPDATE worker_sessions SET status = 'closed', ended_at = ? WHERE id = ?"
    ).run(endedAt, sessionId);
  }

  async appendMemory(entry: MemoryEntry): Promise<void> {
    this.db.prepare(
      `INSERT INTO memory_entries (id, worker_id, task_id, category, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(entry.id, entry.workerId, entry.taskId, entry.category, entry.content, entry.createdAt);
  }

  async listRecentMemory(workerId: string, limit: number): Promise<MemoryEntry[]> {
    return allRows(
      this.db.prepare(
        "SELECT * FROM memory_entries WHERE worker_id = ? ORDER BY created_at DESC LIMIT ?"
      ),
      workerId,
      limit
    ).map(toMemory);
  }

  async searchMemory(workerId: string, query: string, limit: number): Promise<MemoryEntry[]> {
    return allRows(
      this.db.prepare(
        `SELECT * FROM memory_entries
         WHERE worker_id = ? AND content LIKE ?
         ORDER BY created_at DESC
         LIMIT ?`
      ),
      workerId,
      `%${query}%`,
      limit
    ).map(toMemory);
  }

  async listSessions(workerId: string): Promise<WorkerSession[]> {
    return allRows(
      this.db.prepare(
        "SELECT * FROM worker_sessions WHERE worker_id = ? ORDER BY started_at DESC"
      ),
      workerId
    ).map(toWorkerSession);
  }

  async publish(event: TaskEvent): Promise<void> {
    this.db.prepare(
      `INSERT INTO events (id, task_id, worker_id, event_type, actor, detail_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      event.id,
      event.taskId,
      event.workerId,
      event.eventType,
      event.actor,
      JSON.stringify(event.detail),
      event.createdAt
    );

    const eventBusUrl = process.env.RELIANTAI_EVENT_BUS_URL;
    if (eventBusUrl) {
      try {
        await fetch(eventBusUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: `ultimate_system.${event.eventType}`,
            payload: event
          })
        });
      } catch (error) {
        console.error(`Failed to publish event to ReliantAI event bus (${eventBusUrl}):`, error);
      }
    }
  }

  async listRecent(limit: number): Promise<TaskEvent[]> {
    return allRows(
      this.db.prepare("SELECT * FROM events ORDER BY created_at DESC LIMIT ?"),
      limit
    ).map(toEvent);
  }

  async listByTask(taskId: string): Promise<TaskEvent[]> {
    return allRows(
      this.db.prepare("SELECT * FROM events WHERE task_id = ? ORDER BY created_at ASC"),
      taskId
    ).map(toEvent);
  }

  async getDashboardState(orgId: string): Promise<DashboardState> {
    const org = await this.getOrg(orgId);
    if (!org) {
      throw new Error(`Unknown org ${orgId}`);
    }

    const teams = await this.listTeams(orgId);
    const workers = (await this.listWorkers()).filter((worker) => worker.orgId === orgId);
    const tasks = (await this.listTasks()).filter((task) => task.orgId === orgId);
    const gates = tasks.flatMap((task) =>
      allRows(this.db.prepare("SELECT * FROM gates WHERE task_id = ? ORDER BY gate_type ASC"), task.id).map(toGate)
    );
    const recentEvents = await this.listRecent(25);

    return {
      org,
      teams,
      workers,
      tasks,
      gates,
      recentEvents
    };
  }
}
