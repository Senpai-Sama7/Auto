import { useState, useEffect, useCallback } from "react";

const FETCH_TIMEOUT_MS = 30000;

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

type RevenueStats = {
  isRunning: boolean;
  dailyTaskCount: number;
  maxDailyTasks: number;
  enabledStreams: string[];
  lastResetDate: string;
};

type RevenuePanelProps = {
  apiBase: string;
};

export function RevenuePanel({ apiBase }: RevenuePanelProps) {
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${apiBase}/api/revenue/status`, {
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to load status");
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [apiBase, loadStatus]);

  const startOrchestrator = async () => {
    setActionLoading(true);
    try {
      const res = await fetchWithTimeout(`${apiBase}/api/revenue/start`, {
        method: "POST",
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to start");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
    } finally {
      setActionLoading(false);
    }
  };

  const stopOrchestrator = async () => {
    setActionLoading(true);
    try {
      const res = await fetchWithTimeout(`${apiBase}/api/revenue/stop`, {
        method: "POST",
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to stop");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="revenue-panel-loading">
        <div className="revenue-spinner" />
        <span>Loading revenue orchestrator...</span>
      </div>
    );
  }

  return (
    <div className="revenue-panel">
      <div className="revenue-header">
        <h3 className="revenue-title">
          <span className={`revenue-status-dot ${stats?.isRunning ? "active" : ""}`} />
          Revenue Orchestrator
        </h3>
        <div className="revenue-actions">
          {stats?.isRunning ? (
            <button 
              className="btn btn-secondary" 
              onClick={stopOrchestrator}
              disabled={actionLoading}
            >
              {actionLoading ? "Stopping..." : "Stop"}
            </button>
          ) : (
            <button 
              className="btn btn-primary" 
              onClick={startOrchestrator}
              disabled={actionLoading}
            >
              {actionLoading ? "Starting..." : "Start Autonomous Mode"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="revenue-error">
          {error}
        </div>
      )}

      {stats && (
        <div className="revenue-stats">
          <div className="revenue-stat-card">
            <span className="revenue-stat-label">Status</span>
            <span className={`revenue-stat-value ${stats.isRunning ? "success" : ""}`}>
              {stats.isRunning ? "Running" : "Stopped"}
            </span>
          </div>
          
          <div className="revenue-stat-card">
            <span className="revenue-stat-label">Daily Tasks</span>
            <span className="revenue-stat-value">
              {stats.dailyTaskCount} / {stats.maxDailyTasks}
            </span>
            <div className="revenue-progress-bar">
              <div 
                className="revenue-progress-fill" 
                style={{ width: `${stats.maxDailyTasks > 0 ? (stats.dailyTaskCount / stats.maxDailyTasks) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="revenue-stat-card">
            <span className="revenue-stat-label">Active Streams</span>
            <span className="revenue-stat-value">{stats.enabledStreams.length}</span>
            <div className="revenue-streams">
              {stats.enabledStreams.map(stream => (
                <span key={stream} className="revenue-stream-tag">
                  {stream.replace(/-/g, " ")}
                </span>
              ))}
            </div>
          </div>

          <div className="revenue-stat-card">
            <span className="revenue-stat-label">Last Reset</span>
            <span className="revenue-stat-value">
              {new Date(stats.lastResetDate).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}

      <div className="revenue-info">
        <h4>How it works</h4>
        <ul>
          <li>Continuously scans for business opportunities via Brave Search, HubSpot, and ClearDesk</li>
          <li>Automatically creates tasks for qualified leads (confidence &gt; 60%)</li>
          <li>Dispatches to workers with appropriate capabilities</li>
          <li>Tracks budget and estimated value for ROI monitoring</li>
          <li>Sends Slack alerts for high-value opportunities (&gt;$1000)</li>
        </ul>
        
        <h4>Revenue Streams</h4>
        <ul>
          <li><strong>Lead Generation:</strong> Searches for companies hiring for AI/automation</li>
          <li><strong>Document Processing:</strong> ClearDesk invoice/contract OCR jobs</li>
          <li><strong>Market Research:</strong> Trend analysis and competitive intelligence</li>
          <li><strong>Sales Outreach:</strong> HubSpot contact follow-ups</li>
        </ul>
      </div>
    </div>
  );
}
