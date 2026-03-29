import { randomUUID } from "node:crypto";
import type {
  ExecutionRecord,
  ExecutionUsage,
  TaskArtifacts,
  TaskIntegrationRefs,
  TaskRecord,
  ToolCallRecord,
  WorkerExecutionInput,
  WorkerExecutionResult
} from "@ultimate-system/contracts";
import { TaskArtifactsSchema } from "@ultimate-system/contracts";
import type { WorkerAdapter } from "@ultimate-system/core";
import {
  buildOpenClawEnv,
  callOpenClawGatewayJson,
  getOpenClawSkills,
  getOpenClawToolCatalog,
  nowIso,
  resolveOpenClawHttpBase
} from "@ultimate-system/core";
import {
  createDefaultCommandRunner,
  defaultVerificationCommands,
  repoRoot,
  runVerificationSuite,
  type CommandRunner,
  type VerificationCommand,
  type VerificationResult
} from "./commandRunner.js";
import {
  hermesApiKey,
  hermesApiUrl,
  hermesModel,
  openclawAgentId,
  openclawAgentModel,
  openclawGatewayToken,
  openclawGatewayUrl,
  openclawHomeDir,
  openAiModel,
  openAiResponsesUrl,
  terminalDockerImage,
  verificationBackend,
  reliantAIAgentUrl
} from "./env.js";

type ProviderPayload = {
  summary: string;
  artifacts: TaskArtifacts;
  memoryAdditions: string[];
};

type OpenClawAgentResponse = {
  runId?: string;
  status?: string;
  summary?: string;
  result?: {
    payloads?: Array<{
      text?: string;
      mediaUrl?: string | null;
      mediaUrls?: string[];
    }>;
    meta?: {
      agentMeta?: {
        sessionId?: string;
        provider?: string;
        model?: string;
        usage?: {
          input?: number;
          output?: number;
          total?: number;
          cost?: number;
        };
      };
    };
  };
};

type OpenClawGatewayCallResponse<T> = {
  ok?: boolean;
  result?: T;
  error?: { message?: string } | string;
};

type OpenAIResponsesApiResponse = {
  id?: string;
  status?: string;
  error?: { message?: string } | null;
  output_text?: string;
  output?: Array<{
    type: string;
    name?: string;
    arguments?: string;
    content?: Array<{
      type: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
};

const securityControlCatalog: TaskArtifacts["securityControls"] = [
  {
    id: "validation-boundary",
    category: "validation",
    control: "Control-plane task and approval payloads are schema-validated before persistence.",
    status: "implemented"
  },
  {
    id: "audit-execution",
    category: "audit",
    control: "Task events, worker sessions, memory entries, and execution transcripts are persisted as audit records.",
    status: "implemented"
  },
  {
    id: "trust-boundary-output",
    category: "trust-boundary",
    control: "Worker output is persisted as data and evaluated by explicit gates before release.",
    status: "implemented"
  }
];

const openAiPricingByModel: Record<string, { inputUsdPerMillionTokens: number; outputUsdPerMillionTokens: number }> = {
  "gpt-5.4": { inputUsdPerMillionTokens: 1.25, outputUsdPerMillionTokens: 10 },
  "gpt-5-mini": { inputUsdPerMillionTokens: 0.25, outputUsdPerMillionTokens: 2 },
  "gpt-4o-mini": { inputUsdPerMillionTokens: 0.15, outputUsdPerMillionTokens: 0.6 }
};
const defaultOpenAiPricing = { inputUsdPerMillionTokens: 1.25, outputUsdPerMillionTokens: 10 };

const providerResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    artifacts: {
      type: "object",
      additionalProperties: false,
      properties: {
        specDoc: { type: "string" },
        planDoc: { type: "string" },
        acceptanceCriteria: { type: "array", items: { type: "string" }, minItems: 1 },
        taskSlices: { type: "array", items: { type: "string" }, minItems: 1 },
        risks: { type: "array", items: { type: "string" } },
        tddNotes: { type: "array", items: { type: "string" }, minItems: 1 },
        reviewFindings: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              severity: { type: "string", enum: ["low", "medium", "high"] },
              detail: { type: "string" }
            },
            required: ["title", "severity", "detail"]
          }
        },
        qaChecks: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              area: { type: "string", enum: ["api", "ui", "runtime", "data"] },
              command: { type: "string" },
              expected: { type: "string" }
            },
            required: ["id", "area", "command", "expected"]
          }
        },
        securityControls: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              category: { type: "string", enum: ["validation", "trust-boundary", "audit", "data", "auth"] },
              control: { type: "string" },
              status: { type: "string", enum: ["implemented", "missing"] }
            },
            required: ["id", "category", "control", "status"]
          }
        },
        releaseChecks: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              item: { type: "string" },
              status: { type: "string", enum: ["satisfied", "blocked"] },
              source: { type: "string" }
            },
            required: ["id", "item", "status", "source"]
          }
        },
        learningNotes: { type: "array", items: { type: "string" }, minItems: 1 }
      },
      required: [
        "specDoc",
        "planDoc",
        "acceptanceCriteria",
        "taskSlices",
        "risks",
        "tddNotes",
        "reviewFindings",
        "qaChecks",
        "securityControls",
        "releaseChecks",
        "learningNotes"
      ]
    },
    memoryAdditions: {
      type: "array",
      items: { type: "string" },
      minItems: 1
    }
  },
  required: ["summary", "artifacts", "memoryAdditions"]
} as const;

export class WorkerExecutionFailure extends Error {
  constructor(
    message: string,
    readonly execution: ExecutionRecord
  ) {
    super(message);
    this.name = "WorkerExecutionFailure";
  }
}

function shortOutput(result: VerificationResult): string {
  const text = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (text.length <= 400) {
    return text;
  }
  return `${text.slice(0, 397).trimEnd()}...`;
}

function createSpecDoc(input: WorkerExecutionInput, verificationResults: VerificationResult[]): string {
  const recallSection = input.recall.length > 0
    ? input.recall.map((entry) => `- [${entry.category}] ${entry.content}`).join("\n")
    : "- No prior worker memory was recalled.";
  const commands = verificationResults.map((result) => `- ${result.command} (exit ${result.exitCode})`).join("\n");
  return [
    "# Runtime Specification",
    "",
    `## Task`,
    input.task.title,
    "",
    "## Requested Outcome",
    input.task.description,
    "",
    "## Required Capabilities",
    input.task.requiredCapabilities.map((capability) => `- ${capability}`).join("\n"),
    "",
    "## Recalled Context",
    recallSection,
    "",
    "## Verification Commands",
    commands
  ].join("\n");
}

function createPlanDoc(task: TaskRecord, commands: VerificationCommand[]): string {
  const planLines = [
    `1. Restate the task intent and capture acceptance criteria for "${task.title}".`,
    "2. Route the task through the explicit worker execution boundary.",
    "3. Produce review and security notes before release is considered."
  ];
  const verificationLines = commands.map(
    (command, index) => `${index + 4}. Run \`${command.command}\` and persist its output as gate evidence.`
  );
  return ["# Execution Plan", "", ...planLines, ...verificationLines].join("\n");
}

function createReleaseChecks(verificationResults: VerificationResult[]): TaskArtifacts["releaseChecks"] {
  return verificationResults.map((result) => ({
    id: `release-${result.id}`,
    item: `${result.command} exits 0`,
    status: result.exitCode === 0 ? "satisfied" : "blocked",
    source: `command:${result.command}`
  }));
}

function createQaChecks(verificationResults: VerificationResult[]): TaskArtifacts["qaChecks"] {
  return verificationResults.map((result) => ({
    id: result.id,
    area: result.area,
    command: result.command,
    expected: result.expected
  }));
}

function createReviewFindings(verificationResults: VerificationResult[]): TaskArtifacts["reviewFindings"] {
  const failures = verificationResults.filter((result) => result.exitCode !== 0);
  if (failures.length === 0) {
    return [
      {
        title: "Verification suite passed",
        severity: "low",
        detail: "Lint, typecheck, build, and test completed successfully for this execution."
      }
    ];
  }

  return failures.map((result) => ({
    title: `${result.command} failed`,
    severity: "high" as const,
    detail: shortOutput(result) || `Command exited with status ${result.exitCode}.`
  }));
}

function mergeReviewFindings(
  verificationResults: VerificationResult[],
  providerFindings: TaskArtifacts["reviewFindings"] | undefined
): TaskArtifacts["reviewFindings"] {
  const factualFindings = createReviewFindings(verificationResults);
  if (!providerFindings || providerFindings.length === 0) {
    return factualFindings;
  }

  const advisoryFindings = providerFindings.map((finding) => ({
    title: `Advisory: ${finding.title}`,
    severity: finding.severity === "high" ? "medium" as const : finding.severity,
    detail: `Provider advisory: ${finding.detail}`
  }));

  return [...factualFindings, ...advisoryFindings];
}

function mergeSecurityControls(
  providerControls: TaskArtifacts["securityControls"] | undefined
): TaskArtifacts["securityControls"] {
  if (!providerControls || providerControls.length === 0) {
    return securityControlCatalog;
  }

  const merged = [...securityControlCatalog];
  for (const control of providerControls) {
    if (control.status !== "implemented") {
      continue;
    }
    if (merged.some((candidate) => candidate.id === control.id)) {
      continue;
    }
    merged.push(control);
  }

  return merged;
}

function createArtifacts(
  input: WorkerExecutionInput,
  verificationResults: VerificationResult[],
  partial: Partial<TaskArtifacts> = {}
): TaskArtifacts {
  const acceptanceCriteria = [
    `The task "${input.task.title}" is preserved as an auditable control-plane record.`,
    "Worker execution persists sessions, memory, and execution transcripts.",
    ...verificationResults.map((result) => `${result.command} returns exit 0.`)
  ];

  const taskSlices = [
    "Capture the requested outcome as a specification.",
    "Run repository verification commands through the worker runtime.",
    "Persist execution, memory, and gate evidence records.",
    "Allow release only when approval and verification checks align."
  ];

  const risks = verificationResults
    .filter((result) => result.exitCode !== 0)
    .map((result) => `${result.command} failed: ${shortOutput(result) || `exit ${result.exitCode}`}`);

  const artifacts: TaskArtifacts = {
    specDoc: partial.specDoc ?? createSpecDoc(input, verificationResults),
    planDoc: partial.planDoc ?? createPlanDoc(input.task, defaultVerificationCommands),
    acceptanceCriteria: partial.acceptanceCriteria ?? acceptanceCriteria,
    taskSlices: partial.taskSlices ?? taskSlices,
    risks: partial.risks ?? risks,
    tddNotes: partial.tddNotes ?? [
      "Assert task creation is idempotent when an idempotency key is reused.",
      "Assert only one worker can claim a queued task.",
      "Assert release is blocked whenever a prerequisite gate or verification command fails."
    ],
    reviewFindings: mergeReviewFindings(verificationResults, partial.reviewFindings),
    qaChecks: createQaChecks(verificationResults),
    securityControls: mergeSecurityControls(partial.securityControls),
    releaseChecks: createReleaseChecks(verificationResults),
    learningNotes: partial.learningNotes ?? [
      `Execution retained ${input.recall.length} recalled memory entries for ${input.task.title}.`,
      "Operational evidence is more credible when it is backed by actual repository gate commands."
    ]
  };

  return TaskArtifactsSchema.parse(artifacts);
}

function createMemoryAdditions(taskTitle: string, summary: string, learningNotes: string[]) {
  return [
    {
      category: "session-summary" as const,
      content: `Session summary for ${taskTitle}: ${summary}`
    },
    ...learningNotes.slice(0, 2).map((note) => ({
      category: "learning" as const,
      content: note
    }))
  ];
}

function createUsage(costUsd: number, inputTokens = 0, outputTokens = 0): ExecutionUsage {
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costUsd: Number(costUsd.toFixed(6))
  };
}

function createToolCalls(verificationResults: VerificationResult[]): ToolCallRecord[] {
  return verificationResults.map((result) => ({
    name: result.command,
    argumentsJson: JSON.stringify({
      area: result.area,
      expected: result.expected,
      required: result.required
    }),
    resultSummary: `exit ${result.exitCode} in ${result.durationMs}ms${shortOutput(result) ? `; ${shortOutput(result)}` : ""}`
  }));
}

function createExecutionRecord(input: WorkerExecutionInput, init: {
  adapter: string;
  executionMode: ExecutionRecord["executionMode"];
  provider: string;
  model: string;
  prompt: string;
  response: string;
  summary: string;
  toolCalls: ToolCallRecord[];
  usage: ExecutionUsage;
  status: ExecutionRecord["status"];
  error: string | null;
  createdAt?: string;
  completedAt?: string;
}): ExecutionRecord {
  return {
    id: randomUUID(),
    taskId: input.task.id,
    workerId: input.worker.id,
    adapter: init.adapter,
    executionMode: init.executionMode,
    provider: init.provider,
    model: init.model,
    prompt: init.prompt,
    response: init.response,
    summary: init.summary,
    toolCalls: init.toolCalls,
    usage: init.usage,
    status: init.status,
    error: init.error,
    createdAt: init.createdAt ?? nowIso(),
    completedAt: init.completedAt ?? nowIso()
  };
}

function buildRuntimePrompt(input: WorkerExecutionInput): string {
  return [
    `Task: ${input.task.title}`,
    `Description: ${input.task.description}`,
    `Execution mode: ${input.task.executionMode}`,
    `Required capabilities: ${input.task.requiredCapabilities.join(", ")}`,
    `Approval state: ${input.task.approvalState}`,
    `Recall: ${input.recall.map((entry) => `[${entry.category}] ${entry.content}`).join(" | ") || "none"}`,
    `Skills: ${input.skills.map((skill) => `${skill.phase}:${skill.name}`).join(", ")}`,
    "The worker must produce structured artifacts and preserve explicit trust boundaries."
  ].join("\n");
}

function buildProviderContractText(): string {
  return [
    "{",
    '  "summary": "string",',
    '  "artifacts": {',
    '    "specDoc": "string",',
    '    "planDoc": "string",',
    '    "acceptanceCriteria": ["string"],',
    '    "taskSlices": ["string"],',
    '    "risks": ["string"],',
    '    "tddNotes": ["string"],',
    '    "reviewFindings": [{"title":"string","severity":"low|medium|high","detail":"string"}],',
    '    "qaChecks": [{"id":"string","area":"api|ui|runtime|data","command":"string","expected":"string"}],',
    '    "securityControls": [{"id":"string","category":"validation|trust-boundary|audit|data|auth","control":"string","status":"implemented|missing"}],',
    '    "releaseChecks": [{"id":"string","item":"string","status":"satisfied|blocked","source":"string"}],',
    '    "learningNotes": ["string"]',
    "  },",
    '  "memoryAdditions": ["string"]',
    "}"
  ].join("\n");
}

function failedVerificationSummary(taskTitle: string, verificationResults: VerificationResult[]): string {
  const failures = verificationResults.filter((result) => result.exitCode !== 0);
  return `Verification failed for ${taskTitle}: ${failures.map((result) => `${result.command} (exit ${result.exitCode})`).join(", ")}`;
}

type DeterministicRuntimeOptions = {
  commandRunner?: CommandRunner;
  verificationCommands?: VerificationCommand[];
};

export class DeterministicRuntimeAdapter implements WorkerAdapter {
  readonly name = "deterministic-runtime-adapter";
  readonly executionMode = "deterministic" as const;

  private readonly commandRunner: CommandRunner;
  private readonly verificationCommands: VerificationCommand[];

  constructor(options: DeterministicRuntimeOptions = {}) {
    this.commandRunner = options.commandRunner ?? createDefaultCommandRunner({
      cwd: repoRoot,
      backend: verificationBackend,
      image: terminalDockerImage
    });
    this.verificationCommands = options.verificationCommands ?? defaultVerificationCommands;
  }

  async execute(input: WorkerExecutionInput): Promise<WorkerExecutionResult> {
    const prompt = buildRuntimePrompt(input);
    const verificationResults = await runVerificationSuite(this.commandRunner, this.verificationCommands);
    const artifacts = createArtifacts(input, verificationResults);
    const summary = verificationResults.every((result) => result.exitCode === 0)
      ? `Deterministic runtime verified ${input.task.title} with ${verificationResults.length} repository gate commands.`
      : failedVerificationSummary(input.task.title, verificationResults);
    const execution = createExecutionRecord(input, {
      adapter: this.name,
      executionMode: this.executionMode,
      provider: "local-runtime",
      model: "deterministic-rule-engine",
      prompt,
      response: JSON.stringify({
        summary,
        verificationResults
      }, null, 2),
      summary,
      toolCalls: createToolCalls(verificationResults),
      usage: createUsage(0),
      status: verificationResults.every((result) => result.exitCode === 0) ? "succeeded" : "failed",
      error: verificationResults.every((result) => result.exitCode === 0)
        ? null
        : failedVerificationSummary(input.task.title, verificationResults)
    });

    if (execution.status === "failed") {
      throw new WorkerExecutionFailure(execution.error ?? "Deterministic runtime verification failed.", execution);
    }

    return {
      summary,
      artifacts,
      memoryAdditions: createMemoryAdditions(input.task.title, summary, artifacts.learningNotes),
      execution,
      integrationRefs: input.task.integrationRefs,
      estimatedCostUsd: 0,
      actualCostUsd: 0
    };
  }
}

type OpenAIResponsesAdapterOptions = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  commandRunner?: CommandRunner;
  verificationCommands?: VerificationCommand[];
  inputUsdPerMillionTokens?: number;
  outputUsdPerMillionTokens?: number;
};

type HermesResponsesAdapterOptions = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  commandRunner?: CommandRunner;
  verificationCommands?: VerificationCommand[];
  inputUsdPerMillionTokens?: number;
  outputUsdPerMillionTokens?: number;
};

function extractOutputText(response: OpenAIResponsesApiResponse): string | null {
  return response.output_text
    ?? response.output
      ?.flatMap((item) => item.content ?? [])
      .find((part) => part.type === "output_text")
      ?.text
    ?? null;
}

function extractRefusalText(response: OpenAIResponsesApiResponse): string | null {
  return response.output
    ?.flatMap((item) => item.content ?? [])
    .find((part) => part.type === "refusal")
    ?.refusal
    ?? null;
}

function extractToolCalls(
  verificationResults: VerificationResult[],
  output: OpenAIResponsesApiResponse["output"] = []
): ToolCallRecord[] {
  const providerToolCalls = output
    .filter((item) => item.type !== "message")
    .map((item) => ({
      name: item.name ?? item.type,
      argumentsJson: item.arguments ?? "{}",
      resultSummary: item.type
    }));
  return [
    ...createToolCalls(verificationResults),
    ...providerToolCalls
  ];
}

function mergeIntegrationRefs(task: TaskRecord, refs: Partial<TaskIntegrationRefs> | undefined): TaskIntegrationRefs | undefined {
  if (!refs) {
    return task.integrationRefs ?? undefined;
  }
  return {
    ...(task.integrationRefs ?? {}),
    ...refs
  };
}

function sanitizeOpenClawSessionFragment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "main";
}

export function createOpenClawSessionKey(agentId: string, taskId: string): string {
  return `agent:${sanitizeOpenClawSessionFragment(agentId)}:task:${sanitizeOpenClawSessionFragment(taskId)}`;
}

function extractOpenClawPayloadText(response: OpenClawAgentResponse): string {
  const payloads = response.result?.payloads ?? [];
  const text = payloads
    .map((payload) => payload.text?.trim())
    .filter((candidate): candidate is string => Boolean(candidate && candidate.length > 0))
    .join("\n\n")
    .trim();

  if (!text) {
    throw new Error("OpenClaw returned no text payload.");
  }

  return text;
}

function extractOpenClawUsage(response: OpenClawAgentResponse): ExecutionUsage {
  const usage = response.result?.meta?.agentMeta?.usage;
  const inputTokens = usage?.input ?? 0;
  const outputTokens = usage?.output ?? 0;
  const totalTokens = usage?.total ?? inputTokens + outputTokens;
  const costUsd = usage?.cost ?? 0;
  return createUsage(costUsd, inputTokens, outputTokens || Math.max(0, totalTokens - inputTokens));
}

function extractOpenClawAggregateUsage(responses: OpenClawAgentResponse[]): ExecutionUsage {
  return responses.reduce<ExecutionUsage>(
    (aggregate, response) => {
      const usage = extractOpenClawUsage(response);
      return createUsage(
        aggregate.costUsd + usage.costUsd,
        aggregate.inputTokens + usage.inputTokens,
        aggregate.outputTokens + usage.outputTokens
      );
    },
    createUsage(0)
  );
}

export function extractLikelyOpenClawProviderError(rawText: string): string | null {
  const normalized = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (!normalized) {
    return "OpenClaw returned an empty provider payload.";
  }
  if (normalized.startsWith("{") || normalized.startsWith("[")) {
    return null;
  }

  const lower = normalized.toLowerCase();
  const providerErrorSignals = [
    "account is not active",
    "billing",
    "quota",
    "rate limit",
    "does not have access",
    "unauthorized",
    "authentication",
    "invalid api key",
    "service unavailable",
    "permission denied",
    "provider",
    "project `",
    "error:"
  ];

  return providerErrorSignals.some((signal) => lower.includes(signal)) ? normalized : null;
}

function summarizeOpenClawToolResult(content: unknown): string | null {
  if (typeof content === "string") {
    return content.length > 200 ? `${content.slice(0, 197).trimEnd()}...` : content;
  }
  if (content === null || content === undefined) {
    return null;
  }

  try {
    const serialized = JSON.stringify(content);
    return serialized.length > 200 ? `${serialized.slice(0, 197).trimEnd()}...` : serialized;
  } catch {
    return null;
  }
}

function extractOpenClawToolCalls(messages: Array<Record<string, unknown>>): ToolCallRecord[] {
  const toolResults = new Map<string, string | null>();

  for (const message of messages) {
    const content = Array.isArray(message.content) ? message.content : [];
    for (const entry of content) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const record = entry as Record<string, unknown>;
      const type = typeof record.type === "string" ? record.type.toLowerCase() : "";
      const toolCallId = typeof record.toolCallId === "string"
        ? record.toolCallId
        : typeof record.id === "string"
          ? record.id
          : null;

      if (type === "toolresult" || type === "tool_result") {
        if (!toolCallId) {
          continue;
        }
        toolResults.set(
          toolCallId,
          summarizeOpenClawToolResult(record.result ?? record.output ?? record.content ?? null)
        );
      }
    }
  }

  const toolCalls: ToolCallRecord[] = [];
  for (const message of messages) {
    const content = Array.isArray(message.content) ? message.content : [];
    for (const entry of content) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const record = entry as Record<string, unknown>;
      const type = typeof record.type === "string" ? record.type.toLowerCase() : "";
      if (type !== "toolcall" && type !== "tool_call") {
        continue;
      }

      const toolCallId = typeof record.toolCallId === "string"
        ? record.toolCallId
        : typeof record.id === "string"
          ? record.id
          : null;
      const name = typeof record.name === "string" ? record.name : "unknown";
      const args = record.input ?? record.arguments ?? {};
      let argumentsJson = "{}";
      try {
        argumentsJson = typeof args === "string" ? args : JSON.stringify(args);
      } catch {
        argumentsJson = JSON.stringify({ unserializable: true });
      }

      toolCalls.push({
        name,
        argumentsJson,
        resultSummary: toolCallId ? toolResults.get(toolCallId) ?? null : null
      });
    }
  }

  return toolCalls;
}

async function fetchOpenClawHistory(params: {
  sessionKey: string;
  gatewayUrl: string;
  gatewayToken: string;
}): Promise<Array<Record<string, unknown>>> {
  const historyUrl = new URL(
    `/sessions/${encodeURIComponent(params.sessionKey)}/history?limit=200`,
    resolveOpenClawHttpBase(params.gatewayUrl)
  );
  const response = await fetch(historyUrl, {
    headers: {
      authorization: `Bearer ${params.gatewayToken}`,
      "x-openclaw-scopes": "operator.read"
    }
  });
  const rawResponse = await response.text();

  if (!response.ok) {
    throw new Error(`OpenClaw history lookup failed with HTTP ${response.status}: ${rawResponse}`);
  }

  const payload = JSON.parse(rawResponse) as {
    messages?: Array<Record<string, unknown>>;
  };
  return payload.messages ?? [];
}

async function invokeOpenClawAgent(params: {
  agentId: string;
  gatewayUrl: string;
  gatewayToken: string;
  env: NodeJS.ProcessEnv;
  message: string;
  sessionKey: string;
  sessionId?: string | null;
  timeoutSeconds: number;
  idempotencyKey: string;
}): Promise<OpenClawAgentResponse> {
  const payload = await callOpenClawGatewayJson<OpenClawGatewayCallResponse<OpenClawAgentResponse>>(
    "agent",
    {
      agentId: params.agentId,
      message: params.message,
      sessionKey: params.sessionKey,
      ...(params.sessionId ? { sessionId: params.sessionId } : {}),
      timeout: params.timeoutSeconds,
      idempotencyKey: params.idempotencyKey
    },
    {
      rootDir: repoRoot,
      env: {
        ...params.env,
        OPENCLAW_GATEWAY_URL: params.gatewayUrl,
        OPENCLAW_GATEWAY_TOKEN: params.gatewayToken
      },
      expectFinal: true,
      timeoutMs: Math.max((params.timeoutSeconds + 30) * 1000, 60_000)
    }
  );

  if (payload.ok === false) {
    const message = typeof payload.error === "string" ? payload.error : payload.error?.message;
    throw new Error(message ?? "OpenClaw gateway agent call failed.");
  }
  if (!payload.result) {
    throw new Error("OpenClaw gateway agent call returned no final result.");
  }
  return payload.result;
}

type OpenClawAgentAdapterOptions = {
  agentId: string;
  gatewayUrl: string;
  gatewayToken: string;
  homeDir: string;
  model?: string;
  commandRunner?: CommandRunner;
  verificationCommands?: VerificationCommand[];
};

export class OpenAIResponsesAdapter implements WorkerAdapter {
  readonly name = "openai-responses-adapter";
  readonly executionMode = "provider" as const;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly commandRunner: CommandRunner;
  private readonly verificationCommands: VerificationCommand[];
  private readonly inputUsdPerMillionTokens: number;
  private readonly outputUsdPerMillionTokens: number;

  constructor(options: OpenAIResponsesAdapterOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "gpt-5.4";
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1/responses";
    this.commandRunner = options.commandRunner ?? createDefaultCommandRunner({
      cwd: repoRoot,
      backend: verificationBackend,
      image: terminalDockerImage
    });
    this.verificationCommands = options.verificationCommands ?? defaultVerificationCommands;
    const pricing = openAiPricingByModel[this.model] ?? defaultOpenAiPricing;
    this.inputUsdPerMillionTokens = options.inputUsdPerMillionTokens ?? pricing.inputUsdPerMillionTokens;
    this.outputUsdPerMillionTokens = options.outputUsdPerMillionTokens ?? pricing.outputUsdPerMillionTokens;
  }

  async execute(input: WorkerExecutionInput): Promise<WorkerExecutionResult> {
    const prompt = buildRuntimePrompt(input);
    const body = {
      model: this.model,
      input: [
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: [
                "You are producing structured execution artifacts for a governed worker runtime.",
                "Do not claim a command passed unless it appears in the later verification results added by the application.",
                "Focus on precise artifacts, risks, TDD notes, and learning notes.",
                "Return JSON only."
              ].join("\n")
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          strict: true,
          schema: providerResponseSchema
        }
      }
    };

    const createdAt = nowIso();
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });
    const rawResponse = await response.text();
    let parsedResponse: OpenAIResponsesApiResponse | null = null;

    try {
      parsedResponse = JSON.parse(rawResponse) as OpenAIResponsesApiResponse;
    } catch {
      parsedResponse = null;
    }

    if (!response.ok) {
      const execution = createExecutionRecord(input, {
        adapter: this.name,
        executionMode: this.executionMode,
        provider: "openai",
        model: this.model,
        prompt,
        response: rawResponse,
        summary: `Provider request failed for ${input.task.title}.`,
        toolCalls: [],
        usage: createUsage(0),
        status: "failed",
        error: parsedResponse?.error?.message ?? `Provider request failed with HTTP ${response.status}.`,
        createdAt
      });
      throw new WorkerExecutionFailure(execution.error ?? "Provider request failed.", execution);
    }

    const refusalText = parsedResponse ? extractRefusalText(parsedResponse) : null;
    const outputText = parsedResponse ? extractOutputText(parsedResponse) : null;

    if (refusalText || !outputText) {
      const execution = createExecutionRecord(input, {
        adapter: this.name,
        executionMode: this.executionMode,
        provider: "openai",
        model: this.model,
        prompt,
        response: rawResponse,
        summary: `Provider refused or returned no structured output for ${input.task.title}.`,
        toolCalls: [],
        usage: createUsage(0),
        status: "failed",
        error: refusalText ?? "Provider returned no output_text.",
        createdAt
      });
      throw new WorkerExecutionFailure(execution.error ?? "Provider returned no structured output.", execution);
    }

    const providerPayload = parseProviderPayload(outputText);
    const verificationResults = await runVerificationSuite(this.commandRunner, this.verificationCommands);
    const artifacts = createArtifacts(input, verificationResults, providerPayload.artifacts);
    const usage = createUsage(
      calculateOpenAICost(
        parsedResponse?.usage?.input_tokens ?? 0,
        parsedResponse?.usage?.output_tokens ?? 0,
        this.inputUsdPerMillionTokens,
        this.outputUsdPerMillionTokens
      ),
      parsedResponse?.usage?.input_tokens ?? 0,
      parsedResponse?.usage?.output_tokens ?? 0
    );
    const toolCalls = extractToolCalls(verificationResults, parsedResponse?.output ?? []);
    const summary = verificationResults.every((result) => result.exitCode === 0)
      ? providerPayload.summary
      : failedVerificationSummary(input.task.title, verificationResults);
    const execution = createExecutionRecord(input, {
      adapter: this.name,
      executionMode: this.executionMode,
      provider: "openai",
      model: this.model,
      prompt,
      response: rawResponse,
      summary,
      toolCalls,
      usage,
      status: verificationResults.every((result) => result.exitCode === 0) ? "succeeded" : "failed",
      error: verificationResults.every((result) => result.exitCode === 0)
        ? null
        : failedVerificationSummary(input.task.title, verificationResults),
      createdAt
    });

    if (execution.status === "failed") {
      throw new WorkerExecutionFailure(execution.error ?? "Provider verification failed.", execution);
    }

    return {
      summary,
      artifacts,
      memoryAdditions: createMemoryAdditions(
        input.task.title,
        summary,
        [...providerPayload.memoryAdditions, ...artifacts.learningNotes]
      ),
      execution,
      integrationRefs: input.task.integrationRefs,
      estimatedCostUsd: usage.costUsd,
      actualCostUsd: usage.costUsd
    };
  }
}

export class HermesResponsesAdapter implements WorkerAdapter {
  readonly name = "hermes-responses-adapter";
  readonly executionMode = "provider" as const;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly commandRunner: CommandRunner;
  private readonly verificationCommands: VerificationCommand[];
  private readonly inputUsdPerMillionTokens: number;
  private readonly outputUsdPerMillionTokens: number;

  constructor(options: HermesResponsesAdapterOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "hermes-agent";
    this.baseUrl = options.baseUrl ?? "http://127.0.0.1:8642/v1/responses";
    this.commandRunner = options.commandRunner ?? createDefaultCommandRunner({
      cwd: repoRoot,
      backend: verificationBackend,
      image: terminalDockerImage
    });
    this.verificationCommands = options.verificationCommands ?? defaultVerificationCommands;
    const pricing = openAiPricingByModel[this.model] ?? defaultOpenAiPricing;
    this.inputUsdPerMillionTokens = options.inputUsdPerMillionTokens ?? pricing.inputUsdPerMillionTokens;
    this.outputUsdPerMillionTokens = options.outputUsdPerMillionTokens ?? pricing.outputUsdPerMillionTokens;
  }

  private async requestStructuredResponse(input: WorkerExecutionInput, body: Record<string, unknown>, prompt: string, createdAt: string) {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });
    const rawResponse = await response.text();
    let parsedResponse: OpenAIResponsesApiResponse | null = null;

    try {
      parsedResponse = JSON.parse(rawResponse) as OpenAIResponsesApiResponse;
    } catch {
      parsedResponse = null;
    }

    if (!response.ok) {
      const execution = createExecutionRecord(input, {
        adapter: this.name,
        executionMode: this.executionMode,
        provider: "hermes",
        model: this.model,
        prompt,
        response: rawResponse,
        summary: `Hermes execution request failed for ${input.task.title}.`,
        toolCalls: [],
        usage: createUsage(0),
        status: "failed",
        error: parsedResponse?.error?.message ?? `Hermes request failed with HTTP ${response.status}.`,
        createdAt
      });
      throw new WorkerExecutionFailure(execution.error ?? "Hermes request failed.", execution);
    }

    if (!parsedResponse) {
      const execution = createExecutionRecord(input, {
        adapter: this.name,
        executionMode: this.executionMode,
        provider: "hermes",
        model: this.model,
        prompt,
        response: rawResponse,
        summary: `Hermes returned non-JSON output for ${input.task.title}.`,
        toolCalls: [],
        usage: createUsage(0),
        status: "failed",
        error: "Hermes returned a non-JSON response payload.",
        createdAt
      });
      throw new WorkerExecutionFailure(execution.error ?? "Invalid Hermes response.", execution);
    }

    const refusalText = extractRefusalText(parsedResponse);
    const outputText = extractOutputText(parsedResponse);
    if (refusalText || !outputText) {
      const execution = createExecutionRecord(input, {
        adapter: this.name,
        executionMode: this.executionMode,
        provider: "hermes",
        model: this.model,
        prompt,
        response: rawResponse,
        summary: `Hermes refused or returned no JSON output for ${input.task.title}.`,
        toolCalls: extractToolCalls([], parsedResponse.output ?? []),
        usage: createUsage(0),
        status: "failed",
        error: refusalText ?? "Hermes returned no output_text payload.",
        createdAt
      });
      throw new WorkerExecutionFailure(execution.error ?? "Hermes returned no usable output.", execution);
    }

    return {
      parsedResponse,
      rawResponse,
      outputText
    };
  }

  async execute(input: WorkerExecutionInput): Promise<WorkerExecutionResult> {
    const prompt = buildRuntimePrompt(input);
    const createdAt = nowIso();
    const contract = buildProviderContractText();
    const instructions = [
      "You are the governed worker runtime for the Ultimate System control plane.",
      "Do not use tools, inspect the filesystem, or execute commands.",
      "Reason only over the task payload, recalled memory, and the provided worker context.",
      "Treat model output as planning and artifact synthesis only; command verification happens outside Hermes.",
      "Return one strict JSON object with keys summary, artifacts, and memoryAdditions.",
      "The JSON must match this schema exactly:",
      contract,
      "Do not wrap the JSON in markdown fences."
    ].join("\n");
    const initialBody = {
      model: this.model,
      conversation: input.task.id,
      store: true,
      instructions,
      input: `${prompt}\n\nRequired JSON contract:\n${contract}`
    };
    const initialResponse = await this.requestStructuredResponse(input, initialBody, prompt, createdAt);
    const responses = [initialResponse];

    let providerPayload: ProviderPayload;
    try {
      providerPayload = parseProviderPayload(initialResponse.outputText);
    } catch (error) {
      const previousResponseId = initialResponse.parsedResponse.id;
      if (!previousResponseId) {
        throw error;
      }
      const repairBody = {
        model: this.model,
        previous_response_id: previousResponseId,
        store: true,
        instructions,
        input: [
          "Your previous response did not satisfy the required JSON contract.",
          `Validation error: ${error instanceof Error ? error.message : String(error)}`,
          "Return a corrected JSON object only.",
          "Do not wrap the JSON in markdown fences.",
          `Required JSON contract:\n${contract}`
        ].join("\n\n")
      };
      const repaired = await this.requestStructuredResponse(input, repairBody, prompt, createdAt);
      responses.push(repaired);
      providerPayload = parseProviderPayload(repaired.outputText);
    }

    const verificationResults = await runVerificationSuite(this.commandRunner, this.verificationCommands);
    const inputTokens = responses.reduce((sum, item) => sum + (item.parsedResponse.usage?.input_tokens ?? 0), 0);
    const outputTokens = responses.reduce((sum, item) => sum + (item.parsedResponse.usage?.output_tokens ?? 0), 0);
    const usage = createUsage(
      calculateOpenAICost(
        inputTokens,
        outputTokens,
        this.inputUsdPerMillionTokens,
        this.outputUsdPerMillionTokens
      ),
      inputTokens,
      outputTokens
    );
    const artifacts = createArtifacts(input, verificationResults, providerPayload.artifacts);
    const summary = verificationResults.every((result) => result.exitCode === 0)
      ? providerPayload.summary
      : failedVerificationSummary(input.task.title, verificationResults);
    const execution = createExecutionRecord(input, {
      adapter: this.name,
      executionMode: this.executionMode,
      provider: "hermes",
      model: this.model,
      prompt,
      response: responses.map((item) => item.rawResponse).join("\n\n--- HERMES RESPONSE ---\n\n"),
      summary,
      toolCalls: extractToolCalls(
        verificationResults,
        responses.flatMap((item) => item.parsedResponse.output ?? [])
      ),
      usage,
      status: verificationResults.every((result) => result.exitCode === 0) ? "succeeded" : "failed",
      error: verificationResults.every((result) => result.exitCode === 0)
        ? null
        : failedVerificationSummary(input.task.title, verificationResults),
      createdAt
    });

    if (execution.status === "failed") {
      throw new WorkerExecutionFailure(execution.error ?? "Hermes verification failed.", execution);
    }

    return {
      summary,
      artifacts,
      memoryAdditions: createMemoryAdditions(
        input.task.title,
        summary,
        [...providerPayload.memoryAdditions, ...artifacts.learningNotes]
      ),
      execution,
      integrationRefs: mergeIntegrationRefs(input.task, {
        hermes: {
          conversationId: input.task.id,
          lastResponseId: responses.at(-1)?.parsedResponse.id ?? null
        }
      }),
      estimatedCostUsd: usage.costUsd,
      actualCostUsd: usage.costUsd
    };
  }
}

export class OpenClawAgentAdapter implements WorkerAdapter {
  readonly name = "openclaw-agent-adapter";
  readonly executionMode = "provider" as const;

  private readonly agentId: string;
  private readonly gatewayUrl: string;
  private readonly gatewayToken: string;
  private readonly homeDir: string;
  private readonly model: string;
  private readonly commandRunner: CommandRunner;
  private readonly verificationCommands: VerificationCommand[];

  constructor(options: OpenClawAgentAdapterOptions) {
    this.agentId = options.agentId;
    this.gatewayUrl = options.gatewayUrl;
    this.gatewayToken = options.gatewayToken;
    this.homeDir = options.homeDir;
    this.model = options.model ?? "openai/gpt-4o-mini";
    this.commandRunner = options.commandRunner ?? createDefaultCommandRunner({
      cwd: repoRoot,
      backend: verificationBackend,
      image: terminalDockerImage
    });
    this.verificationCommands = options.verificationCommands ?? defaultVerificationCommands;
  }

  private createFailureExecution(
    input: WorkerExecutionInput,
    prompt: string,
    response: string,
    summary: string,
    error: string,
    usage: ExecutionUsage,
    createdAt: string,
    model: string
  ): ExecutionRecord {
    return createExecutionRecord(input, {
      adapter: this.name,
      executionMode: this.executionMode,
      provider: "openclaw",
      model,
      prompt,
      response,
      summary,
      toolCalls: [],
      usage,
      status: "failed",
      error,
      createdAt
    });
  }

  async describeRuntime(): Promise<{
    capabilities?: string[];
    metadata?: Record<string, unknown>;
  }> {
    const env = buildOpenClawEnv({
      OPENCLAW_HOME: this.homeDir,
      OPENCLAW_GATEWAY_URL: this.gatewayUrl,
      OPENCLAW_GATEWAY_TOKEN: this.gatewayToken
    }, repoRoot);
    const [skills, tools] = await Promise.all([
      getOpenClawSkills({ rootDir: repoRoot, env }),
      getOpenClawToolCatalog({ rootDir: repoRoot, env })
    ]);

    const capabilities = new Set<string>([
      "planning",
      "review",
      "qa",
      "security",
      "release"
    ]);

    for (const section of tools.sections) {
      capabilities.add(`group:${section.id}`);
      for (const tool of section.tools) {
        capabilities.add(`tool:${tool.id}`);
      }
    }
    for (const groupId of Object.keys(tools.groups)) {
      capabilities.add(groupId);
    }
    for (const skill of skills.skills) {
      capabilities.add(`skill:${skill.name}`);
    }

    return {
      capabilities: [...capabilities].sort(),
      metadata: {
        agentId: this.agentId,
        gatewayUrl: this.gatewayUrl,
        toolCount: tools.sections.reduce((sum, section) => sum + section.tools.length, 0),
        eligibleSkillCount: skills.skills.filter((skill) => skill.eligible).length,
        totalSkillCount: skills.skills.length
      }
    };
  }

  async execute(input: WorkerExecutionInput): Promise<WorkerExecutionResult> {
    const prompt = buildRuntimePrompt(input);
    const contract = buildProviderContractText();
    const createdAt = nowIso();
    const runtimeMessage = [
      "You are executing inside the Ultimate System OpenClaw worker runtime.",
      "You have access to the full OpenClaw tool and skill surface for this workspace.",
      "Use tools and skills when they materially improve the result, but keep the final answer machine-readable.",
      "Do not claim repository verification commands passed unless they are later recorded by the application.",
      "Return one strict JSON object with keys summary, artifacts, and memoryAdditions.",
      "Do not wrap the JSON in markdown fences.",
      "",
      "Required JSON contract:",
      contract,
      "",
      prompt
    ].join("\n");
    const env = buildOpenClawEnv({
      OPENCLAW_HOME: this.homeDir,
      OPENCLAW_GATEWAY_URL: this.gatewayUrl,
      OPENCLAW_GATEWAY_TOKEN: this.gatewayToken
    }, repoRoot);
    const sessionKey = createOpenClawSessionKey(this.agentId, input.task.id);
    const initialResponse = await invokeOpenClawAgent({
      agentId: this.agentId,
      gatewayUrl: this.gatewayUrl,
      gatewayToken: this.gatewayToken,
      env,
      message: runtimeMessage,
      sessionKey,
      timeoutSeconds: 600,
      idempotencyKey: `${input.task.id}:initial`
    });

    const providerResponses = [initialResponse];
    const rawResponses = [JSON.stringify(initialResponse, null, 2)];
    let providerPayload: ProviderPayload;
    let sessionId = initialResponse.result?.meta?.agentMeta?.sessionId ?? null;
    let initialText: string;
    try {
      initialText = extractOpenClawPayloadText(initialResponse);
    } catch (error) {
      const execution = this.createFailureExecution(
        input,
        prompt,
        rawResponses.join("\n\n--- OPENCLAW RESPONSE ---\n\n"),
        `OpenClaw returned no usable text payload for ${input.task.title}.`,
        error instanceof Error ? error.message : String(error),
        extractOpenClawAggregateUsage(providerResponses),
        createdAt,
        initialResponse.result?.meta?.agentMeta?.model ?? this.model
      );
      throw new WorkerExecutionFailure(execution.error ?? "OpenClaw returned no usable text payload.", execution);
    }
    const initialProviderError = extractLikelyOpenClawProviderError(initialText);
    if (initialProviderError) {
      const execution = this.createFailureExecution(
        input,
        prompt,
        rawResponses.join("\n\n--- OPENCLAW RESPONSE ---\n\n"),
        `OpenClaw provider failed for ${input.task.title}.`,
        initialProviderError,
        extractOpenClawAggregateUsage(providerResponses),
        createdAt,
        initialResponse.result?.meta?.agentMeta?.model ?? this.model
      );
      throw new WorkerExecutionFailure(execution.error ?? "OpenClaw provider failed.", execution);
    }
    try {
      providerPayload = parseProviderPayload(initialText);
    } catch (error) {
      if (!sessionId) {
        const execution = this.createFailureExecution(
          input,
          prompt,
          rawResponses.join("\n\n--- OPENCLAW RESPONSE ---\n\n"),
          `OpenClaw returned invalid JSON for ${input.task.title}.`,
          error instanceof Error ? error.message : String(error),
          extractOpenClawAggregateUsage(providerResponses),
          createdAt,
          initialResponse.result?.meta?.agentMeta?.model ?? this.model
        );
        throw new WorkerExecutionFailure(execution.error ?? "OpenClaw returned invalid JSON.", execution);
      }

      const repairResponse = await invokeOpenClawAgent({
        agentId: this.agentId,
        gatewayUrl: this.gatewayUrl,
        gatewayToken: this.gatewayToken,
        env,
        sessionKey,
        sessionId,
        timeoutSeconds: 600,
        idempotencyKey: `${input.task.id}:repair`,
        message: [
          "Your previous response did not satisfy the required JSON contract.",
          `Validation error: ${error instanceof Error ? error.message : String(error)}`,
          "Return a corrected JSON object only.",
          "Do not wrap the JSON in markdown fences.",
          "",
          "Required JSON contract:",
          contract
        ].join("\n")
      });
      providerResponses.push(repairResponse);
      rawResponses.push(JSON.stringify(repairResponse, null, 2));
      sessionId = repairResponse.result?.meta?.agentMeta?.sessionId ?? sessionId;
      let repairText: string;
      try {
        repairText = extractOpenClawPayloadText(repairResponse);
      } catch (repairError) {
        const execution = this.createFailureExecution(
          input,
          prompt,
          rawResponses.join("\n\n--- OPENCLAW RESPONSE ---\n\n"),
          `OpenClaw returned no usable repair payload for ${input.task.title}.`,
          repairError instanceof Error ? repairError.message : String(repairError),
          extractOpenClawAggregateUsage(providerResponses),
          createdAt,
          repairResponse.result?.meta?.agentMeta?.model ?? this.model
        );
        throw new WorkerExecutionFailure(execution.error ?? "OpenClaw returned no usable repair payload.", execution);
      }
      const repairProviderError = extractLikelyOpenClawProviderError(repairText);
      if (repairProviderError) {
        const execution = this.createFailureExecution(
          input,
          prompt,
          rawResponses.join("\n\n--- OPENCLAW RESPONSE ---\n\n"),
          `OpenClaw provider failed for ${input.task.title}.`,
          repairProviderError,
          extractOpenClawAggregateUsage(providerResponses),
          createdAt,
          repairResponse.result?.meta?.agentMeta?.model ?? this.model
        );
        throw new WorkerExecutionFailure(execution.error ?? "OpenClaw provider failed.", execution);
      }
      providerPayload = parseProviderPayload(repairText);
    }

    const verificationResults = await runVerificationSuite(this.commandRunner, this.verificationCommands);
    const historyMessages = await fetchOpenClawHistory({
      sessionKey,
      gatewayUrl: this.gatewayUrl,
      gatewayToken: this.gatewayToken
    }).catch(() => []);
    const artifacts = createArtifacts(input, verificationResults, providerPayload.artifacts);
    const usage = extractOpenClawAggregateUsage(providerResponses);
    const summary = verificationResults.every((result) => result.exitCode === 0)
      ? providerPayload.summary
      : failedVerificationSummary(input.task.title, verificationResults);
    const execution = createExecutionRecord(input, {
      adapter: this.name,
      executionMode: this.executionMode,
      provider: "openclaw",
      model: initialResponse.result?.meta?.agentMeta?.model ?? this.model,
      prompt,
      response: rawResponses.join("\n\n--- OPENCLAW RESPONSE ---\n\n"),
      summary,
      toolCalls: [
        ...createToolCalls(verificationResults),
        ...extractOpenClawToolCalls(historyMessages)
      ],
      usage,
      status: verificationResults.every((result) => result.exitCode === 0) ? "succeeded" : "failed",
      error: verificationResults.every((result) => result.exitCode === 0)
        ? null
        : failedVerificationSummary(input.task.title, verificationResults),
      createdAt
    });

    if (execution.status === "failed") {
      throw new WorkerExecutionFailure(execution.error ?? "OpenClaw verification failed.", execution);
    }

    return {
      summary,
      artifacts,
      memoryAdditions: createMemoryAdditions(
        input.task.title,
        summary,
        [...providerPayload.memoryAdditions, ...artifacts.learningNotes]
      ),
      execution,
      integrationRefs: mergeIntegrationRefs(input.task, {
        openclaw: {
          agentId: this.agentId,
          runId: initialResponse.runId ?? null,
          sessionId,
          sessionKey,
          gatewayUrl: this.gatewayUrl
        }
      }),
      estimatedCostUsd: usage.costUsd,
      actualCostUsd: usage.costUsd
    };
  }
}

function parseProviderPayload(rawJson: string): ProviderPayload {
  const normalizedJson = rawJson.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalizedJson);
  } catch (error) {
    const snippet = normalizedJson.length > 100 ? `${normalizedJson.slice(0, 97)}...` : normalizedJson;
    throw new Error(`Provider returned invalid JSON payload: "${snippet}". Original error: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Provider output is not a valid JSON object.");
  }
  
  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.summary !== "string") {
    throw new Error("Provider output is missing a string summary.");
  }
  if (!Array.isArray(candidate.memoryAdditions) || candidate.memoryAdditions.some((item: unknown) => typeof item !== "string")) {
    throw new Error("Provider output is missing string memory additions.");
  }

  return {
    summary: candidate.summary,
    artifacts: TaskArtifactsSchema.parse(candidate.artifacts),
    memoryAdditions: candidate.memoryAdditions as string[]
  };
}

function calculateOpenAICost(
  inputTokens: number,
  outputTokens: number,
  inputUsdPerMillionTokens: number,
  outputUsdPerMillionTokens: number
): number {
  const inputUsd = (inputTokens / 1_000_000) * inputUsdPerMillionTokens;
  const outputUsd = (outputTokens / 1_000_000) * outputUsdPerMillionTokens;
  return Number((inputUsd + outputUsd).toFixed(6));
}

export class ReliantAIPythonAdapter implements WorkerAdapter {
  readonly name = "reliant-ai-python-adapter";
  readonly executionMode = "provider" as const;
  private readonly commandRunner: CommandRunner;
  private readonly agentUrl: string;

  constructor(options?: { commandRunner?: CommandRunner; agentUrl?: string }) {
    this.commandRunner = options?.commandRunner ?? createDefaultCommandRunner();
    this.agentUrl = options?.agentUrl ?? "http://localhost:8082/agent";
  }

  async execute(input: WorkerExecutionInput): Promise<WorkerExecutionResult> {
    const createdAt = nowIso();
    
    // Simulate sending payload to Python agent
    const response = await fetch(this.agentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: input.task, recall: input.recall })
    }).catch(err => {
      throw new Error(`Failed to reach ReliantAI agent at ${this.agentUrl}: ${err.message}`);
    });

    if (!response.ok) {
      throw new Error(`ReliantAI agent failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const providerPayload = parseProviderPayload(JSON.stringify(data));

    const verificationResults = await runVerificationSuite(this.commandRunner, repoRoot);
    const artifacts = providerPayload.artifacts;

    const execution: ExecutionRecord = {
      id: randomUUID(),
      taskId: input.task.id,
      workerId: input.worker.id,
      workerAdapter: this.name,
      sessionRef: `reliant-${input.task.id}`,
      verificationResults,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 },
      status: verificationResults.every(r => r.exitCode === 0) ? "succeeded" : "failed",
      error: verificationResults.every(r => r.exitCode === 0)
        ? null
        : failedVerificationSummary(input.task.title, verificationResults),
      createdAt
    };

    if (execution.status === "failed") {
      throw new WorkerExecutionFailure(execution.error ?? "Verification failed.", execution);
    }

    return {
      summary: providerPayload.summary,
      artifacts,
      memoryAdditions: providerPayload.memoryAdditions,
      execution,
      integrationRefs: {
        hermes: null,
        openclaw: null,
        paperclip: null
      },
      estimatedCostUsd: 0,
      actualCostUsd: 0
    };
  }
}

export function createWorkerAdapterFromEnv(): WorkerAdapter {
  const provider = process.env.WORKER_PROVIDER ?? process.env.WORKER_EXECUTION_MODE ?? "deterministic";
  if (provider === "reliantai") {
    return new ReliantAIPythonAdapter({ agentUrl: reliantAIAgentUrl });
  }
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("WORKER_PROVIDER=openai requires OPENAI_API_KEY.");
    }

    return new OpenAIResponsesAdapter({
      apiKey,
      model: openAiModel,
      baseUrl: openAiResponsesUrl
    });
  }

  if (provider === "hermes") {
    const apiKey = hermesApiKey;
    if (!apiKey) {
      throw new Error("WORKER_PROVIDER=hermes requires HERMES_API_KEY.");
    }

    return new HermesResponsesAdapter({
      apiKey,
      model: hermesModel,
      baseUrl: hermesApiUrl
    });
  }

  if (provider === "openclaw") {
    if (!openclawGatewayToken) {
      throw new Error("WORKER_PROVIDER=openclaw requires OPENCLAW_GATEWAY_TOKEN.");
    }

    return new OpenClawAgentAdapter({
      agentId: openclawAgentId,
      gatewayUrl: openclawGatewayUrl,
      gatewayToken: openclawGatewayToken,
      homeDir: openclawHomeDir,
      model: openclawAgentModel
    });
  }

  return new DeterministicRuntimeAdapter();
}
