// Using the full Task type available from the backend
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

type TaskDetailsProps = {
  task: Task;
  onClose: () => void;
  onApprove: (id: string) => void;
  canApprove: boolean;
};

export function TaskDetails({ task, onClose, onApprove, canApprove }: TaskDetailsProps) {
  return (
    <div style={{ padding: "1.5rem", backgroundColor: "var(--surface)", borderRadius: "0.5rem", border: "1px solid var(--border)", height: "100%", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ margin: "0 0 0.5rem 0" }}>{task.title}</h2>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span className={`task-status status-${task.status}`}>
              {task.status}
            </span>
            <span style={{ fontSize: "0.85rem", color: "var(--text-3)", textTransform: "capitalize" }}>
              • {task.priority} Priority
            </span>
            <span style={{ fontSize: "0.85rem", color: "var(--text-3)" }}>
              • ID: <code style={{ backgroundColor: "var(--bg)", padding: "0.1rem 0.3rem", borderRadius: "0.2rem" }}>{task.id.slice(0,8)}</code>
            </span>
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--text-3)" }}>
          ×
        </button>
      </div>

      {task.status === "pending" && canApprove && (
        <div style={{ marginBottom: "1.5rem", padding: "1rem", backgroundColor: "rgba(230, 162, 60, 0.1)", border: "1px solid rgba(230, 162, 60, 0.3)", borderRadius: "0.5rem" }}>
          <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--text)" }}>Approval Required</h4>
          <p style={{ margin: "0 0 1rem 0", fontSize: "0.9rem", color: "var(--text-3)" }}>
            This task is waiting for an administrator or approver to review and approve its budget and execution parameters.
          </p>
          <button className="btn btn-primary" onClick={() => onApprove(task.id)}>
            Approve Task
          </button>
        </div>
      )}

      <div style={{ marginBottom: "1.5rem" }}>
        <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--text-3)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Description</h4>
          <div style={{ backgroundColor: "var(--bg)", padding: "1rem", borderRadius: "0.25rem", border: "1px solid var(--border)", whiteSpace: "pre-wrap", fontSize: "0.95rem", lineHeight: 1.5 }}>
          {task.description || "No description provided."}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
        <div>
          <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--text-3)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Details</h4>
          <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <dt style={{ color: "var(--text-3)" }}>Execution Mode</dt>
              <dd style={{ margin: 0, fontWeight: 500, textTransform: "capitalize" }}>{task.executionMode || "Deterministic"}</dd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <dt style={{ color: "var(--text-3)" }}>Budget Cap</dt>
              <dd style={{ margin: 0, fontWeight: 500 }}>${((task.budgetCapUsd || 100) / 100).toFixed(2)}</dd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <dt style={{ color: "var(--text-3)" }}>Actual Cost</dt>
              <dd style={{ margin: 0, fontWeight: 500 }}>${((task.budgetActualUsd || 0) / 100).toFixed(2)}</dd>
            </div>
          </dl>
        </div>

        <div>
          <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--text-3)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Timestamps</h4>
          <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <dt style={{ color: "var(--text-3)" }}>Created</dt>
              <dd style={{ margin: 0 }}>{new Date(task.createdAt).toLocaleString()}</dd>
            </div>
            {task.approvedAt && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <dt style={{ color: "var(--text-3)" }}>Approved</dt>
                <dd style={{ margin: 0 }}>{new Date(task.approvedAt).toLocaleString()}</dd>
              </div>
            )}
            {task.completedAt && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <dt style={{ color: "var(--text-3)" }}>Completed</dt>
                <dd style={{ margin: 0 }}>{new Date(task.completedAt).toLocaleString()}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {task.tags && task.tags.length > 0 && (
        <div>
          <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--text-3)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Tags</h4>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {task.tags.map(tag => (
              <span key={tag} style={{ backgroundColor: "var(--bg)", padding: "0.25rem 0.5rem", borderRadius: "1rem", fontSize: "0.8rem", border: "1px solid var(--border)" }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
