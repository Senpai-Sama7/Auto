export const schemaSql = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mission TEXT NOT NULL,
  monthly_budget_usd REAL NOT NULL,
  spent_budget_usd REAL NOT NULL,
  last_budget_reset_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  adapter TEXT NOT NULL,
  status TEXT NOT NULL,
  current_task_id TEXT,
  capabilities_json TEXT NOT NULL,
  execution_modes_json TEXT NOT NULL,
  monthly_budget_usd REAL NOT NULL,
  spent_budget_usd REAL NOT NULL,
  last_budget_reset_at TEXT,
  last_heartbeat_at TEXT,
  last_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  auth_method TEXT NOT NULL DEFAULT 'password',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS passkey_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  webauthn_user_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL,
  device_type TEXT NOT NULL,
  backed_up INTEGER NOT NULL,
  transports_json TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user_id
  ON passkey_credentials (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_passkey_credentials_webauthn_user_id
  ON passkey_credentials (webauthn_user_id, id);

CREATE TABLE IF NOT EXISTS passkey_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  flow_type TEXT NOT NULL,
  challenge TEXT NOT NULL,
  context_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_passkey_challenges_expires_at
  ON passkey_challenges (expires_at);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  skill_hint TEXT,
  required_capabilities_json TEXT NOT NULL,
  execution_mode TEXT NOT NULL,
  status TEXT NOT NULL,
  approval_state TEXT NOT NULL,
  approval_reason TEXT,
  approved_by TEXT,
  approved_at TEXT,
  route TEXT NOT NULL,
  assigned_worker_id TEXT,
  budget_cap_usd REAL NOT NULL,
  budget_estimate_usd REAL NOT NULL,
  budget_actual_usd REAL NOT NULL,
  idempotency_key TEXT,
  retry_count INTEGER NOT NULL,
  max_retries INTEGER NOT NULL,
  last_error TEXT,
  result_summary TEXT,
  artifacts_json TEXT,
  integration_refs_json TEXT,
  release_decision_json TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_idempotency_key
  ON tasks (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS gates (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  gate_type TEXT NOT NULL,
  status TEXT NOT NULL,
  required INTEGER NOT NULL,
  evidence_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gates_task_id ON gates (task_id);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  worker_id TEXT,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_created_at ON events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_task_id ON events (task_id);

CREATE TABLE IF NOT EXISTS memory_entries (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL,
  task_id TEXT,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_worker_id ON memory_entries (worker_id, created_at DESC);

-- Full-text search virtual table for memory entries
CREATE VIRTUAL TABLE IF NOT EXISTS memory_entries_fts USING fts5(
  id UNINDEXED,
  worker_id UNINDEXED,
  task_id UNINDEXED,
  category UNINDEXED,
  content,
  created_at UNINDEXED,
  content='memory_entries',
  content_rowid='rowid'
);

-- Triggers to keep FTS table in sync with memory_entries
CREATE TRIGGER IF NOT EXISTS memory_entries_ai AFTER INSERT ON memory_entries BEGIN
  INSERT INTO memory_entries_fts(rowid, id, worker_id, task_id, category, content, created_at)
  VALUES (new.rowid, new.id, new.worker_id, new.task_id, new.category, new.content, new.created_at);
END;

CREATE TRIGGER IF NOT EXISTS memory_entries_ad AFTER DELETE ON memory_entries BEGIN
  INSERT INTO memory_entries_fts(memory_entries_fts, rowid, id, worker_id, task_id, category, content, created_at)
  VALUES ('delete', old.rowid, old.id, old.worker_id, old.task_id, old.category, old.content, old.created_at);
END;

CREATE TRIGGER IF NOT EXISTS memory_entries_au AFTER UPDATE ON memory_entries BEGIN
  INSERT INTO memory_entries_fts(memory_entries_fts, rowid, id, worker_id, task_id, category, content, created_at)
  VALUES ('delete', old.rowid, old.id, old.worker_id, old.task_id, old.category, old.content, old.created_at);
  INSERT INTO memory_entries_fts(rowid, id, worker_id, task_id, category, content, created_at)
  VALUES (new.rowid, new.id, new.worker_id, new.task_id, new.category, new.content, new.created_at);
END;

CREATE TABLE IF NOT EXISTS worker_sessions (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  recall_summary TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_worker_sessions_worker_id ON worker_sessions (worker_id, started_at DESC);

CREATE TABLE IF NOT EXISTS task_executions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  adapter TEXT NOT NULL,
  execution_mode TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  response TEXT NOT NULL,
  summary TEXT NOT NULL,
  tool_calls_json TEXT NOT NULL,
  usage_json TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_executions_task_id ON task_executions (task_id, created_at DESC);
`;
