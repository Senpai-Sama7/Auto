import { z } from "zod";

export const TaskStatusSchema = z.enum([
  "queued",
  "dispatched",
  "running",
  "completed",
  "released",
  "failed"
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const WorkerStatusSchema = z.enum(["idle", "busy", "offline"]);
export type WorkerStatus = z.infer<typeof WorkerStatusSchema>;

export const ExecutionModeSchema = z.enum(["deterministic", "provider"]);
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;

export const AuthMethodSchema = z.enum(["password", "passkey"]);
export type AuthMethod = z.infer<typeof AuthMethodSchema>;

export const GateStatusSchema = z.enum(["pending", "passed", "blocked", "failed"]);
export type GateStatus = z.infer<typeof GateStatusSchema>;

export const GateTypeSchema = z.enum([
  "product",
  "engineering",
  "qa",
  "security",
  "release"
]);
export type GateType = z.infer<typeof GateTypeSchema>;

export const ApprovalStateSchema = z.enum(["pending", "approved", "rejected"]);
export type ApprovalState = z.infer<typeof ApprovalStateSchema>;

export const EventTypeSchema = z.enum([
  "task.created",
  "task.claimed",
  "task.started",
  "task.completed",
  "task.released",
  "task.failed",
  "task.retry_scheduled",
  "task.approval_updated",
  "worker.registered",
  "worker.heartbeat",
  "memory.appended",
  "gate.updated",
  "execution.recorded"
]);
export type EventType = z.infer<typeof EventTypeSchema>;

export const SkillPhaseSchema = z.enum([
  "spec",
  "plan",
  "slice",
  "tdd",
  "review",
  "release"
]);
export type SkillPhase = z.infer<typeof SkillPhaseSchema>;

export const ReviewSeveritySchema = z.enum(["low", "medium", "high"]);
export type ReviewSeverity = z.infer<typeof ReviewSeveritySchema>;

export const QaAreaSchema = z.enum(["api", "ui", "runtime", "data"]);
export type QaArea = z.infer<typeof QaAreaSchema>;

export const SecurityCategorySchema = z.enum(["validation", "trust-boundary", "audit", "data", "auth"]);
export type SecurityCategory = z.infer<typeof SecurityCategorySchema>;

export const SecurityControlStatusSchema = z.enum(["implemented", "missing"]);
export type SecurityControlStatus = z.infer<typeof SecurityControlStatusSchema>;

export const ReleaseCheckStatusSchema = z.enum(["satisfied", "blocked"]);
export type ReleaseCheckStatus = z.infer<typeof ReleaseCheckStatusSchema>;

export const CapabilitySchema = z.string().min(1);
export type Capability = z.infer<typeof CapabilitySchema>;

export const ReviewFindingSchema = z.object({
  title: z.string(),
  severity: ReviewSeveritySchema,
  detail: z.string()
});
export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;

export const QaCheckSchema = z.object({
  id: z.string(),
  area: QaAreaSchema,
  command: z.string(),
  expected: z.string()
});
export type QaCheck = z.infer<typeof QaCheckSchema>;

export const SecurityControlSchema = z.object({
  id: z.string(),
  category: SecurityCategorySchema,
  control: z.string(),
  status: SecurityControlStatusSchema
});
export type SecurityControl = z.infer<typeof SecurityControlSchema>;

export const ReleaseCheckSchema = z.object({
  id: z.string(),
  item: z.string(),
  status: ReleaseCheckStatusSchema,
  source: z.string()
});
export type ReleaseCheck = z.infer<typeof ReleaseCheckSchema>;

export const TaskArtifactsSchema = z.object({
  specDoc: z.string(),
  planDoc: z.string(),
  acceptanceCriteria: z.array(z.string()).min(1),
  taskSlices: z.array(z.string()).min(1),
  risks: z.array(z.string()),
  tddNotes: z.array(z.string()).min(1),
  reviewFindings: z.array(ReviewFindingSchema),
  qaChecks: z.array(QaCheckSchema).min(1),
  securityControls: z.array(SecurityControlSchema).min(1),
  releaseChecks: z.array(ReleaseCheckSchema).min(1),
  learningNotes: z.array(z.string()).min(1)
});
export type TaskArtifacts = z.infer<typeof TaskArtifactsSchema>;

export const GateRuleResultSchema = z.object({
  code: z.string(),
  passed: z.boolean(),
  message: z.string()
});
export type GateRuleResult = z.infer<typeof GateRuleResultSchema>;

export const GateEvidenceSchema = z.object({
  summary: z.string(),
  rules: z.array(GateRuleResultSchema),
  generatedAt: z.string()
});
export type GateEvidence = z.infer<typeof GateEvidenceSchema>;

export const ReleaseDecisionSchema = z.object({
  allowed: z.boolean(),
  reasons: z.array(z.string()),
  blockingReasons: z.array(z.string()),
  decidedAt: z.string()
});
export type ReleaseDecision = z.infer<typeof ReleaseDecisionSchema>;

export const PaperclipTaskRefSchema = z.object({
  companyId: z.string(),
  goalId: z.string().nullable(),
  issueId: z.string(),
  issueIdentifier: z.string().nullable(),
  issueUrl: z.string().nullable()
});
export type PaperclipTaskRef = z.infer<typeof PaperclipTaskRefSchema>;

export const HermesTaskRefSchema = z.object({
  conversationId: z.string(),
  lastResponseId: z.string().nullable()
});
export type HermesTaskRef = z.infer<typeof HermesTaskRefSchema>;

export const OpenClawTaskRefSchema = z.object({
  agentId: z.string(),
  runId: z.string().nullable(),
  sessionId: z.string().nullable(),
  sessionKey: z.string(),
  gatewayUrl: z.string().nullable()
});
export type OpenClawTaskRef = z.infer<typeof OpenClawTaskRefSchema>;

export const TaskIntegrationRefsSchema = z.object({
  paperclip: PaperclipTaskRefSchema.nullable().optional(),
  hermes: HermesTaskRefSchema.nullable().optional(),
  openclaw: OpenClawTaskRefSchema.nullable().optional()
});
export type TaskIntegrationRefs = z.infer<typeof TaskIntegrationRefsSchema>;

export const ToolCallRecordSchema = z.object({
  name: z.string(),
  argumentsJson: z.string(),
  resultSummary: z.string().nullable()
});
export type ToolCallRecord = z.infer<typeof ToolCallRecordSchema>;

export const ExecutionUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative()
});
export type ExecutionUsage = z.infer<typeof ExecutionUsageSchema>;

export const ExecutionStatusSchema = z.enum(["succeeded", "failed"]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const ExecutionRecordSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  workerId: z.string(),
  adapter: z.string(),
  executionMode: ExecutionModeSchema,
  provider: z.string(),
  model: z.string(),
  prompt: z.string(),
  response: z.string(),
  summary: z.string(),
  toolCalls: z.array(ToolCallRecordSchema),
  usage: ExecutionUsageSchema,
  status: ExecutionStatusSchema,
  error: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string()
});
export type ExecutionRecord = z.infer<typeof ExecutionRecordSchema>;

export const OrgSchema = z.object({
  id: z.string(),
  name: z.string(),
  mission: z.string(),
  monthlyBudgetUsd: z.number(),
  spentBudgetUsd: z.number(),
  createdAt: z.string()
});
export type Org = z.infer<typeof OrgSchema>;

export const TeamSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  name: z.string(),
  purpose: z.string(),
  createdAt: z.string()
});
export type Team = z.infer<typeof TeamSchema>;

export const WorkerRecordSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  teamId: z.string(),
  name: z.string(),
  role: z.string(),
  adapter: z.string(),
  status: WorkerStatusSchema,
  currentTaskId: z.string().nullable(),
  capabilities: z.array(CapabilitySchema),
  executionModes: z.array(ExecutionModeSchema),
  monthlyBudgetUsd: z.number(),
  spentBudgetUsd: z.number(),
  lastHeartbeatAt: z.string().nullable(),
  lastSummary: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type WorkerRecord = z.infer<typeof WorkerRecordSchema>;

export const UserRoleSchema = z.enum(["viewer", "requester", "approver", "admin"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const PasskeyTransportSchema = z.string().min(1);
export type PasskeyTransport = z.infer<typeof PasskeyTransportSchema>;

export const PasskeyDeviceTypeSchema = z.enum(["singleDevice", "multiDevice"]);
export type PasskeyDeviceType = z.infer<typeof PasskeyDeviceTypeSchema>;

export const PasskeyChallengeFlowSchema = z.enum(["registration", "authentication"]);
export type PasskeyChallengeFlow = z.infer<typeof PasskeyChallengeFlowSchema>;

export const UserRecordSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: UserRoleSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  lastLoginAt: z.string().nullable()
});
export type UserRecord = z.infer<typeof UserRecordSchema>;

export const SessionRecordSchema = z.object({
  id: z.string(),
  userId: z.string(),
  tokenHash: z.string(),
  authMethod: AuthMethodSchema,
  createdAt: z.string(),
  expiresAt: z.string()
});
export type SessionRecord = z.infer<typeof SessionRecordSchema>;

export const PasskeyCredentialRecordSchema = z.object({
  id: z.string(),
  userId: z.string(),
  webauthnUserId: z.string(),
  publicKey: z.string(),
  counter: z.number().int().nonnegative(),
  deviceType: PasskeyDeviceTypeSchema,
  backedUp: z.boolean(),
  transports: z.array(PasskeyTransportSchema),
  label: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable()
});
export type PasskeyCredentialRecord = z.infer<typeof PasskeyCredentialRecordSchema>;

export const PasskeyCredentialSummarySchema = z.object({
  id: z.string(),
  userId: z.string(),
  deviceType: PasskeyDeviceTypeSchema,
  backedUp: z.boolean(),
  transports: z.array(PasskeyTransportSchema),
  label: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable()
});
export type PasskeyCredentialSummary = z.infer<typeof PasskeyCredentialSummarySchema>;

export const PasskeyChallengeRecordSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  flowType: PasskeyChallengeFlowSchema,
  challenge: z.string(),
  context: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  expiresAt: z.string()
});
export type PasskeyChallengeRecord = z.infer<typeof PasskeyChallengeRecordSchema>;

export const TaskRecordSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  teamId: z.string(),
  title: z.string(),
  description: z.string(),
  requestedBy: z.string(),
  skillHint: z.string().nullable(),
  requiredCapabilities: z.array(CapabilitySchema),
  executionMode: ExecutionModeSchema,
  status: TaskStatusSchema,
  approvalState: ApprovalStateSchema,
  approvalReason: z.string().nullable(),
  approvedBy: z.string().nullable(),
  approvedAt: z.string().nullable(),
  route: z.string(),
  assignedWorkerId: z.string().nullable(),
  budgetCapUsd: z.number(),
  budgetEstimateUsd: z.number(),
  budgetActualUsd: z.number(),
  idempotencyKey: z.string().nullable(),
  retryCount: z.number().int().nonnegative(),
  maxRetries: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  resultSummary: z.string().nullable(),
  artifacts: TaskArtifactsSchema.nullable(),
  integrationRefs: TaskIntegrationRefsSchema.nullable(),
  releaseDecision: ReleaseDecisionSchema.nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type TaskRecord = z.infer<typeof TaskRecordSchema>;

export const GateRecordSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  gateType: GateTypeSchema,
  status: GateStatusSchema,
  required: z.boolean(),
  evidence: GateEvidenceSchema,
  updatedAt: z.string()
});
export type GateRecord = z.infer<typeof GateRecordSchema>;

export const TaskEventSchema = z.object({
  id: z.string(),
  taskId: z.string().nullable(),
  workerId: z.string().nullable(),
  eventType: EventTypeSchema,
  actor: z.string(),
  detail: z.record(z.string(), z.unknown()),
  createdAt: z.string()
});
export type TaskEvent = z.infer<typeof TaskEventSchema>;

export const MemoryEntrySchema = z.object({
  id: z.string(),
  workerId: z.string(),
  taskId: z.string().nullable(),
  category: z.enum(["session-summary", "learning", "artifact", "recall"]),
  content: z.string(),
  createdAt: z.string()
});
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

export const WorkerSessionSchema = z.object({
  id: z.string(),
  workerId: z.string(),
  taskId: z.string(),
  status: z.enum(["open", "closed"]),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  recallSummary: z.string()
});
export type WorkerSession = z.infer<typeof WorkerSessionSchema>;

export const SkillDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  phase: SkillPhaseSchema,
  summary: z.string()
});
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;

export const WorkerExecutionInputSchema = z.object({
  task: TaskRecordSchema,
  worker: WorkerRecordSchema,
  recall: z.array(MemoryEntrySchema),
  skills: z.array(SkillDefinitionSchema)
});
export type WorkerExecutionInput = z.infer<typeof WorkerExecutionInputSchema>;

export const WorkerExecutionResultSchema = z.object({
  summary: z.string(),
  artifacts: TaskArtifactsSchema,
  memoryAdditions: z.array(
    z.object({
      category: MemoryEntrySchema.shape.category,
      content: z.string()
    })
  ),
  execution: ExecutionRecordSchema,
  integrationRefs: TaskIntegrationRefsSchema.nullable().optional(),
  estimatedCostUsd: z.number(),
  actualCostUsd: z.number()
});
export type WorkerExecutionResult = z.infer<typeof WorkerExecutionResultSchema>;

export const DashboardStateSchema = z.object({
  org: OrgSchema,
  teams: z.array(TeamSchema),
  workers: z.array(WorkerRecordSchema),
  tasks: z.array(TaskRecordSchema),
  gates: z.array(GateRecordSchema),
  recentEvents: z.array(TaskEventSchema)
});
export type DashboardState = z.infer<typeof DashboardStateSchema>;
