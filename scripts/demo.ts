import { loadLocalEnv } from "./env.js";

loadLocalEnv();

type SessionUser = {
  email: string;
  name: string;
  role: string;
};

type TaskRecord = {
  id: string;
  title: string;
  status: string;
  approvalState: string;
  approvalReason: string | null;
  executionMode: string;
  integrationRefs: Record<string, unknown> | null;
  releaseDecision: {
    allowed: boolean;
    reasons: string[];
    blockingReasons: string[];
  } | null;
  resultSummary: string | null;
  lastError: string | null;
};

type GateRecord = {
  gateType: string;
  status: string;
  evidence: {
    summary: string;
  };
};

type ExecutionRecord = {
  id: string;
  adapter: string;
  provider: string;
  model: string;
  status: string;
  summary: string;
  usage: {
    totalTokens: number;
    costUsd: number;
  };
};

type WorkerDetail = {
  worker: {
    id: string;
    name: string;
    adapter: string;
    status: string;
    lastHeartbeatAt: string | null;
  };
  memory: Array<{
    category: string;
    content: string;
  }>;
  sessions: Array<{
    id: string;
    taskId: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
  }>;
};

type TaskDetail = {
  task: TaskRecord;
  gates: GateRecord[];
  executions: ExecutionRecord[];
  events: Array<{
    eventType: string;
    actor: string;
    createdAt: string;
  }>;
};

const apiBase = process.env.VITE_API_BASE_URL ?? "http://127.0.0.1:4100";
const adminEmail = process.env.ULTIMATE_SYSTEM_ADMIN_EMAIL ?? "admin@ultimate-system.local";
const adminPassword = process.env.ULTIMATE_SYSTEM_ADMIN_PASSWORD ?? "change-this-password";
const workerId = process.env.WORKER_ID ?? "worker-runtime-local";
const provider = process.env.DEMO_PROVIDER ?? "deterministic";
const executionMode = process.env.DEMO_EXECUTION_MODE
  ?? (provider === "deterministic" ? "deterministic" : "provider");
const timeoutMs = Number(process.env.DEMO_TIMEOUT_MS ?? 300_000);
const pollMs = Number(process.env.DEMO_POLL_INTERVAL_MS ?? 2_000);

function extractCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("Login response did not include a session cookie.");
  }
  return setCookie.split(";")[0] ?? setCookie;
}

async function fetchJson<T>(path: string, init: RequestInit & { cookie?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.cookie) {
    headers.set("cookie", init.cookie);
  }
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${path}: ${text}`);
  }

  return await response.json() as T;
}

async function login(): Promise<{ cookie: string; user: SessionUser }> {
  const response = await fetch(`${apiBase}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      email: adminEmail,
      password: adminPassword
    })
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json() as { user: SessionUser };
  return {
    cookie: extractCookie(response),
    user: payload.user
  };
}

async function waitForTask(cookie: string, taskId: string): Promise<TaskDetail> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const detail = await fetchJson<TaskDetail>(`/api/tasks/${taskId}/detail`, { cookie });
    if (["released", "failed"].includes(detail.task.status)) {
      return detail;
    }
    await new Promise((resolveTimer) => setTimeout(resolveTimer, pollMs));
  }

  throw new Error(`Timed out waiting for task ${taskId} to reach a terminal state.`);
}

const { cookie, user } = await login();
const createdTask = await fetchJson<TaskRecord>("/api/tasks", {
  method: "POST",
  cookie,
  headers: {
    "content-type": "application/json"
  },
  body: JSON.stringify({
    title: `Live stack proof via ${provider}`,
    description: [
      "Exercise the authenticated control plane, queue-backed worker runtime, persistent execution audit trail, and upstream integrations.",
      "The task must complete through the real HTTP/API path, not an in-process shortcut."
    ].join(" "),
    requestedBy: user.email,
    skillHint: "review",
    budgetCapUsd: executionMode === "provider" ? 20 : 5,
    executionMode,
    requiredCapabilities: ["planning", "review", "qa", "security", "release"],
    idempotencyKey: `live-demo-${provider}-${Date.now()}`
  })
});

if (createdTask.approvalState === "pending") {
  await fetchJson<TaskRecord>(`/api/tasks/${createdTask.id}/approval`, {
    method: "POST",
    cookie,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      approvalState: "approved",
      reason: `Approved by ${user.email} for live integration demo.`
    })
  });
}

const taskDetail = await waitForTask(cookie, createdTask.id);
const workerDetail = await fetchJson<WorkerDetail>(`/api/workers/${workerId}/detail`, { cookie });

if (taskDetail.task.status !== "released") {
  console.error(JSON.stringify({
    taskId: taskDetail.task.id,
    status: taskDetail.task.status,
    lastError: taskDetail.task.lastError,
    gates: taskDetail.gates.map((gate) => ({
      gateType: gate.gateType,
      status: gate.status,
      summary: gate.evidence.summary
    }))
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  apiBase,
  authenticatedAs: user.email,
  workerId: workerDetail.worker.id,
  task: {
    id: taskDetail.task.id,
    title: taskDetail.task.title,
    status: taskDetail.task.status,
    approvalState: taskDetail.task.approvalState,
    executionMode: taskDetail.task.executionMode,
    integrationRefs: taskDetail.task.integrationRefs,
    releaseDecision: taskDetail.task.releaseDecision,
    resultSummary: taskDetail.task.resultSummary
  },
  gates: taskDetail.gates.map((gate) => ({
    gateType: gate.gateType,
    status: gate.status,
    summary: gate.evidence.summary
  })),
  executions: taskDetail.executions.map((execution) => ({
    id: execution.id,
    adapter: execution.adapter,
    provider: execution.provider,
    model: execution.model,
    status: execution.status,
    totalTokens: execution.usage.totalTokens,
    costUsd: execution.usage.costUsd
  })),
  worker: {
    id: workerDetail.worker.id,
    name: workerDetail.worker.name,
    adapter: workerDetail.worker.adapter,
    status: workerDetail.worker.status,
    lastHeartbeatAt: workerDetail.worker.lastHeartbeatAt
  },
  memoryCount: workerDetail.memory.length,
  sessionCount: workerDetail.sessions.length,
  recentEvents: taskDetail.events.slice(-8).map((event) => ({
    eventType: event.eventType,
    actor: event.actor,
    createdAt: event.createdAt
  }))
}, null, 2));
