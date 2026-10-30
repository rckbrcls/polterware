-- Rules are the law agents read before they work: a short imperative statement
-- with any number of Structure node contexts (none is the whole project). They
-- replace node invariants, which become Rules with their node as the context.
-- Evidence, the scan that wrote it, and observed facts are gone; commits are
-- read from Git when Drift runs, so a commit link names its checkout and sha.

CREATE TABLE rules (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug TEXT,
  statement TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_rules_slug ON rules(project_id, slug) WHERE slug IS NOT NULL;
CREATE INDEX idx_rules_project ON rules(project_id, position);

INSERT INTO rules(id, project_id, slug, statement, status, position, created_at, updated_at)
SELECT i.id, n.project_id, NULL, i.text, 'active', i.position, i.created_at, i.updated_at
FROM structure_invariants i
JOIN structure_nodes n ON n.id = i.node_id
WHERE i.state = 'active';

INSERT OR IGNORE INTO entity_contexts(project_id, entity_id, node_id)
SELECT n.project_id, i.id, i.node_id
FROM structure_invariants i
JOIN structure_nodes n ON n.id = i.node_id
WHERE i.state = 'active';

DROP INDEX IF EXISTS idx_structure_invariants_node;
DROP TABLE structure_invariants;

CREATE TRIGGER entity_contexts_rule_delete AFTER DELETE ON rules
BEGIN DELETE FROM entity_contexts WHERE project_id = old.project_id AND entity_id = old.id; END;

-- Commit links keyed by checkout and sha; links cited in commit subjects are
-- derived on read, so only manual links are stored.
DROP TABLE work_commit_links;
CREATE TABLE work_commit_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  repo TEXT NOT NULL DEFAULT '',
  sha TEXT NOT NULL,
  task_id TEXT NOT NULL REFERENCES work_tasks(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, repo, sha, task_id)
);
CREATE INDEX idx_work_commit_links_task ON work_commit_links(task_id);

-- Evidence and its links go; so do the facts the scan observed.
DROP TRIGGER IF EXISTS entity_contexts_evidence_delete;
DELETE FROM entity_contexts WHERE entity_id IN (SELECT id FROM canon_evidence);
DROP TABLE canon_fact_evidence;
DROP TABLE canon_evidence;
DELETE FROM canon_facts WHERE truth_class = 'observed';

-- The audit log learns the rule entity.
CREATE TABLE change_ops_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_run_id TEXT NOT NULL DEFAULT '',
  batch_id TEXT NOT NULL,
  entity TEXT NOT NULL CHECK (entity IN ('card', 'task', 'question', 'invariant', 'handoff', 'claim', 'node', 'decision', 'canvas', 'milestone', 'fact', 'rule')),
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
