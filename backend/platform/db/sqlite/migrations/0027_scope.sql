-- Global scope: an optional Atlas node on Decisions, Facts and Evidence. NULL means
-- the whole project, which stays visible under any scope filter. Work cards keep
-- scoping through work_cards.under (a node path).

ALTER TABLE knowledge_items ADD COLUMN scope_node_id TEXT REFERENCES atlas_nodes(id) ON DELETE SET NULL;
ALTER TABLE canon_facts ADD COLUMN scope_node_id TEXT REFERENCES atlas_nodes(id) ON DELETE SET NULL;
ALTER TABLE canon_evidence ADD COLUMN scope_node_id TEXT REFERENCES atlas_nodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_scope ON knowledge_items(project_id, scope_node_id);
CREATE INDEX IF NOT EXISTS idx_canon_facts_scope ON canon_facts(project_id, scope_node_id);
CREATE INDEX IF NOT EXISTS idx_canon_evidence_scope ON canon_evidence(project_id, scope_node_id);

-- Drift findings and Inbox items are derived on every read, so their own scope
-- is kept here, keyed by the same item_key the Inbox dispositions use.
CREATE TABLE IF NOT EXISTS scope_assignments (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  node_id TEXT NOT NULL REFERENCES atlas_nodes(id) ON DELETE CASCADE,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, item_key)
);
CREATE INDEX IF NOT EXISTS idx_scope_assignments_node ON scope_assignments(project_id, node_id);
