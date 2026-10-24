-- Work boards: several saved views over the same work cards. A project with
-- no rows uses the implicit default board grouped by card stage. Nothing is
-- seeded. config_json is opaque JSON the UI owns.
-- change_ops is rebuilt so its entity check accepts 'board' (SQLite cannot
-- alter a CHECK constraint). node_id, added in 0023, is copied across.

CREATE TABLE IF NOT EXISTS work_boards (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, name)
);
CREATE INDEX IF NOT EXISTS idx_work_boards_project ON work_boards(project_id, position);

CREATE TABLE change_ops_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_run_id TEXT NOT NULL DEFAULT '',
  batch_id TEXT NOT NULL,
  entity TEXT NOT NULL CHECK (entity IN ('card', 'task', 'question', 'invariant', 'handoff', 'claim', 'node', 'decision', 'board')),
  entity_id TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('create', 'update', 'remove')),
  data_json TEXT NOT NULL DEFAULT '{}',
  node_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
INSERT INTO change_ops_new(id, project_id, agent_run_id, batch_id, entity, entity_id, op, data_json, node_id, created_at)
  SELECT id, project_id, agent_run_id, batch_id, entity, entity_id, op, data_json, node_id, created_at FROM change_ops;
DROP TABLE change_ops;
ALTER TABLE change_ops_new RENAME TO change_ops;
CREATE INDEX IF NOT EXISTS idx_change_ops_project ON change_ops(project_id, id);
CREATE INDEX IF NOT EXISTS idx_change_ops_batch ON change_ops(batch_id);
CREATE INDEX IF NOT EXISTS idx_change_ops_entity ON change_ops(entity_id);
