-- Slice 10: Verdict lifecycle (proposed, active, challenged, superseded).
-- Lifecycle data (supersededBy, reviewTrigger, statusReason) lives in the Verdict's
-- knowledge_items.extra_json; "accepted" becomes "active".
-- change_ops is rebuilt so its entity check accepts 'decision'.

UPDATE knowledge_items SET status = 'active' WHERE kind IN ('verdict', 'adr') AND lower(status) = 'accepted';
UPDATE knowledge_items SET status = 'proposed' WHERE kind IN ('verdict', 'adr') AND status NOT IN ('proposed', 'active', 'challenged', 'superseded');

CREATE TABLE change_ops_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_run_id TEXT NOT NULL DEFAULT '',
  batch_id TEXT NOT NULL,
  entity TEXT NOT NULL CHECK (entity IN ('card', 'task', 'question', 'invariant', 'handoff', 'claim', 'node', 'decision')),
  entity_id TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('create', 'update', 'remove')),
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
INSERT INTO change_ops_new(id, project_id, agent_run_id, batch_id, entity, entity_id, op, data_json, created_at)
  SELECT id, project_id, agent_run_id, batch_id, entity, entity_id, op, data_json, created_at FROM change_ops;
DROP TABLE change_ops;
ALTER TABLE change_ops_new RENAME TO change_ops;
CREATE INDEX IF NOT EXISTS idx_change_ops_project ON change_ops(project_id, id);
CREATE INDEX IF NOT EXISTS idx_change_ops_batch ON change_ops(batch_id);
CREATE INDEX IF NOT EXISTS idx_change_ops_entity ON change_ops(entity_id);
