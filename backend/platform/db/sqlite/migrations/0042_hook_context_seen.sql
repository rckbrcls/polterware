-- The context hook hands an agent the brief of the Structure node a file
-- belongs to once per session. The core is a daemon that exits when idle, so
-- what each session already received is stored here, keyed by node, with the
-- brief's hash: a changed brief is sent again. Rows older than a week go.
CREATE TABLE hook_context_seen (
  session_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  brief_hash TEXT NOT NULL,
  seen_at TEXT NOT NULL,
  PRIMARY KEY (session_id, project_id, node_id)
);

CREATE INDEX idx_hook_context_seen_at ON hook_context_seen(seen_at);
