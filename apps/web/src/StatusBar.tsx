import { useEffect, useState } from "react";

type ConnectionStatus = "connected" | "disconnected" | "connecting";

interface StatusBarProps {
  apiBase: string;
  lastUpdated: string | null;
  onReconnect?: () => void;
}

function formatLastUpdate(timestamp: string | null): string {
  if (!timestamp) return "Never";
  const seconds = Math.round((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 5) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

export function StatusBar({ apiBase, lastUpdated, onReconnect }: StatusBarProps) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [, forceUpdate] = useState({});

  useEffect(() => {
    if (!lastUpdated) {
      setConnectionStatus("connecting");
      return;
    }
    
    const seconds = Math.round((Date.now() - new Date(lastUpdated).getTime()) / 1000);
    if (seconds < 10) {
      setConnectionStatus("connected");
    } else if (seconds < 60) {
      setConnectionStatus("connecting");
    } else {
      setConnectionStatus("disconnected");
    }

    const timer = setInterval(() => {
      forceUpdate({});
    }, 1000);

    return () => clearInterval(timer);
  }, [lastUpdated]);

  const statusColors = {
    connected: "#1d6f55",
    connecting: "#9b6a24",
    disconnected: "#ab4837"
  };

  const statusLabels = {
    connected: "Live",
    connecting: "Updating...",
    disconnected: "Offline"
  };

  return (
    <div className="status-bar">
      <div className="status-bar-content">
        <div className="status-indicator">
          <span 
            className="status-dot"
            style={{ backgroundColor: statusColors[connectionStatus] }}
          />
          <span className="status-label">{statusLabels[connectionStatus]}</span>
        </div>
        
        <div className="status-info">
          <span className="status-endpoint">{apiBase}</span>
          <span className="status-separator">•</span>
          <span className="status-time">Updated {formatLastUpdate(lastUpdated)}</span>
        </div>

        {connectionStatus === "disconnected" && onReconnect && (
          <button 
            className="status-reconnect"
            onClick={onReconnect}
          >
            Reconnect
          </button>
        )}
      </div>
    </div>
  );
}
