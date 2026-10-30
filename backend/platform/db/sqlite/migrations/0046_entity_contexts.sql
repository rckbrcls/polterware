-- About becomes a list of contexts. A doc, decision, fact, or evidence row, and a
-- derived Inbox/Drift item (by its item key), points at any number of Structure
-- nodes. No context means the whole project; a decision with none is a principle,
-- so the decision level merges into its contexts.
--
-- The old scope_node_id columns carry a foreign key, which SQLite cannot drop
-- without rebuilding the table, and a rebuild would cascade into the link tables
-- that reference these rows. They stay as retired columns, always NULL, and
-- nothing reads them.

CREATE TABLE entity_contexts (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  node_id TEXT NOT NULL REFERENCES structure_nodes(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, entity_id, node_id)
);
CREATE INDEX idx_entity_contexts_node ON entity_contexts(project_id, node_id);

-- A principle applies to the whole project: it keeps no context, even when an
-- older write gave it a scope.
INSERT OR IGNORE INTO entity_contexts(project_id, entity_id, node_id)
SELECT project_id, id, scope_node_id FROM knowledge_items
WHERE scope_node_id IS NOT NULL
  AND NOT (kind = 'decision' AND json_valid(extra_json) AND COALESCE(json_extract(extra_json, '$.level'), '') = 'principle');

INSERT OR IGNORE INTO entity_contexts(project_id, entity_id, node_id)
SELECT project_id, id, scope_node_id FROM canon_facts WHERE scope_node_id IS NOT NULL;

INSERT OR IGNORE INTO entity_contexts(project_id, entity_id, node_id)
SELECT project_id, id, scope_node_id FROM canon_evidence WHERE scope_node_id IS NOT NULL;

INSERT OR IGNORE INTO entity_contexts(project_id, entity_id, node_id)
SELECT project_id, item_key, node_id FROM scope_assignments;

-- The level is gone. A plain decision with no scope had no context either, so it
-- becomes a principle: it was already meant for the whole project.
UPDATE knowledge_items SET extra_json = json_remove(extra_json, '$.level')
WHERE kind = 'decision' AND json_valid(extra_json) AND json_extract(extra_json, '$.level') IS NOT NULL;

UPDATE knowledge_items SET scope_node_id = NULL WHERE scope_node_id IS NOT NULL;
UPDATE canon_facts SET scope_node_id = NULL WHERE scope_node_id IS NOT NULL;
UPDATE canon_evidence SET scope_node_id = NULL WHERE scope_node_id IS NOT NULL;
DROP INDEX IF EXISTS idx_knowledge_scope;
DROP INDEX IF EXISTS idx_canon_facts_scope;
DROP INDEX IF EXISTS idx_canon_evidence_scope;
DROP TABLE scope_assignments;

-- Contexts go with their entity.
CREATE TRIGGER entity_contexts_knowledge_delete AFTER DELETE ON knowledge_items
BEGIN DELETE FROM entity_contexts WHERE project_id = old.project_id AND entity_id = old.id; END;
CREATE TRIGGER entity_contexts_fact_delete AFTER DELETE ON canon_facts
BEGIN DELETE FROM entity_contexts WHERE project_id = old.project_id AND entity_id = old.id; END;
CREATE TRIGGER entity_contexts_evidence_delete AFTER DELETE ON canon_evidence
BEGIN DELETE FROM entity_contexts WHERE project_id = old.project_id AND entity_id = old.id; END;
