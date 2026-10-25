-- Persistent Polter handles for canon Facts; existing Facts remain addressable by id.
ALTER TABLE canon_facts ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX idx_canon_facts_slug ON canon_facts(project_id, slug) WHERE slug IS NOT NULL;

-- Extend the audit entity CHECK, preserving every entity and node_id.
CREATE TABLE change_ops_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_run_id TEXT NOT NULL DEFAULT '',
  batch_id TEXT NOT NULL,
  entity TEXT NOT NULL CHECK (entity IN ('card', 'task', 'question', 'invariant', 'handoff', 'claim', 'node', 'decision', 'canvas', 'board', 'fact')),
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
