-- Delegated coding runs, events, worktrees, quota snapshots, tier table, and probed agents.

CREATE TABLE IF NOT EXISTS dispatch_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  tier TEXT NOT NULL DEFAULT '',
  requested_tier TEXT NOT NULL DEFAULT '',
  execution_tier TEXT NOT NULL DEFAULT '',
  agent TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  effort TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  dir TEXT NOT NULL DEFAULT '',
  repo TEXT NOT NULL DEFAULT '',
  worktree TEXT NOT NULL DEFAULT '',
  branch TEXT NOT NULL DEFAULT '',
  base_sha TEXT NOT NULL DEFAULT '',
  read_only INTEGER NOT NULL DEFAULT 0,
  no_worktree INTEGER NOT NULL DEFAULT 0,
  no_verify INTEGER NOT NULL DEFAULT 0,
  agent_run_id TEXT NOT NULL DEFAULT '',
  card_slug TEXT NOT NULL DEFAULT '',
  output TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  exit_code INTEGER NOT NULL DEFAULT 0,
  exit_class TEXT NOT NULL DEFAULT '',
  verification TEXT NOT NULL DEFAULT '',
  verify_json TEXT NOT NULL DEFAULT '',
  timeout_sec INTEGER NOT NULL DEFAULT 0,
  session_id TEXT NOT NULL DEFAULT '',
  resumed_of TEXT NOT NULL DEFAULT '',
  pid INTEGER NOT NULL DEFAULT 0,
  agent_pid INTEGER NOT NULL DEFAULT 0,
  proc_start TEXT NOT NULL DEFAULT '',
  profile TEXT NOT NULL DEFAULT '',
  prefer_json TEXT NOT NULL DEFAULT '[]',
  avoid_json TEXT NOT NULL DEFAULT '[]',
  requested_json TEXT NOT NULL DEFAULT '',
  resolved_json TEXT NOT NULL DEFAULT '',
  attempts_json TEXT NOT NULL DEFAULT '[]',
  feature_schema INTEGER NOT NULL DEFAULT 0,
  classify_features_json TEXT NOT NULL DEFAULT '[]',
  files_changed INTEGER,
  insertions INTEGER,
  deletions INTEGER,
  queued_ms INTEGER,
  run_ms INTEGER,
  verify_ms INTEGER,
  created_at TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT '',
  finished_at TEXT NOT NULL DEFAULT '',
  merged_at TEXT,
  merge_sha TEXT NOT NULL DEFAULT '',
  merge_check TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_dispatch_runs_project_created
  ON dispatch_runs(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dispatch_run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES dispatch_runs(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  agent TEXT NOT NULL DEFAULT '',
  tier TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  seq INTEGER NOT NULL,
  at TEXT NOT NULL,
  UNIQUE (run_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_dispatch_run_events_run_seq
  ON dispatch_run_events(run_id, seq ASC);
CREATE INDEX IF NOT EXISTS idx_dispatch_run_events_project_at
  ON dispatch_run_events(project_id, at DESC);

CREATE TABLE IF NOT EXISTS dispatch_worktrees (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL DEFAULT '',
  card_slug TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  branch TEXT NOT NULL DEFAULT '',
  base_sha TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  owner TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_dispatch_worktrees_project
  ON dispatch_worktrees(project_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_worktrees_run
  ON dispatch_worktrees(run_id);

CREATE TABLE IF NOT EXISTS dispatch_quota_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  window TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  confidence TEXT NOT NULL DEFAULT '',
  used_percent REAL,
  window_minutes INTEGER NOT NULL DEFAULT 0,
  resets_at TEXT NOT NULL DEFAULT '',
  sampled_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dispatch_quota_snapshots_agent_sampled
  ON dispatch_quota_snapshots(agent, sampled_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_quota_snapshots_sampled
  ON dispatch_quota_snapshots(sampled_at DESC);

CREATE TABLE IF NOT EXISTS dispatch_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  agent TEXT NOT NULL,
  model TEXT NOT NULL,
  speed INTEGER NOT NULL DEFAULT 0,
  strength INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_dispatch_tiers_name_position
  ON dispatch_tiers(name, position ASC);

CREATE TABLE IF NOT EXISTS dispatch_agents (
  name TEXT PRIMARY KEY,
  bin TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  quota_source TEXT NOT NULL DEFAULT '',
  confidence TEXT NOT NULL DEFAULT '',
  risk TEXT NOT NULL DEFAULT '',
  used_percent REAL,
  cooldown_until TEXT
);
