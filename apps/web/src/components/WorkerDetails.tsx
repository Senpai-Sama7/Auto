import React from "react";

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

type WorkerDetailsProps = {
  worker: Worker;
  onClose: () => void;
};

export function WorkerDetails({ worker, onClose }: WorkerDetailsProps) {
  const budgetPercent = worker.monthlyBudgetUsd > 0 
    ? (worker.spentBudgetUsd / worker.monthlyBudgetUsd) * 100 
    : 0;

  return (
    <div className="task-details-pane" style={{
      backgroundColor: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "0.5rem",
      padding: "1.5rem",
      display: "flex",
      flexDirection: "column",
      gap: "1.5rem",
      height: "100%",
      overflowY: "auto",
      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: "0 0 0.5rem 0", fontSize: "1.5rem", color: "var(--text)" }}>
            {worker.name}
          </h2>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span className={`status-badge ${worker.status === 'idle' ? 'status-idle' : worker.status === 'busy' ? 'status-busy' : 'status-offline'}`}>
              {worker.status.toUpperCase()}
            </span>
            <span style={{ fontSize: "0.85rem", color: "var(--text-3)", fontFamily: "monospace" }}>
              {worker.id}
            </span>
          </div>
        </div>
        <button 
          onClick={onClose}
          style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--text-3)" }}
        >
          ×
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", backgroundColor: "var(--surface-raised)", padding: "1rem", borderRadius: "0.5rem" }}>
        <div>
          <label style={{ fontSize: "0.75rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Role</label>
          <div style={{ fontWeight: 500 }}>{worker.role}</div>
        </div>
        <div>
          <label style={{ fontSize: "0.75rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Adapter</label>
          <div style={{ fontWeight: 500 }}>{worker.adapter}</div>
        </div>
        <div>
          <label style={{ fontSize: "0.75rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Last Heartbeat</label>
          <div style={{ fontWeight: 500 }}>{worker.lastHeartbeatAt ? new Date(worker.lastHeartbeatAt).toLocaleString() : "Never"}</div>
        </div>
        <div>
          <label style={{ fontSize: "0.75rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Current Task</label>
          <div style={{ fontWeight: 500, fontFamily: worker.currentTaskId ? "monospace" : "inherit" }}>
            {worker.currentTaskId || "None"}
          </div>
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: "1rem", margin: "0 0 1rem 0", color: "var(--text)" }}>Budget Usage</h3>
        <div style={{ marginBottom: "0.5rem", display: "flex", justifyContent: "space-between", fontSize: "0.9rem" }}>
          <span>${worker.spentBudgetUsd.toFixed(2)}</span>
          <span style={{ color: "var(--text-3)" }}>of ${worker.monthlyBudgetUsd.toFixed(2)}</span>
        </div>
        <div style={{ width: "100%", height: "8px", backgroundColor: "var(--border)", borderRadius: "4px", overflow: "hidden" }}>
          <div style={{ 
            height: "100%", 
            backgroundColor: budgetPercent > 90 ? "var(--danger)" : budgetPercent > 75 ? "var(--warn)" : "var(--accent)", 
            width: `${Math.min(budgetPercent, 100)}%`,
            transition: "width 0.3s ease"
          }} />
        </div>
      </div>

      {worker.capabilities.length > 0 && (
        <div>
          <h3 style={{ fontSize: "1rem", margin: "0 0 1rem 0", color: "var(--text)" }}>Capabilities</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {worker.capabilities.map(cap => (
              <span key={cap} style={{ 
                padding: "0.25rem 0.5rem", 
                backgroundColor: "rgba(13, 148, 136, 0.1)", 
                color: "var(--accent)", 
                borderRadius: "0.25rem", 
                fontSize: "0.85rem" 
              }}>
                {cap}
              </span>
            ))}
          </div>
        </div>
      )}

      {worker.executionModes.length > 0 && (
        <div>
          <h3 style={{ fontSize: "1rem", margin: "0 0 1rem 0", color: "var(--text)" }}>Execution Modes</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {worker.executionModes.map(mode => (
              <span key={mode} style={{ 
                padding: "0.25rem 0.5rem", 
                backgroundColor: "var(--border)", 
                color: "var(--text)", 
                borderRadius: "0.25rem", 
                fontSize: "0.85rem" 
              }}>
                {mode}
              </span>
            ))}
          </div>
        </div>
      )}

      {worker.lastSummary && (
        <div>
          <h3 style={{ fontSize: "1rem", margin: "0 0 0.5rem 0", color: "var(--text)" }}>Last Summary</h3>
          <p style={{ 
            fontSize: "0.9rem", 
            color: "var(--text-3)", 
            lineHeight: 1.5, 
            backgroundColor: "var(--surface-raised)",
            padding: "1rem",
            borderRadius: "0.5rem",
            margin: 0
          }}>
            {worker.lastSummary}
          </p>
        </div>
      )}
    </div>
  );
}
