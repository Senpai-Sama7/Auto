import { useState } from "react";
import { TaskForm } from "./TaskForm.js";
import { TaskDetails } from "./TaskDetails.js";

type Task = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  requesterId: string;
  assignedWorkerId: string | null;
  tags?: string[];
  createdAt: string;
  approvedAt: string | null;
  completedAt: string | null;
  releasedAt: string | null;
  budgetCapUsd?: number;
  budgetActualUsd?: number;
  executionMode?: string;
};

type TasksProps = {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (id: string | null) => void;
  onCreateTask: (payload: { title: string; description: string; priority: string; tags: string[] }) => Promise<void>;
  onApproveTask: (id: string) => void;
  userRole: string;
};

const statusColors: Record<string, string> = {
  pending: "status-pending",
  approved: "status-approved",
  queued: "status-queued",
  running: "status-running",
  completed: "status-completed",
  released: "status-released",
  failed: "status-failed"
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  released: "Released",
  failed: "Failed"
};

type TaskTab = "all" | "pending" | "active" | "completed";

export function Tasks({
  tasks,
  selectedTaskId,
  onSelectTask,
  onCreateTask,
  onApproveTask,
  userRole
}: TasksProps) {
  const [activeTab, setActiveTab] = useState<TaskTab>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [isCreating, setIsCreating] = useState(false);
  const canApprove = userRole === "approver" || userRole === "admin";

  const filteredTasks = tasks
    .filter(task => {
      if (activeTab === "all") return true;
      if (activeTab === "pending") return task.status === "pending";
      if (activeTab === "active") return ["approved", "queued", "running"].includes(task.status);
      if (activeTab === "completed") return ["completed", "released", "failed"].includes(task.status);
      return true;
    })
    .sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

  return (
    <div className="section-tasks">
      <div className="dashboard-header">
        <div>
          <p className="section-label">Operations</p>
          <h1 className="section-title">Tasks</h1>
        </div>
        <button className="btn btn-primary" onClick={() => { onSelectTask(null); setIsCreating(true); }}>
          + New Task
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-4)", paddingBottom: "var(--sp-4)", borderBottom: "1px solid var(--border)" }}>
        <div className="tab-bar">
          {(["all", "pending", "active", "completed"] as TaskTab[]).map(tab => (
            <button
              key={tab}
              className={`tab-item ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Sort</span>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
            style={{
              padding: "var(--sp-2) var(--sp-3)",
              borderRadius: "var(--r-md)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              fontSize: "0.85rem",
              fontFamily: "var(--font)",
              cursor: "pointer",
              outline: "none"
            }}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>
      </div>

      {/* Two-panel layout */}
      <div style={{ display: "flex", gap: "var(--sp-4)", height: "calc(100vh - 280px)" }}>
        {/* Task list */}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto", paddingRight: "var(--sp-2)" }}>
          {filteredTasks.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "var(--sp-10)" }}>
              <p style={{ color: "var(--text-3)", fontSize: "0.9rem", marginBottom: "var(--sp-4)" }}>No tasks in this category.</p>
              {activeTab === "all" && (
                <button className="btn btn-primary btn-sm" onClick={() => { onSelectTask(null); setIsCreating(true); }}>
                  Create First Task
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
              {filteredTasks.map(task => (
                <div
                  key={task.id}
                  className={`task-item ${selectedTaskId === task.id ? "selected" : ""}`}
                  onClick={() => { setIsCreating(false); onSelectTask(task.id); }}
                >
                  <div className="task-main">
                    <h3 className="task-title">{task.title}</h3>
                    <span className={`task-status ${statusColors[task.status] || ""}`}>
                      {statusLabels[task.status] || task.status}
                    </span>
                  </div>
                  <div className="task-meta">
                    <span>{formatTime(task.createdAt)}</span>
                    {task.assignedWorkerId && (
                      <span style={{ color: "var(--accent)" }}>Worker {task.assignedWorkerId.slice(0, 8)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail pane */}
        {(isCreating || selectedTaskId) && (
          <div style={{ width: "420px", flexShrink: 0 }}>
            <div className="card" style={{ height: "100%", overflowY: "auto" }}>
              {isCreating && (
                <TaskForm
                  onSubmit={async (payload) => { await onCreateTask(payload); setIsCreating(false); }}
                  onCancel={() => setIsCreating(false)}
                />
              )}
              {!isCreating && selectedTaskId && tasks.find(t => t.id === selectedTaskId) && (
                <TaskDetails
                  task={tasks.find(t => t.id === selectedTaskId)!}
                  onClose={() => onSelectTask(null)}
                  onApprove={onApproveTask}
                  canApprove={canApprove}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
