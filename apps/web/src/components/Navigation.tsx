

type TabId = "dashboard" | "tasks" | "workers" | "settings";

type Tab = {
  id: TabId;
  label: string;
  icon: string;
  requiresAuth?: boolean;
};

const tabs: Tab[] = [
  { id: "dashboard", label: "Dashboard", icon: "◈", requiresAuth: true },
  { id: "tasks", label: "Tasks", icon: "☰", requiresAuth: true },
  { id: "workers", label: "Workers", icon: "⬡", requiresAuth: true },
  { id: "settings", label: "Settings", icon: "⚙" }
];

type NavigationProps = {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  authenticated: boolean;
  user: { name: string; email: string; role: string } | null;
  onSignOut: () => void;
};

export function Navigation({ activeTab, onTabChange, authenticated, user, onSignOut }: NavigationProps) {
  const visibleTabs = tabs.filter(tab => !tab.requiresAuth || authenticated);

  return (
    <nav className="nav-container">
      <div className="nav-brand">
        <span className="nav-logo">◈</span>
        <span className="nav-title">Ultimate System</span>
      </div>

      <div className="nav-tabs">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            className={`nav-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span className="nav-tab-icon">{tab.icon}</span>
            <span className="nav-tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="nav-user">
        {authenticated && user ? (
          <>
            <div className="nav-user-info">
              <span className="nav-user-name">{user.name}</span>
              <span className="nav-user-role">{user.role}</span>
            </div>
            <button className="nav-signout" onClick={onSignOut}>
              Sign out
            </button>
          </>
        ) : (
          <span className="nav-guest">Guest</span>
        )}
      </div>
    </nav>
  );
}

export type { TabId };