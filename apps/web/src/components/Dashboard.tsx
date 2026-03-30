import { SpendChart, SystemHealthRing, TaskDistributionChart } from "./Visualizations.js";

type DashboardProps = {
  workspaceName: string;
  mission: string;
  stats: {
    monthlySpend: number;
    budget: number;
    waitingApproval: number;
    inProgress: number;
    released: number;
    totalWorkers: number;
    busyWorkers: number;
  };
  openclawStatus: "connected" | "disconnected" | "loading";
  toolsCount: number;
  skillsCount: number;
  onCreateTask: () => void;
};

export function Dashboard({
  workspaceName,
  mission,
  stats,
  openclawStatus,
  toolsCount,
  skillsCount,
  onCreateTask
}: DashboardProps) {
  const budgetPercent = Math.min(100, Math.round((stats.monthlySpend / stats.budget) * 100));
  const totalTasks = stats.waitingApproval + stats.inProgress + stats.released;

  return (
    <div className="section-dashboard">
      <div className="dashboard-header">
        <div>
          <p className="section-label">Workspace Overview</p>
          <h1 className="section-title">{workspaceName}</h1>
        </div>
        <button className="btn btn-primary" onClick={onCreateTask}>
          + New Task
        </button>
      </div>

      <div className="stats-grid" style={{ marginBottom: "var(--sp-4)" }}>
        <div className="stat-card">
          <p className="stat-label">Monthly Spend</p>
          <p className="stat-value">
            ${stats.monthlySpend.toLocaleString()}
            <span style={{ fontSize: "1rem", color: "var(--text-3)", fontWeight: 400 }}>
              {" "}/ ${stats.budget.toLocaleString()}
            </span>
          </p>
          <div className="stat-bar-wrap">
            <div className="stat-bar-track">
              <div className="stat-bar-fill" style={{ width: `${budgetPercent}%` }} />
            </div>
          </div>
          <p className="stat-sub">{budgetPercent}% of budget used</p>
        </div>

        <div className="stat-card">
          <p className="stat-label">Total Tasks</p>
          <p className="stat-value stat-highlight">{totalTasks}</p>
          <div className="stat-bar-wrap">
            <div style={{ display: "flex", gap: "var(--sp-2)", marginTop: "var(--sp-3)", flexWrap: "wrap" }}>
              {stats.waitingApproval > 0 && (
                <span className="tag">
                  <span className="tag-dot" style={{ background: "var(--warn)" }} />
                  {stats.waitingApproval} pending
                </span>
              )}
              {stats.inProgress > 0 && (
                <span className="tag">
                  <span className="tag-dot" style={{ background: "var(--accent-2)" }} />
                  {stats.inProgress} running
                </span>
              )}
              {stats.released > 0 && (
                <span className="tag tag-connected">
                  <span className="tag-dot" />
                  {stats.released} done
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <p className="stat-label">Worker Health</p>
          <p className="stat-value" style={{ fontSize: "1.75rem" }}>
            {stats.totalWorkers}
            <span style={{ fontSize: "0.8rem", color: "var(--text-3)", fontWeight: 400 }}>
              {" "}nodes
            </span>
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginTop: "var(--sp-3)" }}>
            <SystemHealthRing busy={stats.busyWorkers} total={stats.totalWorkers} />
            <div>
              <p className="stat-sub" style={{ marginTop: 0 }}>{stats.busyWorkers} active</p>
              <p className="stat-sub">{stats.totalWorkers - stats.busyWorkers} idle</p>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid grid-2">
        <div className="card">
          <h3 className="card-label">
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
            System Protocol
          </h3>
          <p className="card-text">{mission}</p>
          <div className="card-tags">
            <span className="tag tag-accent">Ultimate Orchestrator</span>
            <span className="tag tag-connected">
              <span className="tag-dot" />
              Live
            </span>
          </div>
        </div>

        <div className="card">
          <h3 className="card-label" style={{ color: "var(--accent-2)" }}>
            Intelligence Matrix
          </h3>
          <p className="card-text">
            Deployed <strong>{toolsCount}</strong> tools and <strong>{skillsCount}</strong> skills.
          </p>
          <div className="card-tags">
            <span className={`tag ${openclawStatus === "connected" ? "tag-connected" : ""}`}>
              {openclawStatus === "connected" ? (
                <><span className="tag-dot" />Synced</>
              ) : openclawStatus === "loading" ? (
                "Linking..."
              ) : (
                "Offline"
              )}
            </span>
            <span className="tag">Secure Node</span>
          </div>
        </div>
      </div>
    </div>
  );
}
