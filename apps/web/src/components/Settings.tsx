type ComponentToggle = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  critical?: boolean;
};

import { RevenuePanel } from "./RevenuePanel.js";

type SettingsProps = {
  components: ComponentToggle[];
  onToggleComponent: (id: string, enabled: boolean) => void;
  onToggleAll: (enabled: boolean) => void;
  apiBase: string;
  onApiBaseChange: (url: string) => void;
  user: { name: string; email: string; role: string } | null;
  passkeys: Array<{ id: string; label: string | null; createdAt: string }>;
  onAddPasskey: () => void;
  onDeletePasskey: (id: string) => void;
};

export function Settings({
  components,
  onToggleComponent,
  onToggleAll,
  apiBase,
  onApiBaseChange,
  user,
  passkeys,
  onAddPasskey,
  onDeletePasskey
}: SettingsProps) {
  const allEnabled = components.every(c => c.enabled);

  return (
    <div className="section-settings">
      <div className="dashboard-header">
        <div>
          <p className="section-label">System</p>
          <h1 className="section-title">Settings</h1>
        </div>
      </div>

      {/* Components */}
      <div className="settings-card">
        <div className="settings-card-header">
          <span>System Components</span>
          <button
            className={`btn btn-small ${allEnabled ? "btn-ghost" : "btn-ghost"}`}
            style={{ fontSize: "0.75rem" }}
            onClick={() => onToggleAll(!allEnabled)}
          >
            {allEnabled ? "Stop All" : "Start All"}
          </button>
        </div>
        <div className="settings-card-body">
          {components.map(component => (
            <div key={component.id} className="settings-row">
              <div className="settings-row-label">
                <p className="settings-row-title">
                  {component.name}
                  {component.critical && (
                    <span className="pill" style={{ marginLeft: "var(--sp-2)", fontSize: "0.6rem", background: "var(--danger-bg)", color: "var(--danger)" }}>CRITICAL</span>
                  )}
                </p>
                <p className="settings-row-desc">{component.description}</p>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={component.enabled}
                  onChange={(e) => onToggleComponent(component.id, e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Account */}
      {user && (
        <div className="settings-card">
          <div className="settings-card-header">Account</div>
          <div className="settings-card-body">
            <div className="settings-row">
              <div className="settings-row-label">
                <p className="settings-row-title">Name</p>
                <p className="settings-row-desc">{user.name}</p>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row-label">
                <p className="settings-row-title">Email</p>
                <p className="settings-row-desc">{user.email}</p>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row-label">
                <p className="settings-row-title">Role</p>
                <p className="settings-row-desc">{user.role}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Passkeys */}
      <div className="settings-card">
        <div className="settings-card-header">
          <span>Passkeys</span>
          <button className="btn btn-small btn-secondary" onClick={onAddPasskey}>
            + Add
          </button>
        </div>
        <div className="settings-card-body">
          {passkeys.length === 0 ? (
            <div style={{ padding: "var(--sp-4)", textAlign: "center", color: "var(--text-3)", fontSize: "0.875rem" }}>
              No passkeys registered
            </div>
          ) : (
            <div className="passkey-list">
              {passkeys.map(passkey => (
                <div key={passkey.id} className="passkey-item">
                  <div>
                    <p className="passkey-name">{passkey.label || "Security Key"}</p>
                    <p className="passkey-id">Added {new Date(passkey.createdAt).toLocaleDateString()}</p>
                  </div>
                  <button className="btn btn-small btn-ghost" onClick={() => onDeletePasskey(passkey.id)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Connection */}
      <div className="settings-card">
        <div className="settings-card-header">Connection</div>
        <div className="settings-card-body">
          <div className="settings-row">
            <div className="settings-row-label">
              <p className="settings-row-title">API Endpoint</p>
              <input
                type="text"
                value={apiBase}
                onChange={(e) => onApiBaseChange(e.target.value)}
                placeholder="http://localhost:4100"
                style={{
                  width: "100%",
                  marginTop: "var(--sp-2)",
                  padding: "var(--sp-2) var(--sp-3)",
                  background: "var(--surface-raised)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-md)",
                  color: "var(--text)",
                  fontSize: "0.875rem",
                  fontFamily: "var(--mono)",
                  outline: "none"
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Revenue Orchestrator */}
      <RevenuePanel apiBase={apiBase} />
    </div>
  );
}
