import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode
} from "react";
import { useKeyboardShortcuts } from "./hooks.js";
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration
} from "@simplewebauthn/browser";

type SessionUser = {
  email: string;
  name: string;
  role: string;
};

type SessionState = {
  authenticated: boolean;
  authMethod: "password" | "passkey" | null;
  user: SessionUser | null;
};

type WorkspaceUser = SessionUser & {
  id: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  passkeyCount: number;
};

type PasskeyCredential = {
  id: string;
  userId: string;
  deviceType: "singleDevice" | "multiDevice";
  backedUp: boolean;
  transports: string[];
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

type PasskeyListResponse = {
  credentials: PasskeyCredential[];
  recommended: boolean;
};

type GateRule = {
  code: string;
  passed: boolean;
  message: string;
};

type GateEvidence = {
  summary: string;
  rules: GateRule[];
  generatedAt: string;
};

type Gate = {
  id: string;
  taskId: string;
  gateType: string;
  status: string;
  evidence: GateEvidence;
};

type Worker = {
  id: string;
  name: string;
  role: string;
  adapter: string;
  status: string;
  currentTaskId: string | null;
  capabilities: string[];
  executionModes: string[];
  lastHeartbeatAt: string | null;
  lastSummary: string | null;
  monthlyBudgetUsd: number;
  spentBudgetUsd: number;
};

type PaperclipRef = {
  companyId: string;
  goalId: string | null;
  issueId: string;
  issueIdentifier: string | null;
  issueUrl: string | null;
};

type HermesRef = {
  conversationId: string;
  lastResponseId: string | null;
};

type OpenClawRef = {
  agentId: string;
  runId: string | null;
  sessionId: string | null;
  sessionKey: string;
  gatewayUrl: string | null;
};

type IntegrationRefs = {
  paperclip?: PaperclipRef | null;
  hermes?: HermesRef | null;
  openclaw?: OpenClawRef | null;
};

type Task = {
  id: string;
  title: string;
  description: string;
  requestedBy: string;
  requiredCapabilities: string[];
  executionMode: string;
  status: string;
  approvalState: string;
  approvalReason: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  assignedWorkerId: string | null;
  budgetCapUsd: number;
  budgetEstimateUsd: number;
  budgetActualUsd: number;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  resultSummary: string | null;
  integrationRefs: IntegrationRefs | null;
  releaseDecision: {
    allowed: boolean;
    reasons: string[];
    blockingReasons: string[];
    decidedAt: string;
  } | null;
};

type Execution = {
  id: string;
  adapter: string;
  provider: string;
  model: string;
  executionMode: string;
  status: string;
  summary: string;
  prompt: string;
  response: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
  };
  toolCalls: Array<{
    name: string;
    resultSummary: string | null;
  }>;
  createdAt: string;
  completedAt: string;
};

type EventRecord = {
  id: string;
  eventType: string;
  actor: string;
  createdAt: string;
  detail: Record<string, unknown>;
};

type MemoryEntry = {
  id: string;
  category: string;
  content: string;
  createdAt: string;
};

type WorkerSession = {
  id: string;
  taskId: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  recallSummary: string;
};

type DashboardState = {
  org: {
    name: string;
    mission: string;
    monthlyBudgetUsd: number;
    spentBudgetUsd: number;
  };
  workers: Worker[];
  tasks: Task[];
  gates: Gate[];
  recentEvents: EventRecord[];
};

type TaskDetail = {
  task: Task;
  gates: Gate[];
  executions: Execution[];
  events: EventRecord[];
};

type WorkerDetail = {
  worker: Worker;
  memory: MemoryEntry[];
  sessions: WorkerSession[];
};

type OpenClawStatus = {
  available: boolean;
  status: {
    gateway: unknown;
    skillCount: number;
    toolCount: number;
    groupCount: number;
  };
  agentId: string;
  error?: string;
};

type OpenClawSkills = {
  available?: boolean;
  workspaceDir: string;
  managedSkillsDir: string;
  skills: Array<{
    name: string;
    description: string;
    emoji?: string;
    eligible: boolean;
    disabled: boolean;
    blockedByAllowlist: boolean;
    source: string;
  }>;
  error?: string;
};

type OpenClawTools = {
  available?: boolean;
  sections: Array<{
    id: string;
    label: string;
    tools: Array<{
      id: string;
      label: string;
      description: string;
      profiles: string[];
    }>;
  }>;
  groups: Record<string, string[]>;
  profiles: Array<{
    id: string;
    label: string;
  }>;
  error?: string;
};

type TaskFilter = "attention" | "all" | "approvals" | "active" | "done";

type CapabilityOption = {
  id: string;
  label: string;
  description: string;
};

type TaskFormState = {
  title: string;
  description: string;
  budgetCapUsd: number;
  executionMode: "deterministic" | "provider";
  requiredCapabilities: string[];
  idempotencyKey: string;
};

type LoginFormState = {
  email: string;
  password: string;
};

const apiBaseStorageKey = "ultimate-system.api-base";

const capabilityOptions: CapabilityOption[] = [
  {
    id: "planning",
    label: "Planning",
    description: "Break the work into clear steps and choose the right path."
  },
  {
    id: "review",
    label: "Review",
    description: "Inspect the result and explain what changed."
  },
  {
    id: "qa",
    label: "Quality checks",
    description: "Run validation and confirm the result behaves correctly."
  },
  {
    id: "security",
    label: "Safety checks",
    description: "Look for unsafe changes and trust-boundary issues."
  },
  {
    id: "release",
    label: "Release readiness",
    description: "Decide whether the work is ready to be released."
  }
];

const taskFilterOptions: Array<{ id: TaskFilter; label: string }> = [
  { id: "attention", label: "Needs attention" },
  { id: "all", label: "All requests" },
  { id: "approvals", label: "Waiting for approval" },
  { id: "active", label: "In progress" },
  { id: "done", label: "Finished" }
];

const guideSteps = [
  {
    title: "1. Create a request",
    body: "Write what you want done, choose a spending limit, and select the help you need."
  },
  {
    title: "2. Approve if needed",
    body: "Provider-backed work usually needs an approver before it can start."
  },
  {
    title: "3. Follow progress",
    body: "Watch the request move from waiting, to in progress, to checked, to released."
  }
];

const statusGlossary = [
  {
    term: "Waiting for approval",
    body: "The request exists, but someone with approval rights must confirm it before work starts."
  },
  {
    term: "Waiting to start",
    body: "The request is approved and in line for a worker."
  },
  {
    term: "In progress",
    body: "A worker is currently running the request."
  },
  {
    term: "Under review",
    body: "The work finished and the system is evaluating checks and release rules."
  },
  {
    term: "Released",
    body: "The work finished, passed checks, and is cleared for use."
  },
  {
    term: "Needs attention",
    body: "The request failed or a gate blocked release. Review the reason before trying again."
  }
];

const initialForm: TaskFormState = {
  title: "",
  description: "",
  budgetCapUsd: 15,
  executionMode: "deterministic",
  requiredCapabilities: ["planning"],
  idempotencyKey: ""
};

const initialLogin: LoginFormState = {
  email: "",
  password: ""
};

type PasskeyRegistrationStartResponse = {
  flowId: string;
  options: Parameters<typeof startRegistration>[0]["optionsJSON"];
};

type PasskeyAuthenticationStartResponse = {
  flowId: string;
  options: Parameters<typeof startAuthentication>[0]["optionsJSON"];
};

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function normalizeApiBase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "http://localhost:4100";
  }
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function resolveInitialApiBase(): string {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(apiBaseStorageKey);
    if (stored) {
      return normalizeApiBase(stored);
    }

    const runtimeValue = (window as Window & {
      __ULTIMATE_SYSTEM_API_BASE_URL__?: string;
    }).__ULTIMATE_SYSTEM_API_BASE_URL__;

    if (runtimeValue) {
      return normalizeApiBase(runtimeValue);
    }

    if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      return normalizeApiBase(import.meta.env.VITE_API_BASE_URL ?? window.location.origin);
    }
  }

  return normalizeApiBase(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4100");
}

async function fetchJson<T>(apiBase: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    credentials: "include",
    ...init
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(errorText || `${response.status} ${response.statusText}`, response.status);
  }
  return await response.json() as T;
}

function formatMoney(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits
  }).format(value);
}

function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}

function formatRelativeTime(value: string | null): string {
  if (!value) {
    return "No recent signal";
  }

  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60]
  ];

  for (const [unit, unitSize] of units) {
    if (Math.abs(seconds) >= unitSize) {
      return formatter.format(Math.round(seconds / unitSize), unit);
    }
  }

  return formatter.format(seconds, "second");
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function summarizeEventDetail(detail: Record<string, unknown>): string {
  const summary = Object.entries(detail)
    .slice(0, 3)
    .map(([key, value]) => {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return `${key}: ${String(value)}`;
      }
      return `${key}: ${JSON.stringify(value)}`;
    })
    .join(" · ");

  return summary || "No detail recorded.";
}

function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function statusTone(status: string): string {
  switch (status) {
    case "released":
    case "passed":
    case "approved":
    case "idle":
    case "succeeded":
      return "success";
    case "failed":
    case "blocked":
    case "rejected":
      return "danger";
    case "running":
    case "busy":
    case "dispatched":
      return "active";
    case "pending":
    case "queued":
    case "completed":
      return "warn";
    default:
      return "neutral";
  }
}

function taskStatusLabel(task: Task): string {
  if (task.status === "released") {
    return "Released";
  }
  if (task.status === "running") {
    return "In progress";
  }
  if (task.status === "failed") {
    return "Needs attention";
  }
  if (task.status === "completed") {
    return "Under review";
  }
  if (task.status === "queued" || task.status === "dispatched") {
    return "Waiting to start";
  }
  return task.status.replace(/_/g, " ");
}

function approvalLabel(state: string): string {
  switch (state) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Not approved";
    default:
      return "Waiting for approval";
  }
}

function executionModeLabel(mode: string): string {
  return mode === "provider" ? "AI-assisted run" : "Safe local run";
}

function gateTypeLabel(gateType: string): string {
  switch (gateType) {
    case "product":
      return "Request brief";
    case "engineering":
      return "Build quality";
    case "qa":
      return "Checks";
    case "security":
      return "Safety";
    case "release":
      return "Release";
    default:
      return gateType;
  }
}

function workerStatusLabel(status: string): string {
  return status === "busy" ? "Working now" : status === "idle" ? "Ready" : status;
}

function roleHelp(role: string | undefined): string {
  switch (role) {
    case "admin":
      return "You can create work, approve requests, override gates, and manage the system.";
    case "approver":
      return "You can create work, approve requests, and make gate decisions.";
    case "requester":
      return "You can create work and follow progress, but you cannot approve requests.";
    default:
      return "You can view progress, but you cannot create or approve requests.";
  }
}

function authMethodLabel(method: SessionState["authMethod"]): string {
  if (method === "passkey") {
    return "Passkey or biometric";
  }
  if (method === "password") {
    return "Password";
  }
  return "Not signed in";
}

function passkeyDeviceLabel(deviceType: PasskeyCredential["deviceType"]): string {
  return deviceType === "multiDevice" ? "Synced passkey" : "This device only";
}

function capabilityLabel(capability: string): string {
  return capabilityOptions.find((item) => item.id === capability)?.label ?? capability;
}

function gateSummaryForTask(taskId: string, gates: Gate[]): { passed: number; blocked: number; pending: number } {
  return gates
    .filter((gate) => gate.taskId === taskId)
    .reduce(
      (summary, gate) => {
        if (gate.status === "passed") {
          summary.passed += 1;
        } else if (gate.status === "blocked" || gate.status === "failed") {
          summary.blocked += 1;
        } else {
          summary.pending += 1;
        }
        return summary;
      },
      { passed: 0, blocked: 0, pending: 0 }
    );
}

function taskAttentionScore(task: Task, gates: Gate[]): number {
  const summary = gateSummaryForTask(task.id, gates);
  if (task.lastError || task.status === "failed" || summary.blocked > 0) {
    return 5;
  }
  if (task.approvalState === "pending") {
    return 4;
  }
  if (task.status === "running") {
    return 3;
  }
  if (task.status === "queued" || task.status === "dispatched") {
    return 2;
  }
  if (task.status === "completed") {
    return 1;
  }
  return 0;
}

function nextStepForTask(task: Task, gates: Gate[]): string {
  const summary = gateSummaryForTask(task.id, gates);

  if (task.approvalState === "pending") {
    return "An approver needs to review this request before it can start.";
  }
  if (task.status === "queued" || task.status === "dispatched") {
    return "The request is approved and waiting for an available worker.";
  }
  if (task.status === "running") {
    return "A worker is actively handling this request.";
  }
  if (task.status === "failed" || summary.blocked > 0) {
    return "This request needs attention before it can be released.";
  }
  if (task.status === "completed") {
    return "The work finished. The system is finalizing checks and release judgment.";
  }
  if (task.status === "released") {
    return "This request is fully complete and cleared for use.";
  }
  return "Open the request details to see the next step.";
}

function workflowSteps(task: Task, gates: Gate[]): Array<{ label: string; state: "done" | "current" | "upcoming" }> {
  const gateSummary = gateSummaryForTask(task.id, gates);
  const approvalDone = task.approvalState === "approved";
  const running = task.status === "running";
  const checksDone = gateSummary.passed >= 4 || task.status === "released";
  const released = task.status === "released";

  return [
    { label: "Requested", state: "done" },
    {
      label: "Approved",
      state: approvalDone ? "done" : task.approvalState === "pending" ? "current" : "upcoming"
    },
    {
      label: "In progress",
      state: running ? "current" : task.status === "completed" || task.status === "released" ? "done" : "upcoming"
    },
    {
      label: "Checked",
      state: checksDone ? "done" : task.status === "completed" ? "current" : "upcoming"
    },
    {
      label: "Released",
      state: released ? "done" : task.status === "failed" || gateSummary.blocked > 0 ? "current" : "upcoming"
    }
  ];
}

function releaseHeadline(task: Task): string {
  if (!task.releaseDecision) {
    return "Release review has not been decided yet.";
  }
  return task.releaseDecision.allowed
    ? "This request passed its final release decision."
    : "Release is currently blocked for this request.";
}

function filterTasks(tasks: Task[], gates: Gate[], filter: TaskFilter): Task[] {
  switch (filter) {
    case "approvals":
      return tasks.filter((task) => task.approvalState === "pending");
    case "active":
      return tasks.filter((task) => ["queued", "dispatched", "running", "completed"].includes(task.status));
    case "done":
      return tasks.filter((task) => task.status === "released");
    case "attention":
      return tasks.filter((task) => taskAttentionScore(task, gates) > 0);
    default:
      return tasks;
  }
}

function toggleCapability(current: string[], capability: string): string[] {
  if (current.includes(capability)) {
    const next = current.filter((item) => item !== capability);
    return next.length > 0 ? next : [capability];
  }
  return [...current, capability];
}

function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={classNames("pill", `pill-${tone}`)}>{children}</span>;
}

function SectionHeading({
  label,
  title,
  aside
}: {
  label: string;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{label}</span>
        <h2>{title}</h2>
      </div>
      {aside ? <div className="section-aside">{aside}</div> : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
  progress
}: {
  label: string;
  value: string;
  note: string;
  progress?: number;
}) {
  return (
    <article className="metric-card">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
      {typeof progress === "number" ? (
        <div className="meter" aria-hidden="true">
          <span style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }} />
        </div>
      ) : null}
    </article>
  );
}

export default function App() {
  const [apiBase, setApiBase] = useState(resolveInitialApiBase);
  const [apiBaseDraft, setApiBaseDraft] = useState(resolveInitialApiBase);
  const [session, setSession] = useState<SessionState | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [loginForm, setLoginForm] = useState(initialLogin);
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState<"login" | "register" | null>(null);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [platformAuthenticatorReady, setPlatformAuthenticatorReady] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const [passkeyLabel, setPasskeyLabel] = useState("");
  const [workspaceUsers, setWorkspaceUsers] = useState<WorkspaceUser[]>([]);
  const [workspaceUsersLoading, setWorkspaceUsersLoading] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [workerDetail, setWorkerDetail] = useState<WorkerDetail | null>(null);
  const [openclawStatus, setOpenclawStatus] = useState<OpenClawStatus | null>(null);
  const [openclawSkills, setOpenclawSkills] = useState<OpenClawSkills | null>(null);
  const [openclawTools, setOpenclawTools] = useState<OpenClawTools | null>(null);
  const [form, setForm] = useState(initialForm);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [approvalReason, setApprovalReason] = useState("Approved after reviewing the request.");
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [taskLoading, setTaskLoading] = useState(false);
  const [workerLoading, setWorkerLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const deferredTaskId = useDeferredValue(selectedTaskId);
  const deferredWorkerId = useDeferredValue(selectedWorkerId);
  const canApprove = session?.authenticated && (session.user?.role === "admin" || session.user?.role === "approver");
  const canAdministerUsers = session?.authenticated && session.user?.role === "admin";

  function handleApiError(error: unknown, fallback: string) {
    if (error instanceof ApiError && error.status === 401) {
      setSession({ authenticated: false, authMethod: null, user: null });
      setDashboard(null);
      setTaskDetail(null);
      setWorkerDetail(null);
      setPasskeys([]);
      setWorkspaceUsers([]);
      setErrorMessage("Your session expired. Please sign in again.");
      return;
    }

    setErrorMessage(error instanceof Error ? error.message : fallback);
  }

  const loadDashboard = useCallback(async () => {
    if (!session?.authenticated) {
      return;
    }

    setRefreshing(true);
    try {
      const next = await fetchJson<DashboardState>(apiBase, "/api/state");
      const runtimeStatus = await fetchJson<OpenClawStatus>(apiBase, "/api/openclaw/status").catch(() => null);
      startTransition(() => {
        setDashboard(next);
        if (runtimeStatus) {
          setOpenclawStatus(runtimeStatus);
        }
        setLastUpdatedAt(new Date().toISOString());
        setErrorMessage(null);
        setSelectedTaskId((current) => current ?? next.tasks[0]?.id ?? null);
        setSelectedWorkerId((current) => current ?? next.workers[0]?.id ?? null);
      });
    } catch (error) {
      handleApiError(error, "We could not refresh the workspace just now.");
    } finally {
      setRefreshing(false);
    }
  }, [apiBase, session?.authenticated]);

  const loadAccessData = useCallback(async () => {
    if (!session?.authenticated) {
      return;
    }

    try {
      const credentialList = await fetchJson<PasskeyListResponse>(apiBase, "/api/auth/passkeys");
      startTransition(() => {
        setPasskeys(credentialList.credentials);
      });

      if (session.user?.role === "admin") {
        setWorkspaceUsersLoading(true);
        const users = await fetchJson<WorkspaceUser[]>(apiBase, "/api/users");
        startTransition(() => {
          setWorkspaceUsers(users);
        });
      } else {
        setWorkspaceUsers([]);
      }
    } catch (error) {
      handleApiError(error, "We could not load the workspace access details.");
    } finally {
      setWorkspaceUsersLoading(false);
    }
  }, [apiBase, session?.authenticated, session?.user?.role]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(apiBaseStorageKey, apiBase);
    }
  }, [apiBase]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supported = await browserSupportsWebAuthn();
        const platformReady = supported ? await platformAuthenticatorIsAvailable() : false;
        if (!cancelled) {
          setPasskeySupported(supported);
          setPlatformAuthenticatorReady(platformReady);
        }
      } catch {
        if (!cancelled) {
          setPasskeySupported(false);
          setPlatformAuthenticatorReady(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSessionReady(false);
    let cancelled = false;

    void (async () => {
      try {
        const next = await fetchJson<SessionState>(apiBase, "/api/auth/session");
        if (!cancelled) {
          startTransition(() => {
            setSession(next);
            setErrorMessage(null);
          });
        }
      } catch (error) {
        if (!cancelled) {
          handleApiError(error, "We could not load your session.");
        }
      } finally {
        if (!cancelled) {
          setSessionReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  useEffect(() => {
    if (!session?.authenticated) {
      setOpenclawStatus(null);
      setOpenclawSkills(null);
      setOpenclawTools(null);
      return;
    }

    void loadDashboard();
    const timer = window.setInterval(() => {
      void loadDashboard();
    }, 4000);

    return () => window.clearInterval(timer);
  }, [loadDashboard, session?.authenticated]);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: "r", ctrl: true, description: "Refresh dashboard", action: () => void loadDashboard() },
    { key: "k", ctrl: true, description: "Show keyboard shortcuts", action: () => setShowShortcuts(true) },
    { key: "?", shift: true, description: "Show keyboard shortcuts", action: () => setShowShortcuts(true) },
    { key: "j", description: "Next task", action: () => {
      const currentIndex = sortedTasks.findIndex(t => t.id === selectedTaskId);
      const nextTask = sortedTasks[currentIndex + 1];
      if (currentIndex < sortedTasks.length - 1 && nextTask) {
        setSelectedTaskId(nextTask.id);
      }
    }},
    { key: "k", description: "Previous task", action: () => {
      const currentIndex = sortedTasks.findIndex(t => t.id === selectedTaskId);
      const prevTask = sortedTasks[currentIndex - 1];
      if (currentIndex > 0 && prevTask) {
        setSelectedTaskId(prevTask.id);
      }
    }},
    { key: "Escape", description: "Close shortcuts", action: () => setShowShortcuts(false) },
  ], session?.authenticated && !showShortcuts);

  useEffect(() => {
    if (!session?.authenticated) {
      setPasskeys([]);
      setWorkspaceUsers([]);
      return;
    }

    void loadAccessData();
  }, [loadAccessData, session?.authenticated]);

  useEffect(() => {
    if (!session?.authenticated) {
      return;
    }

    let cancelled = false;
    void Promise.all([
      fetchJson<OpenClawSkills>(apiBase, "/api/openclaw/skills"),
      fetchJson<OpenClawTools>(apiBase, "/api/openclaw/tools")
    ])
      .then(([skills, tools]) => {
        if (!cancelled) {
          setOpenclawSkills(skills);
          setOpenclawTools(tools);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOpenclawSkills(null);
          setOpenclawTools(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiBase, session?.authenticated]);

  useEffect(() => {
    if (!session?.authenticated || !deferredTaskId) {
      setTaskDetail(null);
      return;
    }

    let cancelled = false;
    setTaskLoading(true);
    void fetchJson<TaskDetail>(apiBase, `/api/tasks/${deferredTaskId}/detail`)
      .then((detail) => {
        if (!cancelled) {
          setTaskDetail(detail);
          setErrorMessage(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          handleApiError(error, "We could not load the request details.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTaskLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiBase, deferredTaskId, lastUpdatedAt, session?.authenticated]);

  useEffect(() => {
    if (!session?.authenticated || !deferredWorkerId) {
      setWorkerDetail(null);
      return;
    }

    let cancelled = false;
    setWorkerLoading(true);
    void fetchJson<WorkerDetail>(apiBase, `/api/workers/${deferredWorkerId}/detail`)
      .then((detail) => {
        if (!cancelled) {
          setWorkerDetail(detail);
          setErrorMessage(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          handleApiError(error, "We could not load the team activity details.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setWorkerLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiBase, deferredWorkerId, lastUpdatedAt, session?.authenticated]);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginSubmitting(true);
    const nextApiBase = normalizeApiBase(apiBaseDraft);

    try {
      const response = await fetch(`${nextApiBase}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(loginForm)
      });

      if (!response.ok) {
        throw new ApiError(await response.text(), response.status);
      }

      const next = await response.json() as SessionState;
      setApiBase(nextApiBase);
      setSession({
        authenticated: true,
        authMethod: next.authMethod,
        user: next.user
      });
      setPasskeyLabel("");
      setErrorMessage(null);
    } catch (error) {
      handleApiError(error, "We could not sign you in.");
    } finally {
      setLoginSubmitting(false);
    }
  }

  function applyEndpoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = normalizeApiBase(apiBaseDraft);
    setApiBase(next);
    setDashboard(null);
    setTaskDetail(null);
    setWorkerDetail(null);
    setSelectedTaskId(null);
    setSelectedWorkerId(null);
    setErrorMessage(null);
  }

  async function logout() {
    try {
      await fetchJson(apiBase, "/api/auth/logout", { method: "POST" });
      setSession({ authenticated: false, authMethod: null, user: null });
      setDashboard(null);
      setTaskDetail(null);
      setWorkerDetail(null);
      setPasskeys([]);
      setWorkspaceUsers([]);
    } catch (error) {
      handleApiError(error, "We could not sign you out.");
    }
  }

  async function signInWithPasskey() {
    const nextApiBase = normalizeApiBase(apiBaseDraft);
    setPasskeyBusy("login");

    try {
      const begin = await fetchJson<PasskeyAuthenticationStartResponse>(nextApiBase, "/api/auth/passkeys/login/options", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          email: loginForm.email.trim() || undefined
        })
      });
      const responseJson = await startAuthentication({
        optionsJSON: begin.options
      });
      const verified = await fetchJson<SessionState & { credential?: PasskeyCredential }>(nextApiBase, "/api/auth/passkeys/login/verify", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          flowId: begin.flowId,
          response: responseJson
        })
      });
      setApiBase(nextApiBase);
      setSession({
        authenticated: true,
        authMethod: verified.authMethod,
        user: verified.user
      });
      setErrorMessage(null);
    } catch (error) {
      handleApiError(error, "We could not sign you in with a passkey.");
    } finally {
      setPasskeyBusy(null);
    }
  }

  async function registerPasskey() {
    if (!session?.authenticated) {
      return;
    }

    setPasskeyBusy("register");
    try {
      const begin = await fetchJson<PasskeyRegistrationStartResponse>(apiBase, "/api/auth/passkeys/register/options", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          label: passkeyLabel.trim() || undefined
        })
      });
      const responseJson = await startRegistration({
        optionsJSON: begin.options
      });
      await fetchJson<{ credential: PasskeyCredential }>(apiBase, "/api/auth/passkeys/register/verify", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          flowId: begin.flowId,
          response: responseJson
        })
      });
      setPasskeyLabel("");
      await loadAccessData();
      setErrorMessage(null);
    } catch (error) {
      handleApiError(error, "We could not register a passkey for this account.");
    } finally {
      setPasskeyBusy(null);
    }
  }

  async function removePasskey(credentialId: string) {
    try {
      await fetchJson<{ deleted: boolean }>(apiBase, `/api/auth/passkeys/${credentialId}`, {
        method: "DELETE"
      });
      await loadAccessData();
      setErrorMessage(null);
    } catch (error) {
      handleApiError(error, "We could not remove that passkey.");
    }
  }

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session?.user) {
      return;
    }

    setSubmitting(true);
    try {
      const created = await fetchJson<Task>(apiBase, "/api/tasks", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          ...form,
          requestedBy: session.user.email,
          requiredCapabilities: form.requiredCapabilities,
          idempotencyKey: form.idempotencyKey.trim() || undefined
        })
      });
      setForm(initialForm);
      setSelectedTaskId(created.id);
      setTaskFilter("all");
      await loadDashboard();
    } catch (error) {
      handleApiError(error, "We could not create the request.");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateApproval(approvalState: "approved" | "rejected") {
    if (!taskDetail) {
      return;
    }

    try {
      await fetchJson<Task>(apiBase, `/api/tasks/${taskDetail.task.id}/approval`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          approvalState,
          reason: approvalReason
        })
      });
      await Promise.all([
        loadDashboard(),
        fetchJson<TaskDetail>(apiBase, `/api/tasks/${taskDetail.task.id}/detail`).then(setTaskDetail)
      ]);
    } catch (error) {
      handleApiError(error, "We could not update the approval.");
    }
  }

  const tasks = useMemo(() => dashboard?.tasks ?? [], [dashboard]);
  const workers = useMemo(() => dashboard?.workers ?? [], [dashboard]);
  const recentEvents = useMemo(() => dashboard?.recentEvents ?? [], [dashboard]);
  const sortedTasks = useMemo(
    () =>
      [...tasks].sort((left, right) => {
        const scoreDelta = taskAttentionScore(right, dashboard?.gates ?? []) - taskAttentionScore(left, dashboard?.gates ?? []);
        if (scoreDelta !== 0) {
          return scoreDelta;
        }
        return right.id.localeCompare(left.id);
      }),
    [dashboard?.gates, tasks]
  );
  const filteredTasks = useMemo(
    () => filterTasks(sortedTasks, dashboard?.gates ?? [], taskFilter),
    [dashboard?.gates, sortedTasks, taskFilter]
  );
  const selectedTask = taskDetail?.task ?? tasks.find((task) => task.id === selectedTaskId) ?? null;
  const selectedWorker = workerDetail?.worker ?? workers.find((worker) => worker.id === selectedWorkerId) ?? null;
  const endpointDirty = normalizeApiBase(apiBaseDraft) !== apiBase;
  const openclawReadySkills = useMemo(
    () => openclawSkills?.skills.filter((skill) => skill.eligible) ?? [],
    [openclawSkills]
  );
  const openclawToolCount = openclawTools
    ? openclawTools.sections.reduce((sum, section) => sum + section.tools.length, 0)
    : 0;
  const openclawTopGroups = useMemo(
    () => openclawTools ? Object.keys(openclawTools.groups).slice(0, 6) : [],
    [openclawTools]
  );
  const pendingApprovals = useMemo(
    () => tasks.filter((task) => task.approvalState === "pending"),
    [tasks]
  );
  const blockedTasks = useMemo(
    () => sortedTasks.filter((task) => task.status === "failed" || gateSummaryForTask(task.id, dashboard?.gates ?? []).blocked > 0),
    [dashboard?.gates, sortedTasks]
  );
  const activeTasks = useMemo(
    () => tasks.filter((task) => ["queued", "dispatched", "running", "completed"].includes(task.status)),
    [tasks]
  );
  const metrics = useMemo(() => {
    const released = tasks.filter((task) => task.status === "released").length;
    const busyWorkers = workers.filter((worker) => worker.status === "busy").length;
    const spendRatio = dashboard ? dashboard.org.spentBudgetUsd / Math.max(dashboard.org.monthlyBudgetUsd, 1) : 0;

    return {
      released,
      spendRatio,
      busyWorkers
    };
  }, [dashboard, tasks, workers]);
  const selectedTaskGateSummary = useMemo(
    () => selectedTask ? gateSummaryForTask(selectedTask.id, taskDetail?.gates ?? dashboard?.gates ?? []) : null,
    [dashboard?.gates, selectedTask, taskDetail?.gates]
  );
  const selectedTaskSteps = useMemo(
    () => selectedTask ? workflowSteps(selectedTask, taskDetail?.gates ?? dashboard?.gates ?? []) : [],
    [dashboard?.gates, selectedTask, taskDetail?.gates]
  );
  const requestModeHelp = form.executionMode === "provider"
    ? "This choice uses an AI provider and usually needs approval before it can start."
    : "This choice stays on the verified local path and can often start immediately.";
  const serviceHighlights = useMemo(() => ([
    {
      label: "Workspace API",
      status: session?.authenticated ? "Connected" : "Sign in required",
      tone: session?.authenticated ? "success" : "warn",
      detail: apiBase
    },
    {
      label: "Biometric access",
      status: passkeySupported ? (platformAuthenticatorReady ? "Ready on this device" : "Passkeys supported") : "Unavailable in this browser",
      tone: passkeySupported ? "success" : "warn",
      detail: passkeySupported ? "Passkeys are enabled for sign-in and account protection." : "Use a current browser on a secure origin to enable passkeys."
    },
    {
      label: "Assistant toolbox",
      status: openclawStatus?.available ? "Connected" : "Unavailable",
      tone: openclawStatus?.available ? "success" : "warn",
      detail: openclawStatus?.available
        ? `${openclawStatus.status.toolCount} tools · ${openclawReadySkills.length} ready skills`
        : openclawStatus?.error ?? "Waiting for the runtime to respond."
    }
  ]), [apiBase, openclawReadySkills.length, openclawStatus, passkeySupported, platformAuthenticatorReady, session?.authenticated]);
  const recommendedPasskey = passkeys.length === 0;

  if (!sessionReady) {
    return (
      <div className="screen-shell">
        <div className="ambient-glow" />
        <section className="login-layout">
          <article className="welcome-panel">
            <span className="eyebrow">Ultimate System</span>
            <h1>Opening your workspace.</h1>
            <p>Connecting to {apiBase} and checking your saved session.</p>
          </article>
        </section>
      </div>
    );
  }

  if (!session?.authenticated) {
    return (
      <div className="screen-shell">
        <div className="ambient-glow" />
        <section className="login-layout">
          <article className="welcome-panel">
            <span className="eyebrow">Executive workspace</span>
            <h1>Operate the system like a cockpit, not a dashboard.</h1>
            <p>
              Ultimate System gives non-technical teams one premium surface to request work, approve it,
              and understand exactly what happened without reading engineering logs.
            </p>
            <div className="vault-banner">
              <div>
                <span className="eyebrow">Biometric access</span>
                <strong>{passkeySupported ? "Passkeys are available on this browser." : "Password sign-in only on this browser."}</strong>
                <p>
                  {passkeySupported
                    ? platformAuthenticatorReady
                      ? "This device can use Touch ID, Face ID, Windows Hello, or another built-in platform authenticator."
                      : "Passkeys are supported here, but this browser did not report a platform authenticator."
                    : "Use a modern browser on a secure origin to unlock biometric sign-in."}
                </p>
              </div>
              <div className="signal-row">
                <Pill tone={passkeySupported ? "success" : "warn"}>{passkeySupported ? "Passkeys supported" : "Passkeys unavailable"}</Pill>
                <Pill tone={platformAuthenticatorReady ? "success" : "neutral"}>{platformAuthenticatorReady ? "Biometric ready" : "Device check pending"}</Pill>
              </div>
            </div>
            <div className="step-grid">
              {guideSteps.map((step) => (
                <article key={step.title} className="guide-step">
                  <strong>{step.title}</strong>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
            <div className="signal-row">
              <Pill tone="neutral">Request tracking</Pill>
              <Pill tone="neutral">Approvals</Pill>
              <Pill tone="neutral">Verified checks</Pill>
              <Pill tone="neutral">Clear outcomes</Pill>
            </div>
          </article>

          <article className="auth-card">
            <SectionHeading label="Secure entry" title="Connect to your workspace" />
            <form className="stack-form" onSubmit={submitLogin}>
              <label>
                Workspace address
                <input
                  type="url"
                  name="apiBase"
                  autoComplete="url"
                  value={apiBaseDraft}
                  onChange={(event) => setApiBaseDraft(event.target.value)}
                  placeholder="https://your-workspace.example.com"
                />
              </label>
              <label>
                Email address
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  value={loginForm.email}
                  onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="name@company.com"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={loginForm.password}
                  onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Enter your password"
                />
              </label>
              <button className="primary-button" disabled={loginSubmitting}>
                {loginSubmitting ? "Signing in..." : "Open workspace"}
              </button>
            </form>

            <div className="auth-divider">
              <span>or</span>
            </div>

            <div className="stack-list tight">
              <button
                type="button"
                className="passkey-button"
                disabled={!passkeySupported || passkeyBusy === "login"}
                onClick={() => void signInWithPasskey()}
              >
                <span className="passkey-glyph" aria-hidden="true">◌</span>
                <div>
                  <strong>{passkeyBusy === "login" ? "Checking your passkey..." : "Use passkey or biometrics"}</strong>
                  <p>
                    {passkeySupported
                      ? "Sign in with your saved device credential, fingerprint, face unlock, or security key."
                      : "Passkeys are not available in this browser yet."}
                  </p>
                </div>
              </button>

              <article className="mini-card frosted">
                <strong>What this means</strong>
                <p>
                  A passkey lets you sign in with the built-in security on your device instead of typing a password.
                </p>
              </article>
            </div>

            <div className="soft-note">
              <strong>Good to know</strong>
              <p>
                This screen never ships built-in credentials. Your administrator controls who can sign in,
                who can create requests, and who can approve them.
              </p>
            </div>

            {errorMessage ? (
              <div className="alert-card alert-danger">
                <strong>Sign-in problem</strong>
                <p>{errorMessage}</p>
              </div>
            ) : null}
          </article>
        </section>
      </div>
    );
  }

  return (
    <div className="screen-shell">
      <div className="ambient-glow" />

      <header className="hero-grid">
        <article className="hero-panel">
          <span className="eyebrow">Your workspace</span>
          <h1>Clear requests. Trusted automation. Easy follow-through.</h1>
          <p>
            Create work, review approval needs, and follow each request from intake to release without
            having to understand the engineering internals underneath it.
          </p>
          <div className="signal-row">
            <Pill tone="success">{dashboard?.org.name ?? "Workspace"}</Pill>
            <Pill tone={refreshing ? "active" : "neutral"}>{refreshing ? "Refreshing" : "Live"}</Pill>
            <Pill tone="neutral">Last sync {formatRelativeTime(lastUpdatedAt)}</Pill>
          </div>
          <div className="hero-callout">
            <strong>Mission</strong>
            <p>{dashboard?.org.mission ?? "Loading workspace mission."}</p>
          </div>
        </article>

        <div className="hero-side">
          <form className="info-card" onSubmit={applyEndpoint}>
            <span className="eyebrow">Connection</span>
            <strong>Workspace address</strong>
            <input
              type="url"
              name="controlPlaneEndpoint"
              autoComplete="url"
              value={apiBaseDraft}
              onChange={(event) => setApiBaseDraft(event.target.value)}
              placeholder="https://workspace.example.com"
            />
            <div className="button-row">
              <Pill tone="neutral">{apiBase}</Pill>
              <button className="secondary-button" disabled={!endpointDirty}>Save</button>
            </div>
          </form>

          <article className="info-card">
            <span className="eyebrow">Signed in as</span>
            <strong>{session.user?.name ?? session.user?.email}</strong>
            <p>{session.user?.email}</p>
            <div className="signal-row">
              <Pill tone={statusTone(session.user?.role ?? "neutral")}>{session.user?.role ?? "viewer"}</Pill>
              <Pill tone={session.authMethod === "passkey" ? "success" : "neutral"}>{authMethodLabel(session.authMethod)}</Pill>
            </div>
            <p className="micro-copy">{roleHelp(session.user?.role)}</p>
            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                disabled={!passkeySupported || passkeyBusy === "register"}
                onClick={() => void registerPasskey()}
              >
                {passkeyBusy === "register" ? "Saving passkey..." : "Add passkey"}
              </button>
              <button type="button" className="secondary-button" onClick={() => void logout()}>
                Sign out
              </button>
            </div>
          </article>

          <article className="info-card">
            <span className="eyebrow">Assistant toolbox</span>
            <strong>{openclawStatus?.available ? "Ready to help" : "Needs setup or is unavailable"}</strong>
            <p>
              {openclawStatus?.available
                ? `${openclawStatus.status.toolCount} tools and ${openclawReadySkills.length} ready skills are available to workers.`
                : openclawStatus?.error ?? "Tool availability will appear here when the connected runtime responds."}
            </p>
            <div className="signal-row">
              <Pill tone={openclawStatus?.available ? "success" : "warn"}>{openclawStatus?.available ? "Connected" : "Unavailable"}</Pill>
              <Pill tone="neutral">{openclawStatus?.agentId ?? "No agent id yet"}</Pill>
            </div>
            {openclawTopGroups.length > 0 ? (
              <p className="micro-copy">Popular tool groups: {openclawTopGroups.join(" · ")}</p>
            ) : null}
          </article>
        </div>
      </header>

      {errorMessage ? (
        <section className="alert-card alert-danger">
          <strong>Workspace problem</strong>
          <p>{errorMessage}</p>
        </section>
      ) : null}

      <section className="metrics-grid">
        <MetricCard
          label="Monthly spend"
          value={dashboard ? `${formatMoney(dashboard.org.spentBudgetUsd)} of ${formatMoney(dashboard.org.monthlyBudgetUsd)}` : "Loading..."}
          note="How much of the workspace budget has been used this month."
          progress={metrics.spendRatio}
        />
        <MetricCard
          label="Waiting for approval"
          value={String(pendingApprovals.length)}
          note="Requests that need a person to approve them before they can start."
        />
        <MetricCard
          label="In progress"
          value={String(activeTasks.length)}
          note="Requests that are waiting, running, or going through final checks."
        />
        <MetricCard
          label="Released"
          value={String(metrics.released)}
          note={`${metrics.busyWorkers} of ${workers.length || 0} workers are busy right now.`}
        />
      </section>

      {/* Keyboard shortcut hint */}
      <div className="shortcuts-hint">
        <button type="button" onClick={() => setShowShortcuts(true)} className="shortcuts-hint-button">
          <kbd>?</kbd> Keyboard shortcuts
        </button>
      </div>

      <section className="cockpit-grid">
        <article className="panel access-panel premium-panel">
          <SectionHeading
            label="Account and access"
            title="Protect your workspace and manage how you sign in"
            aside={<Pill tone={recommendedPasskey ? "warn" : "success"}>{recommendedPasskey ? "Passkey recommended" : `${passkeys.length} passkeys active`}</Pill>}
          />
          <div className="vault-banner compact">
            <div>
              <span className="eyebrow">Current sign-in</span>
              <strong>{authMethodLabel(session.authMethod)}</strong>
              <p>
                {recommendedPasskey
                  ? "Add a passkey to unlock biometric sign-in and reduce password friction."
                  : "Your account already has a passkey, so you can use biometrics or a device credential next time."}
              </p>
            </div>
            <div className="signal-row">
              <Pill tone={passkeySupported ? "success" : "warn"}>{passkeySupported ? "Browser ready" : "Browser not ready"}</Pill>
              <Pill tone={platformAuthenticatorReady ? "success" : "neutral"}>{platformAuthenticatorReady ? "Biometric ready" : "Platform unknown"}</Pill>
            </div>
          </div>

          <div className="stack-form compact-form">
            <label>
              Label this device
              <input
                name="passkeyLabel"
                autoComplete="off"
                value={passkeyLabel}
                onChange={(event) => setPasskeyLabel(event.target.value)}
                placeholder="Example: Donovan’s MacBook Pro"
              />
            </label>
            <div className="button-row">
              <button
                type="button"
                className="primary-button"
                disabled={!passkeySupported || passkeyBusy === "register"}
                onClick={() => void registerPasskey()}
              >
                {passkeyBusy === "register" ? "Saving passkey..." : "Add biometric passkey"}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!passkeySupported || passkeyBusy === "login"}
                onClick={() => void signInWithPasskey()}
              >
                {passkeyBusy === "login" ? "Waiting for biometric check..." : "Test passkey sign-in"}
              </button>
            </div>
          </div>

          {passkeys.length === 0 ? (
            <p className="empty-copy">No passkeys are saved for this account yet.</p>
          ) : (
            <div className="stack-list tight">
              {passkeys.map((credential) => (
                <article key={credential.id} className="mini-card passkey-card">
                  <div className="card-header">
                    <div>
                      <strong>{credential.label ?? "Unnamed passkey"}</strong>
                      <p>{passkeyDeviceLabel(credential.deviceType)}</p>
                    </div>
                    <Pill tone={credential.backedUp ? "success" : "neutral"}>{credential.backedUp ? "Backed up" : "Local only"}</Pill>
                  </div>
                  <div className="detail-row">
                    <span>Added {formatTime(credential.createdAt)}</span>
                    <span>Used {formatRelativeTime(credential.lastUsedAt)}</span>
                  </div>
                  <div className="signal-row compact">
                    {credential.transports.map((transport) => (
                      <Pill key={`${credential.id}-${transport}`} tone="neutral">{transport}</Pill>
                    ))}
                  </div>
                  <div className="button-row">
                    <button type="button" className="ghost-button" onClick={() => void removePasskey(credential.id)}>
                      Remove passkey
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>

        <article className="panel premium-panel">
          <SectionHeading label="System posture" title="Know what is healthy, available, and waiting" />
          <div className="service-grid">
            {serviceHighlights.map((item) => (
              <article key={item.label} className="service-card">
                <div className="card-header">
                  <strong>{item.label}</strong>
                  <Pill tone={item.tone}>{item.status}</Pill>
                </div>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
          <div className="summary-grid compact-grid">
            <div>
              <span>Waiting approvals</span>
              <strong>{pendingApprovals.length}</strong>
            </div>
            <div>
              <span>Requests needing attention</span>
              <strong>{blockedTasks.length}</strong>
            </div>
            <div>
              <span>Ready workers</span>
              <strong>{workers.filter((worker) => worker.status === "idle").length}</strong>
            </div>
            <div>
              <span>Released this view</span>
              <strong>{metrics.released}</strong>
            </div>
          </div>
        </article>

        <article className="panel premium-panel">
          <SectionHeading
            label="Operator directory"
            title={canAdministerUsers ? "People and access across the workspace" : "What your role allows"}
            aside={canAdministerUsers ? <Pill tone="neutral">{workspaceUsers.length} accounts</Pill> : <Pill tone="neutral">{session.user?.role ?? "viewer"}</Pill>}
          />
          {canAdministerUsers ? (
            workspaceUsersLoading ? (
              <p className="empty-copy">Loading workspace accounts...</p>
            ) : (
              <div className="stack-list tight">
                {workspaceUsers.map((user) => (
                  <article key={user.id} className="mini-card">
                    <div className="card-header">
                      <div>
                        <strong>{user.name}</strong>
                        <p>{user.email}</p>
                      </div>
                      <Pill tone={statusTone(user.role)}>{user.role}</Pill>
                    </div>
                    <div className="detail-row">
                      <span>{user.passkeyCount} passkeys</span>
                      <span>Last sign-in {formatRelativeTime(user.lastLoginAt)}</span>
                    </div>
                  </article>
                ))}
              </div>
            )
          ) : (
            <div className="stack-list tight">
              <article className="mini-card frosted">
                <strong>Your current access</strong>
                <p>{roleHelp(session.user?.role)}</p>
              </article>
              <article className="mini-card frosted">
                <strong>Need more access?</strong>
                <p>Ask an administrator to update your role or help enroll a passkey for this account.</p>
              </article>
            </div>
          )}
        </article>
      </section>

      <section className="action-grid">
        <article className="panel emphasis-panel">
          <SectionHeading label="Start here" title="What needs your attention now" />
          <div className="attention-grid">
            <button
              type="button"
              className="attention-card"
              onClick={() => {
                setTaskFilter("approvals");
                setSelectedTaskId(pendingApprovals[0]?.id ?? null);
              }}
            >
              <strong>{pendingApprovals.length}</strong>
              <h3>Requests waiting for approval</h3>
              <p>Open these first if you are an approver or admin.</p>
            </button>

            <button
              type="button"
              className="attention-card"
              onClick={() => {
                setTaskFilter("active");
                setSelectedTaskId(activeTasks[0]?.id ?? null);
              }}
            >
              <strong>{activeTasks.length}</strong>
              <h3>Requests moving through the system</h3>
              <p>Use this view to watch what is currently happening.</p>
            </button>

            <button
              type="button"
              className="attention-card"
              onClick={() => {
                setTaskFilter("attention");
                setSelectedTaskId(blockedTasks[0]?.id ?? null);
              }}
            >
              <strong>{blockedTasks.length}</strong>
              <h3>Requests that need attention</h3>
              <p>These have failures or blocked checks and need a decision.</p>
            </button>
          </div>

          <div className="guide-band">
            {guideSteps.map((step) => (
              <article key={step.title} className="guide-step inline">
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="panel form-panel">
          <SectionHeading label="New request" title="Ask the system to do work" />
          <form className="stack-form" onSubmit={submitTask}>
            <label>
              What do you want done?
              <input
                name="taskTitle"
                autoComplete="off"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Example: prepare a release summary for this week"
              />
            </label>

            <label>
              Describe the outcome you want
              <textarea
                name="taskDescription"
                autoComplete="off"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Write the outcome in plain language. Mention what success should look like."
              />
            </label>

            <div className="split-fields">
              <label>
                Spending limit
                <input
                  type="number"
                  name="budgetCapUsd"
                  autoComplete="off"
                  step="0.01"
                  value={form.budgetCapUsd}
                  onChange={(event) => setForm((current) => ({ ...current, budgetCapUsd: Number(event.target.value) }))}
                />
              </label>

              <div className="field-group">
                <span className="field-label">How should it run?</span>
                <div className="mode-grid">
                  {[
                    {
                      id: "deterministic",
                      label: "Safe local run",
                      description: "Uses the verified local path. Best for predictable operational work."
                    },
                    {
                      id: "provider",
                      label: "AI-assisted run",
                      description: "Uses a connected AI provider. Best for higher-judgment requests."
                    }
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={classNames("mode-card", form.executionMode === option.id && "is-selected")}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          executionMode: option.id as TaskFormState["executionMode"]
                        }))
                      }
                    >
                      <strong>{option.label}</strong>
                      <p>{option.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="field-group">
              <span className="field-label">What kind of help is needed?</span>
              <div className="capability-grid">
                {capabilityOptions.map((capability) => (
                  <button
                    key={capability.id}
                    type="button"
                    className={classNames("capability-card", form.requiredCapabilities.includes(capability.id) && "is-selected")}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        requiredCapabilities: toggleCapability(current.requiredCapabilities, capability.id)
                      }))
                    }
                  >
                    <strong>{capability.label}</strong>
                    <p>{capability.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <details className="soft-disclosure">
              <summary>Advanced settings</summary>
              <div className="disclosure-body">
                <label>
                  Repeat-protection key
                  <input
                    name="idempotencyKey"
                    autoComplete="off"
                    value={form.idempotencyKey}
                    onChange={(event) => setForm((current) => ({ ...current, idempotencyKey: event.target.value }))}
                    placeholder="Optional key to prevent duplicate requests"
                  />
                </label>
              </div>
            </details>

            <div className="soft-note">
              <strong>Before you submit</strong>
              <p>{requestModeHelp}</p>
            </div>

            <button className="primary-button" disabled={submitting}>
              {submitting ? "Creating request..." : "Create request"}
            </button>
          </form>
        </article>
      </section>

      <section className="board-grid">
        <article className="panel list-panel">
          <SectionHeading
            label="Requests"
            title="Track every request in one place"
            aside={<Pill tone="neutral">{filteredTasks.length} shown</Pill>}
          />

          <div className="filter-row">
            {taskFilterOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={classNames("filter-chip", taskFilter === option.id && "is-selected")}
                onClick={() => setTaskFilter(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {filteredTasks.length === 0 ? (
            <p className="empty-copy">No requests match this view yet.</p>
          ) : (
            <div className="stack-list">
              {filteredTasks.map((task) => {
                const gateSummary = gateSummaryForTask(task.id, dashboard?.gates ?? []);
                return (
                  <button
                    type="button"
                    key={task.id}
                    className={classNames("task-card", selectedTaskId === task.id && "is-selected")}
                    onClick={() => setSelectedTaskId(task.id)}
                  >
                    <div className="card-header">
                      <div>
                        <h3>{task.title}</h3>
                        <p>{task.description}</p>
                      </div>
                      <div className="card-statuses">
                        <Pill tone={statusTone(task.status)}>{taskStatusLabel(task)}</Pill>
                        <Pill tone={statusTone(task.approvalState)}>{approvalLabel(task.approvalState)}</Pill>
                      </div>
                    </div>

                    <p className="task-next-step">{nextStepForTask(task, dashboard?.gates ?? [])}</p>

                    <div className="signal-row compact">
                      <Pill tone="neutral">{executionModeLabel(task.executionMode)}</Pill>
                      {task.requiredCapabilities.map((capability) => (
                        <Pill key={capability} tone="neutral">{capabilityLabel(capability)}</Pill>
                      ))}
                    </div>

                    <div className="detail-row">
                      <span>Assigned to {task.assignedWorkerId ?? "the next available worker"}</span>
                      <span>Spent {formatMoney(task.budgetActualUsd, 4)}</span>
                      <span>Cap {formatMoney(task.budgetCapUsd)}</span>
                    </div>

                    <div className="task-footer">
                      <span>{gateSummary.passed} checks passed</span>
                      <span>{gateSummary.pending} pending</span>
                      <span>{gateSummary.blocked} blocked</span>
                    </div>

                    {task.lastError ? (
                      <div className="inline-alert">
                        <strong>Needs attention</strong>
                        <p>{task.lastError}</p>
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </article>

        <article className="panel detail-panel">
          <SectionHeading
            label="Selected request"
            title={selectedTask?.title ?? "Choose a request"}
            aside={selectedTask ? <Pill tone={statusTone(selectedTask.status)}>{taskStatusLabel(selectedTask)}</Pill> : null}
          />

          {taskLoading ? <p className="empty-copy">Loading request details...</p> : null}
          {!selectedTask ? (
            <p className="empty-copy">Choose a request to see who asked for it, what happens next, and why it passed or failed.</p>
          ) : null}

          {selectedTask && taskDetail ? (
            <div className="stack-list">
              <section className="detail-banner">
                <div className="card-header">
                  <div>
                    <h3>{selectedTask.resultSummary ?? "This request is still waiting for a final summary."}</h3>
                    <p>{nextStepForTask(selectedTask, taskDetail.gates)}</p>
                  </div>
                  <div className="card-statuses">
                    <Pill tone={statusTone(selectedTask.approvalState)}>{approvalLabel(selectedTask.approvalState)}</Pill>
                    <Pill tone="neutral">{executionModeLabel(selectedTask.executionMode)}</Pill>
                  </div>
                </div>

                <div className="workflow-steps" aria-label="Request progress">
                  {selectedTaskSteps.map((step) => (
                    <div key={step.label} className={classNames("workflow-step", `is-${step.state}`)}>
                      <span />
                      <strong>{step.label}</strong>
                    </div>
                  ))}
                </div>

                <div className="summary-grid">
                  <div>
                    <span>Requested by</span>
                    <strong>{selectedTask.requestedBy}</strong>
                  </div>
                  <div>
                    <span>Assigned worker</span>
                    <strong>{selectedTask.assignedWorkerId ?? "Next available worker"}</strong>
                  </div>
                  <div>
                    <span>Budget cap</span>
                    <strong>{formatMoney(selectedTask.budgetCapUsd)}</strong>
                  </div>
                  <div>
                    <span>Actual spend</span>
                    <strong>{formatMoney(selectedTask.budgetActualUsd, 4)}</strong>
                  </div>
                </div>
              </section>

              <section className="sub-card">
                <SectionHeading label="Approval" title="Person-in-the-loop decision" />
                <p className="plain-copy">
                  {selectedTask.approvalReason
                    ? selectedTask.approvalReason
                    : "No approval note has been recorded yet."}
                </p>
                <div className="summary-grid compact-grid">
                  <div>
                    <span>Status</span>
                    <strong>{approvalLabel(selectedTask.approvalState)}</strong>
                  </div>
                  <div>
                    <span>Approved by</span>
                    <strong>{selectedTask.approvedBy ?? "Not approved yet"}</strong>
                  </div>
                  <div>
                    <span>Approved at</span>
                    <strong>{formatTime(selectedTask.approvedAt)}</strong>
                  </div>
                  <div>
                    <span>Retry count</span>
                    <strong>{selectedTask.retryCount} of {selectedTask.maxRetries}</strong>
                  </div>
                </div>

                {selectedTask.approvalState !== "approved" && canApprove ? (
                  <div className="approval-panel">
                    <label>
                      Approval note
                      <textarea
                        name="approvalReason"
                        autoComplete="off"
                        value={approvalReason}
                        onChange={(event) => setApprovalReason(event.target.value)}
                      />
                    </label>
                    <div className="button-row">
                      <button type="button" className="primary-button" onClick={() => void updateApproval("approved")}>
                        Approve request
                      </button>
                      <button type="button" className="danger-button" onClick={() => void updateApproval("rejected")}>
                        Reject request
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="micro-copy">
                    {canApprove
                      ? "This request already has an approval decision."
                      : "Your current role can review progress, but it cannot approve or reject requests."}
                  </p>
                )}
              </section>

              <section className="sub-card">
                <SectionHeading
                  label="Checks"
                  title="Why this request passed, paused, or failed"
                  aside={selectedTaskGateSummary ? <Pill tone="neutral">{selectedTaskGateSummary.passed} of 5 passed</Pill> : null}
                />
                <div className="gate-grid">
                  {taskDetail.gates.map((gate) => (
                    <article key={gate.id} className={classNames("gate-card", `tone-${statusTone(gate.status)}`)}>
                      <div className="card-header">
                        <div>
                          <h3>{gateTypeLabel(gate.gateType)}</h3>
                          <p>{gate.evidence.summary}</p>
                        </div>
                        <Pill tone={statusTone(gate.status)}>{gate.status}</Pill>
                      </div>
                      <ul className="rule-list">
                        {gate.evidence.rules.map((rule) => (
                          <li key={rule.code}>
                            <strong>{rule.message}</strong>
                            <span>{rule.code}</span>
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>

                {selectedTask.releaseDecision ? (
                  <div className={classNames("release-card", selectedTask.releaseDecision.allowed ? "release-allowed" : "release-blocked")}>
                    <strong>{releaseHeadline(selectedTask)}</strong>
                    <p className="micro-copy">Decision recorded {formatTime(selectedTask.releaseDecision.decidedAt)}.</p>
                    <ul>
                      {(selectedTask.releaseDecision.allowed
                        ? selectedTask.releaseDecision.reasons
                        : selectedTask.releaseDecision.blockingReasons
                      ).map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>

              <section className="sub-card">
                <SectionHeading label="Execution" title="What happened during the run" />
                {taskDetail.executions.length === 0 ? (
                  <p className="empty-copy">No execution record has been stored yet.</p>
                ) : (
                  <div className="stack-list tight">
                    {taskDetail.executions.map((execution) => (
                      <article key={execution.id} className="execution-card">
                        <div className="card-header">
                          <div>
                            <h3>{execution.summary}</h3>
                            <p>{executionModeLabel(execution.executionMode)} via {execution.provider}</p>
                          </div>
                          <div className="card-statuses">
                            <Pill tone={statusTone(execution.status)}>{execution.status}</Pill>
                            <Pill tone="neutral">{formatMoney(execution.usage.costUsd, 4)}</Pill>
                          </div>
                        </div>

                        <div className="summary-grid compact-grid">
                          <div>
                            <span>Finished</span>
                            <strong>{formatTime(execution.completedAt)}</strong>
                          </div>
                          <div>
                            <span>Model</span>
                            <strong>{execution.model}</strong>
                          </div>
                          <div>
                            <span>Total tokens</span>
                            <strong>{execution.usage.totalTokens}</strong>
                          </div>
                          <div>
                            <span>Tool calls</span>
                            <strong>{execution.toolCalls.length}</strong>
                          </div>
                        </div>

                        <details className="soft-disclosure">
                          <summary>Open full technical record</summary>
                          <div className="disclosure-body">
                            <div className="code-panel">
                              <span className="eyebrow">Prompt</span>
                              <pre>{execution.prompt}</pre>
                            </div>
                            <div className="code-panel">
                              <span className="eyebrow">Response</span>
                              <pre>{execution.response}</pre>
                            </div>
                            <div className="code-panel">
                              <span className="eyebrow">Tool calls</span>
                              <pre>{execution.toolCalls.map((tool) => `${tool.name}: ${tool.resultSummary ?? "no summary"}`).join("\n") || "None recorded."}</pre>
                            </div>
                          </div>
                        </details>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="sub-card">
                <SectionHeading label="Linked systems" title="Connected records and audit trail" />
                <div className="summary-grid compact-grid">
                  <div>
                    <span>Paperclip issue</span>
                    <strong>{selectedTask.integrationRefs?.paperclip?.issueIdentifier ?? selectedTask.integrationRefs?.paperclip?.issueId ?? "Not linked"}</strong>
                  </div>
                  <div>
                    <span>Hermes conversation</span>
                    <strong>{selectedTask.integrationRefs?.hermes?.conversationId ?? "Not linked"}</strong>
                  </div>
                  <div>
                    <span>OpenClaw agent</span>
                    <strong>{selectedTask.integrationRefs?.openclaw?.agentId ?? "Not linked"}</strong>
                  </div>
                  <div>
                    <span>OpenClaw session</span>
                    <strong>{selectedTask.integrationRefs?.openclaw?.sessionId ?? selectedTask.integrationRefs?.openclaw?.sessionKey ?? "Not linked"}</strong>
                  </div>
                </div>
                {selectedTask.integrationRefs?.paperclip?.issueUrl ? (
                  <p className="micro-copy">
                    <a href={selectedTask.integrationRefs.paperclip.issueUrl} target="_blank" rel="noreferrer">
                      Open the linked Paperclip issue
                    </a>
                  </p>
                ) : null}

                <details className="soft-disclosure">
                  <summary>Open technical links and event history</summary>
                  <div className="disclosure-body stack-list tight">
                    <div className="code-panel">
                      <span className="eyebrow">Integration records</span>
                      <pre>{selectedTask.integrationRefs ? stringifyJson(selectedTask.integrationRefs) : "No integration references recorded."}</pre>
                    </div>
                    <div className="timeline compact">
                      {taskDetail.events.map((event) => (
                        <article key={event.id} className="timeline-item">
                          <div className="timeline-marker" />
                          <div>
                            <div className="timeline-head">
                              <strong>{event.eventType}</strong>
                              <time>{formatTime(event.createdAt)}</time>
                            </div>
                            <p>{event.actor}</p>
                            <p className="micro-copy">{summarizeEventDetail(event.detail)}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                </details>
              </section>
            </div>
          ) : null}
        </article>
      </section>

      <section className="support-grid">
        <article className="panel team-panel">
          <SectionHeading
            label="Team and activity"
            title="Who is available and what they have been doing"
            aside={<Pill tone="neutral">{workers.length} workers</Pill>}
          />

          {workers.length === 0 ? (
            <p className="empty-copy">No workers are registered yet. Start the worker service to accept requests.</p>
          ) : (
            <div className="support-content">
              <div className="stack-list tight">
                {workers.map((worker) => (
                  <button
                    type="button"
                    key={worker.id}
                    className={classNames("worker-card", selectedWorkerId === worker.id && "is-selected")}
                    onClick={() => setSelectedWorkerId(worker.id)}
                  >
                    <div className="card-header">
                      <div>
                        <h3>{worker.name}</h3>
                        <p>{worker.role}</p>
                      </div>
                      <Pill tone={statusTone(worker.status)}>{workerStatusLabel(worker.status)}</Pill>
                    </div>
                    <p>{worker.lastSummary ?? "No work summary recorded yet."}</p>
                    <div className="detail-row">
                      <span>Heartbeat {formatRelativeTime(worker.lastHeartbeatAt)}</span>
                      <span>{worker.executionModes.map(executionModeLabel).join(" · ")}</span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="worker-detail">
                {workerLoading ? <p className="empty-copy">Loading worker details...</p> : null}
                {!selectedWorker ? <p className="empty-copy">Choose a worker to see recent sessions and memory.</p> : null}
                {selectedWorker && workerDetail ? (
                  <div className="stack-list">
                    <section className="sub-card">
                      <div className="card-header">
                        <div>
                          <h3>{selectedWorker.name}</h3>
                          <p>{selectedWorker.role}</p>
                        </div>
                        <Pill tone={statusTone(selectedWorker.status)}>{workerStatusLabel(selectedWorker.status)}</Pill>
                      </div>
                      <div className="summary-grid compact-grid">
                        <div>
                          <span>Adapter</span>
                          <strong>{selectedWorker.adapter}</strong>
                        </div>
                        <div>
                          <span>Monthly budget</span>
                          <strong>{formatMoney(selectedWorker.monthlyBudgetUsd)}</strong>
                        </div>
                        <div>
                          <span>Spent</span>
                          <strong>{formatMoney(selectedWorker.spentBudgetUsd)}</strong>
                        </div>
                        <div>
                          <span>Current task</span>
                          <strong>{selectedWorker.currentTaskId ?? "None"}</strong>
                        </div>
                      </div>
                      <div className="signal-row compact">
                        <Pill tone="success">🛡️ Sandboxed Runner Active</Pill>
                        <Pill tone="info">📚 Dynamic Skills Loaded</Pill>
                        {selectedWorker.capabilities.map((capability) => (
                          <Pill key={capability} tone="neutral">{capabilityLabel(capability)}</Pill>
                        ))}
                      </div>
                    </section>

                    <section className="sub-card">
                      <SectionHeading
                        label="Assistant toolbox"
                        title="Connected skills and tools"
                        aside={<Pill tone={openclawStatus?.available ? "success" : "warn"}>{openclawStatus?.available ? "Connected" : "Unavailable"}</Pill>}
                      />
                      <div className="summary-grid compact-grid">
                        <div>
                          <span>Agent</span>
                          <strong>{openclawStatus?.agentId ?? "Unavailable"}</strong>
                        </div>
                        <div>
                          <span>Tools</span>
                          <strong>{openclawStatus?.status.toolCount ?? openclawToolCount}</strong>
                        </div>
                        <div>
                          <span>Groups</span>
                          <strong>{openclawStatus?.status.groupCount ?? Object.keys(openclawTools?.groups ?? {}).length}</strong>
                        </div>
                        <div>
                          <span>Ready skills</span>
                          <strong>{openclawReadySkills.length}</strong>
                        </div>
                      </div>
                      {openclawReadySkills.length > 0 ? (
                        <div className="stack-list tight">
                          {openclawReadySkills.slice(0, 4).map((skill) => (
                            <article key={skill.name} className="mini-card">
                              <strong>{skill.emoji ? `${skill.emoji} ${skill.name}` : skill.name}</strong>
                              <p>{skill.description}</p>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="empty-copy">No connected skill list is available yet.</p>
                      )}
                    </section>

                    <section className="sub-card">
                      <SectionHeading label="Recent sessions" title="Short-term memory and recent work" />
                      {workerDetail.sessions.length === 0 ? (
                        <p className="empty-copy">No sessions are stored yet.</p>
                      ) : (
                        <div className="stack-list tight">
                          {workerDetail.sessions.map((sessionRecord) => (
                            <article key={sessionRecord.id} className="mini-card">
                              <div className="card-header">
                                <strong>{sessionRecord.status}</strong>
                                <span>{formatTime(sessionRecord.startedAt)}</span>
                              </div>
                              <p>Task {sessionRecord.taskId}</p>
                              <p className="micro-copy">{sessionRecord.recallSummary || "No recalled memory recorded."}</p>
                            </article>
                          ))}
                        </div>
                      )}

                      {workerDetail.memory.length === 0 ? (
                        <p className="empty-copy">No memory entries are stored yet.</p>
                      ) : (
                        <div className="stack-list tight">
                          {workerDetail.memory.slice(0, 6).map((entry) => (
                            <article key={entry.id} className="mini-card">
                              <div className="card-header">
                                <strong>{entry.category}</strong>
                                <span>{formatRelativeTime(entry.createdAt)}</span>
                              </div>
                              <p>{entry.content}</p>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </article>

        <article className="panel guide-panel">
          <SectionHeading label="Plain-language guide" title="How to use this workspace with confidence" />
          <div className="stack-list">
            <section className="sub-card">
              <h3>What you can do here</h3>
              <p>
                Create requests, see whether they need approval, follow progress, review outcomes, and
                understand why the system released or blocked something.
              </p>
            </section>

            <section className="sub-card">
              <h3>Common status meanings</h3>
              <div className="stack-list tight">
                {statusGlossary.map((item) => (
                  <article key={item.term} className="mini-card">
                    <strong>{item.term}</strong>
                    <p>{item.body}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="sub-card">
              <h3>Who can do what</h3>
              <p>{roleHelp(session.user?.role)}</p>
              <p className="micro-copy">
                If you need a new role or new access, ask an administrator. If you only need to follow progress,
                the requests list and selected request panel are the primary places to stay.
              </p>
            </section>

            <section className="sub-card">
              <h3>Where to go deeper</h3>
              <p>
                Every selected request includes a plain-language summary first. If you need more detail, open the
                technical record under Execution or Linked systems.
              </p>
              <p className="micro-copy">
                Repository manual: <code>docs/USER_MANUAL.md</code>
              </p>
            </section>

            <section className="sub-card">
              <h3>Recent activity</h3>
              {recentEvents.length === 0 ? (
                <p className="empty-copy">No recent activity has been recorded yet.</p>
              ) : (
                <div className="timeline compact">
                  {recentEvents.slice(0, 6).map((event) => (
                    <article key={event.id} className="timeline-item">
                      <div className="timeline-marker" />
                      <div>
                        <div className="timeline-head">
                          <strong>{event.eventType}</strong>
                          <time>{formatRelativeTime(event.createdAt)}</time>
                        </div>
                        <p>{event.actor}</p>
                        <p className="micro-copy">{summarizeEventDetail(event.detail)}</p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </article>
      </section>

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts ? (
        <div className="shortcuts-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
            <div className="shortcuts-header">
              <h2>Keyboard Shortcuts</h2>
              <button type="button" className="shortcuts-close" onClick={() => setShowShortcuts(false)}>
                ✕
              </button>
            </div>
            <div className="shortcuts-content">
              <section className="shortcuts-section">
                <h3>Navigation</h3>
                <div className="shortcut-row">
                  <kbd>j</kbd>
                  <span>Next task</span>
                </div>
                <div className="shortcut-row">
                  <kbd>k</kbd>
                  <span>Previous task</span>
                </div>
                <div className="shortcut-row">
                  <kbd>Enter</kbd>
                  <span>View task details</span>
                </div>
                <div className="shortcut-row">
                  <kbd>Esc</kbd>
                  <span>Close modal</span>
                </div>
              </section>
              <section className="shortcuts-section">
                <h3>Actions</h3>
                <div className="shortcut-row">
                  <kbd>Ctrl</kbd> + <kbd>r</kbd>
                  <span>Refresh dashboard</span>
                </div>
                <div className="shortcut-row">
                  <kbd>Shift</kbd> + <kbd>?</kbd>
                  <span>Show this help</span>
                </div>
                <div className="shortcut-row">
                  <kbd>Ctrl</kbd> + <kbd>k</kbd>
                  <span>Show keyboard shortcuts</span>
                </div>
              </section>
            </div>
            <div className="shortcuts-footer">
              <p>Press <kbd>Esc</kbd> to close</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
