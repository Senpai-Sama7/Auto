import { WorkerDetails } from "./WorkerDetails.js";

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

type WorkersProps = {
  workers: Worker[];
  selectedWorkerId: string | null;
  onSelectWorker: (id: string | null) => void;
};

const statusColors: Record<string, string> = {
  idle: "status-idle",
  busy: "status-busy",
  offline: "status-offline",
  errored: "status-failed"
};

export function Workers({ workers, selectedWorkerId, onSelectWorker }: WorkersProps) {
  const stats = {
    total: workers.length,
    idle: workers.filter(w => w.status === "idle").length,
    busy: workers.filter(w => w.status === "busy").length,
    offline: workers.filter(w => w.status === "offline").length
  };

  return (
    <div className="section-workers">
      <div className="dashboard-header">
        <div>
          <p className="section-label">Network</p>
          <h1 className="section-title">Workers</h1>
        </div>
        <div style={{ display: "flex", gap: "var(--sp-3)" }}>
          <span className="pill" style={{ background: "var(--success-bg)", color: "var(--success)", border: "1px solid rgba(74,222,128,0.2)" }}>
            {stats.idle} idle
          </span>
          <span className="pill" style={{ background: "var(--accent-bg)", color: "var(--accent-bright)", border: "1px solid var(--accent-bg)" }}>
            {stats.busy} busy
          </span>
          <span className="pill" style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid rgba(248,113,113,0.2)" }}>
            {stats.offline} offline
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: "var(--sp-4)", height: "calc(100vh - 250px)", marginTop: "var(--sp-4)" }}>
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto", paddingRight: "var(--sp-2)" }}>
          {workers.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "var(--sp-10)" }}>
              <p style={{ color: "var(--text-3)", fontSize: "0.9rem" }}>No workers detected in the network.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--sp-3)" }}>
              {workers.map(worker => (
                <div
                  key={worker.id}
                  className={`card ${selectedWorkerId === worker.id ? "selected" : ""}`}
                  style={{
                    cursor: "pointer",
                    borderColor: selectedWorkerId === worker.id ? "var(--accent)" : undefined,
                    padding: "var(--sp-4)"
                  }}
                  onClick={() => onSelectWorker(worker.id)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--sp-3)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                      <span style={{
                        fontSize: "0.8rem",
                        color: worker.status === "busy" ? "var(--accent)" : worker.status === "idle" ? "var(--success)" : "var(--text-3)"
                      }}>
                        {worker.status === "busy" ? "◉" : worker.status === "idle" ? "●" : "○"}
                      </span>
                      <h3 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600, color: "var(--text)" }}>{worker.name}</h3>
                    </div>
                    <span className={`tag ${statusColors[worker.status] || ""}`}>
                      {worker.status}
                    </span>
                  </div>

                  <div style={{ display: "grid", gap: "var(--sp-2)", marginBottom: "var(--sp-3)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                      <span style={{ color: "var(--text-3)" }}>Adapter</span>
                      <span style={{ color: "var(--text-2)" }}>{worker.adapter}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                      <span style={{ color: "var(--text-3)" }}>Quota</span>
                      <span style={{ color: "var(--accent-bright)" }}>
                        ${worker.spentBudgetUsd.toFixed(2)} / ${worker.monthlyBudgetUsd.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {worker.capabilities.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-1)" }}>
                      {worker.capabilities.slice(0, 3).map(cap => (
                        <span key={cap} className="tag" style={{ fontSize: "0.65rem" }}>{cap}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedWorkerId && (
          <div style={{ width: "400px", flexShrink: 0 }}>
            <div className="card" style={{ height: "100%", overflowY: "auto" }}>
              {workers.find(w => w.id === selectedWorkerId) && (
                <WorkerDetails
                  worker={workers.find(w => w.id === selectedWorkerId)!}
                  onClose={() => onSelectWorker(null)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
