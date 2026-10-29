-- Canvas has one generalist type. Existing rows keep their graph and become
-- type 'canvas'; SQLite cannot alter a CHECK, so the table is rebuilt.

CREATE TABLE canvases_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'canvas' CHECK (type = 'canvas'),
  agent_visible INTEGER NOT NULL DEFAULT 0 CHECK (agent_visible IN (0, 1)),
  graph_json TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  layout_json TEXT NOT NULL DEFAULT '{}',
  scope_node_id TEXT REFERENCES atlas_nodes(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO canvases_new(id, project_id, name, type, agent_visible, graph_json, layout_json, scope_node_id, created_at, updated_at)
  SELECT id, project_id, name, 'canvas', agent_visible, graph_json, layout_json, scope_node_id, created_at, updated_at FROM canvases;
DROP TABLE canvases;
ALTER TABLE canvases_new RENAME TO canvases;
CREATE INDEX IF NOT EXISTS idx_canvases_project ON canvases(project_id, name);
CREATE INDEX IF NOT EXISTS idx_canvases_project_updated ON canvases(project_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_canvases_scope ON canvases(project_id, scope_node_id);
