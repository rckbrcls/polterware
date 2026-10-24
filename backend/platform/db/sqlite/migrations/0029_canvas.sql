-- Canvas surfaces: one typed property graph per canvas, plus a layout that
-- is stored beside it and is not part of the graph.
-- change_ops is rebuilt so its entity check accepts 'canvas'.
-- node_id (added in 0023) is copied through; SQLite cannot alter a CHECK.

CREATE TABLE IF NOT EXISTS canvases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('free', 'architecture', 'roadmap', 'flow', 'brainstorm', 'ideas')),
  agent_visible INTEGER NOT NULL DEFAULT 0 CHECK (agent_visible IN (0, 1)),
  graph_json TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  layout_json TEXT NOT NULL DEFAULT '{}',
  scope_node_id TEXT REFERENCES atlas_nodes(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_canvases_project ON canvases(project_id, name);
CREATE INDEX IF NOT EXISTS idx_canvases_project_updated ON canvases(project_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_canvases_scope ON canvases(project_id, scope_node_id);

CREATE TABLE change_ops_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_run_id TEXT NOT NULL DEFAULT '',
  batch_id TEXT NOT NULL,
  entity TEXT NOT NULL CHECK (entity IN ('card', 'task', 'question', 'invariant', 'handoff', 'claim', 'node', 'decision', 'canvas')),
  entity_id TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('create', 'update', 'remove')),
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  node_id TEXT NOT NULL DEFAULT ''
);
INSERT INTO change_ops_new(id, project_id, agent_run_id, batch_id, entity, entity_id, op, data_json, created_at, node_id)
  SELECT id, project_id, agent_run_id, batch_id, entity, entity_id, op, data_json, created_at, node_id FROM change_ops;
DROP TABLE change_ops;
ALTER TABLE change_ops_new RENAME TO change_ops;
CREATE INDEX IF NOT EXISTS idx_change_ops_project ON change_ops(project_id, id);
CREATE INDEX IF NOT EXISTS idx_change_ops_batch ON change_ops(batch_id);
CREATE INDEX IF NOT EXISTS idx_change_ops_entity ON change_ops(entity_id);
