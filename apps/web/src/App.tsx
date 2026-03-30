import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent
} from "react";
import { Navigation, type TabId } from "./components/Navigation.js";
import { Dashboard } from "./components/Dashboard.js";
import { Tasks } from "./components/Tasks.js";
import { Workers } from "./components/Workers.js";
import { Settings } from "./components/Settings.js";
import { Chatbox } from "./components/Chatbox.js";
import { VideoOverlay } from "./components/VideoOverlay.js";

// Types (keeping existing type definitions)
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
  gatewayUrl: string;
};

type TaskIntegrationRefs = {
  paperclip: PaperclipRef | null;
  hermes: HermesRef | null;
  openclaw: OpenClawRef | null;
};

type Task = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  requesterId: string;
  assignedWorkerId: string | null;
  integrationRefs: TaskIntegrationRefs;
  memoryKeys: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  completedAt: string | null;
  releasedAt: string | null;
};

type DashboardState = {
  tasks: Task[];
  workers: Worker[];
  budget: {
    monthlyUsd: number;
    spentUsd: number;
  };
  stats: {
    tasksPending: number;
    tasksRunning: number;
    tasksCompleted: number;
    workersIdle: number;
    workersBusy: number;
  };
};

type OpenClawStatus = {
  ready: boolean;
  gatewayUrl: string;
  agentId: string;
  model: string;
  homeDir: string;
};

type OpenClawSkills = {
  available: boolean;
  skills: Array<{ name: string; description: string; eligible: boolean }>;
};

type OpenClawTools = {
  available: boolean;
  sections: unknown[];
  groups: unknown;
  profiles: unknown[];
};

// Constants
const apiBaseStorageKey = "ultimate-system.api-base";

// Helper functions
function initialLogin(): { email: string; password: string } {
  return { email: "", password: "" };
}

function initialForm(): { title: string; description: string; priority: string; tags: string } {
  return { title: "", description: "", priority: "medium", tags: "" };
}

function normalizeApiBase(raw: string): string {
  return raw.replace(/\/+$/, "");
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

    if (import.meta.env.VITE_API_BASE_URL) {
      return normalizeApiBase(import.meta.env.VITE_API_BASE_URL);
    }

    return normalizeApiBase(window.location.origin);
  }

  return normalizeApiBase(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4100");
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
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

// Main App Component
export default function App() {
  const [apiBase, setApiBase] = useState(resolveInitialApiBase);
  const [_apiBaseDraft, setApiBaseDraft] = useState(resolveInitialApiBase);
  const [session, setSession] = useState<SessionState | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [loginForm, setLoginForm] = useState(initialLogin);
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [_passkeyBusy, _setPasskeyBusy] = useState<"login" | "register" | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const [_workspaceUsers, setWorkspaceUsers] = useState<WorkspaceUser[]>([]);
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const dashboardLoadRef = useRef(false);
  const [openclawStatus, setOpenclawStatus] = useState<OpenClawStatus | null>(null);
  const [openclawSkills, setOpenclawSkills] = useState<OpenClawSkills | null>(null);
  const [openclawTools, setOpenclawTools] = useState<OpenClawTools | null>(null);
  const [form, setForm] = useState(initialForm);
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [_refreshing, setRefreshing] = useState(false);
  const [_submitting, setSubmitting] = useState(false);
  const [_lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [chatModel, setChatModel] = useState("openrouter/anthropic/claude-sonnet-4");

  // System component states
  const [components, setComponents] = useState([
    { id: "worker", name: "Worker Execution", description: "Processes queued tasks and executes them via runtime adapters", enabled: true, critical: true },
    { id: "auto-approval", name: "Auto-Approval", description: "Automatically approves tasks that pass validation gates", enabled: false, critical: false },
    { id: "hermes", name: "Hermes Gateway", description: "AI conversation integration for context-aware execution", enabled: true, critical: false },
    { id: "openclaw", name: "OpenClaw Gateway", description: "Advanced AI agent orchestration and tool execution", enabled: true, critical: false },
    { id: "paperclip", name: "Paperclip Sync", description: "Bidirectional sync with issue tracking systems", enabled: true, critical: false },
    { id: "notifications", name: "Notifications", description: "Real-time alerts for task status changes", enabled: true, critical: false }
  ]);

  function handleApiError(error: unknown, fallback: string) {
    if (error instanceof ApiError && error.status === 401) {
      setSession({ authenticated: false, authMethod: null, user: null });
      setDashboard(null);
      setPasskeys([]);
      setWorkspaceUsers([]);
      setErrorMessage("Your session expired. Please sign in again.");
      return;
    }
    setErrorMessage(error instanceof Error ? error.message : fallback);
  }

  const loadDashboard = useCallback(async () => {
    if (!session?.authenticated || dashboardLoadRef.current) return;
    dashboardLoadRef.current = true;
    setRefreshing(true);

    try {
      type RawState = {
        org: { monthlyBudgetUsd: number; spentBudgetUsd: number };
        tasks: Array<{ status: string; approvalState: string }>;
        workers: Array<{ status: string }>;
      };
      const raw = await fetchJson<RawState>(apiBase, "/api/state");
      const tasksArr = Array.isArray(raw.tasks) ? raw.tasks : [];
      const workersArr = Array.isArray(raw.workers) ? raw.workers : [];

      const next: DashboardState = {
        tasks: tasksArr as unknown as Task[],
        workers: workersArr as unknown as Worker[],
        budget: {
          monthlyUsd: raw.org?.monthlyBudgetUsd ?? 0,
          spentUsd: raw.org?.spentBudgetUsd ?? 0
        },
        stats: {
          tasksPending: tasksArr.filter(t => t.approvalState === "pending").length,
          tasksRunning: tasksArr.filter(t => t.status === "queued").length,
          tasksCompleted: tasksArr.filter(t => t.status === "released").length,
          workersIdle: workersArr.filter(w => w.status === "idle").length,
          workersBusy: workersArr.filter(w => w.status !== "idle").length
        }
      };

      const [runtimeStatus, skills, tools] = await Promise.all([
        fetchJson<OpenClawStatus>(apiBase, "/api/openclaw/status").catch(() => null),
        fetchJson<OpenClawSkills>(apiBase, "/api/openclaw/skills").catch(() => null),
        fetchJson<OpenClawTools>(apiBase, "/api/openclaw/tools").catch(() => null)
      ]);

      setDashboard(next);
      if (runtimeStatus) setOpenclawStatus(runtimeStatus);
      if (skills) setOpenclawSkills(skills);
      if (tools) setOpenclawTools(tools);
      setLastUpdatedAt(new Date().toISOString());
      setErrorMessage(null);
    } catch (error) {
      handleApiError(error, "We could not refresh the workspace just now.");
    } finally {
      dashboardLoadRef.current = false;
      setRefreshing(false);
    }
  }, [apiBase, session]);

  const loadAccessData = useCallback(async () => {
    if (!session?.authenticated) return;

    try {
      const credentialList = await fetchJson<PasskeyListResponse>(apiBase, "/api/auth/passkeys");
      setPasskeys(credentialList.credentials);

      if (session.user?.role === "admin") {
        const users = await fetchJson<WorkspaceUser[]>(apiBase, "/api/users");
        setWorkspaceUsers(users);
      }
    } catch (error) {
      handleApiError(error, "We could not load the workspace access details.");
    }
  }, [apiBase, session]);

  // Effects
  useEffect(() => {
    // Safety timeout for sessionReady
    const timer = setTimeout(() => {
      setSessionReady(true);
      console.warn("Session loading timed out, forcing visibility.");
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(apiBaseStorageKey, apiBase);
    }
  }, [apiBase]);

  useEffect(() => {
    setSessionReady(false);
    let cancelled = false;

    void (async () => {
      try {
        const next = await fetchJson<SessionState>(apiBase, "/api/auth/session");
        if (!cancelled) {
          setSession(next);
          setErrorMessage(null);
        }
      } catch (error) {
        if (!cancelled) handleApiError(error, "We could not load your session.");
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, [apiBase]);

  useEffect(() => {
    if (!session?.authenticated) {
      setOpenclawStatus(null);
      setOpenclawSkills(null);
      setOpenclawTools(null);
      return;
    }
    void loadDashboard();
    void loadAccessData();
    const timer = window.setInterval(() => void loadDashboard(), 4000);
    return () => window.clearInterval(timer);
  }, [loadDashboard, loadAccessData, session?.authenticated]);

  // Event handlers
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await fetchJson<SessionState>(apiBase, "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm)
      });
      setSession(result);
      setLoginForm(initialLogin());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetchJson(apiBase, "/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore
    }
    setSession({ authenticated: false, authMethod: null, user: null });
    setDashboard(null);
    setPasskeys([]);
    setWorkspaceUsers([]);
  };

  const _handleCreateTask = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await fetchJson(apiBase, "/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          priority: form.priority,
          tags: form.tags.split(",").map(t => t.trim()).filter(Boolean)
        })
      });
      setForm(initialForm());
      loadDashboard();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Task creation failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveTask = async (taskId: string) => {
    setErrorMessage(null);
    try {
      await fetchJson(apiBase, `/api/tasks/${taskId}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: true, reason: "Approved" })
      });
      void loadDashboard();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Approval failed.");
    }
  };

  const handleToggleComponent = (id: string, enabled: boolean) => {
    setComponents(prev => prev.map(c => c.id === id ? { ...c, enabled } : c));
  };

  const handleToggleAll = (enabled: boolean) => {
    setComponents(prev => prev.map(c => ({ ...c, enabled })));
  };

  // Computed values
  const sortedTasks = useMemo(() => {
    if (!dashboard) return [];
    return [...(dashboard.tasks ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [dashboard]);

  const openclawConnected = openclawStatus?.ready ?? false;

  // Render login if not authenticated
  if (!sessionReady) {
    return (
      <div className="app" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', textAlign: 'center' }}>
        <div className="loader-card">
           <div className="loader-spinner" />
           <h2 className="loader-title">Initializing Workspace</h2>
           <p className="loader-desc">Establishing secure connection to control plane at {apiBase}...</p>
        </div>
      </div>
    );
  }

  if (!session?.authenticated) {
    return (
      <div className="app-login">
        <div className="login-card">
          <div className="login-brand">
            <span className="login-logo-mark">◈</span>
            <h1>Ultimate System</h1>
            <p>Sign in to your workspace</p>
          </div>

          {errorMessage && (
            <div className="alert alert-error">{errorMessage}</div>
          )}

          <form className="login-form" onSubmit={handleLogin}>
            <label className="login-field">
              <span>Email</span>
              <input
                type="email"
                value={loginForm.email}
                onChange={e => setLoginForm(prev => ({ ...prev, email: e.target.value }))}
                required
                autoComplete="email"
              />
            </label>
            <label className="login-field">
              <span>Password</span>
              <input
                type="password"
                value={loginForm.password}
                onChange={e => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                required
                autoComplete="current-password"
              />
            </label>
            <button type="submit" className="login-submit" disabled={loginSubmitting}>
              {loginSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="login-footer">
            <span className="login-connection">API: {apiBase}</span>
          </div>
        </div>
      </div>
    );
  }

  // Main dashboard layout
  return (
    <>
      <VideoOverlay onEnter={() => setSessionReady(true)} />
      <div 
        id="app-root"
        className="app obsidian-theme" 
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          minHeight: '100vh', 
          width: '100%', 
          position: 'relative', 
          overflowX: 'hidden',
          zIndex: 1,
          opacity: 1, // Controlled by sessionReady check above
          transition: 'opacity 0.8s ease-in-out'
        }}
      >
        <Navigation
          activeTab={activeTab}
          onTabChange={setActiveTab}
          authenticated={session.authenticated}
          user={session.user}
          onSignOut={handleLogout}
        />

      <main className="main-content" style={{ flex: 1, position: 'relative', zIndex: 2 }}>
        {!dashboard && activeTab !== "settings" && (
          <div className="loader-container">
            <div className="loader-card">
              <div className="loader-spinner" />
              <h2 className="loader-title">Initializing Workspace</h2>
              <p className="loader-desc">Establishing secure connection to control plane and synchronized state...</p>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="alert alert-error">
            {errorMessage}
            <button onClick={() => setErrorMessage(null)} className="alert-close">×</button>
          </div>
        )}

        {activeTab === "dashboard" && dashboard && (
          <Dashboard
            workspaceName="Ultimate System"
            mission="Route work through a governed control plane and complete it through durable workers."
            stats={{
              monthlySpend: dashboard.budget?.spentUsd ?? 0,
              budget: dashboard.budget?.monthlyUsd ?? 0,
              waitingApproval: dashboard.stats?.tasksPending ?? 0,
              inProgress: dashboard.stats?.tasksRunning ?? 0,
              released: dashboard.stats?.tasksCompleted ?? 0,
              totalWorkers: (dashboard.workers?.length ?? 0),
              busyWorkers: dashboard.stats?.workersBusy ?? 0
            }}
            openclawStatus={openclawConnected ? "connected" : "disconnected"}
            toolsCount={Array.isArray(openclawTools?.sections) ? openclawTools.sections.length : 0}
            skillsCount={Array.isArray(openclawSkills?.skills) ? openclawSkills.skills.length : 0}
            onCreateTask={() => setActiveTab("tasks")}
          />
        )}

        {activeTab === "tasks" && (
          <Tasks
            tasks={sortedTasks}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
            onCreateTask={async (payload: { title: string; description: string; priority: string; tags: string[] }) => {
              setSubmitting(true);
              try {
                await fetch(`${apiBase}/api/tasks`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload)
                });
                loadDashboard();
              } catch {
                setErrorMessage("Failed to create task");
              } finally {
                setSubmitting(false);
              }
            }}
            onApproveTask={handleApproveTask}
            userRole={session.user?.role ?? ""}
          />
        )}

        {activeTab === "workers" && dashboard && (
          <Workers
            workers={dashboard.workers ?? []}
            selectedWorkerId={selectedWorkerId}
            onSelectWorker={setSelectedWorkerId}
          />
        )}

        {activeTab === "settings" && (
          <Settings
            components={components}
            onToggleComponent={handleToggleComponent}
            onToggleAll={handleToggleAll}
            apiBase={apiBase}
            onApiBaseChange={(url) => {
              setApiBaseDraft(url);
              setApiBase(url);
            }}
            user={session.user}
            passkeys={passkeys}
            onAddPasskey={() => { /* TODO: Implement */ }}
            onDeletePasskey={() => { /* TODO: Implement */ }}
          />
        )}
      </main>
      <Chatbox apiBase={apiBase} context={{ currentTab: activeTab, selectedTaskId }} model={chatModel} onModelChange={setChatModel} />
    </div>
    </>
  );
}