-- Milestones replace the saved Work boards. A milestone owns the cards that
-- ship together (work_cards.milestone_id); a card with none is in the Backlog.
-- Every board becomes an active milestone that owns no cards yet. Board view
-- config is dropped: display options belong to each surface.
-- change_ops is rebuilt so its entity check names 'milestone' instead of
-- 'board'; board history rows move to the milestone they became.

CREATE TABLE milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT '',
  exit_criteria_json TEXT NOT NULL DEFAULT '[]',
  target_date TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'planned' CHECK (state IN ('planned', 'active', 'done')),
  position INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, slug),
  UNIQUE (project_id, name)
);
CREATE INDEX idx_milestones_project ON milestones(project_id, position);

-- A board name becomes a lowercase-kebab slug; the id suffix keeps a slug
-- unique when two names fold to the same text.
INSERT INTO milestones(id, project_id, slug, name, state, position, created_at, updated_at)
SELECT
  id, project_id,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM work_boards AS other
      WHERE other.project_id = work_boards.project_id AND other.id < work_boards.id
        AND lower(replace(trim(other.name), ' ', '-')) = lower(replace(trim(work_boards.name), ' ', '-'))
    ) THEN lower(replace(trim(name), ' ', '-')) || '-' || lower(substr(id, -4))
    ELSE lower(replace(trim(name), ' ', '-'))
  END,
  name, 'active', position, created_at, updated_at
FROM work_boards;

DROP TABLE work_boards;

ALTER TABLE work_cards ADD COLUMN milestone_id TEXT REFERENCES milestones(id) ON DELETE SET NULL;
CREATE INDEX idx_work_cards_milestone ON work_cards(milestone_id);

CREATE TABLE change_ops_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_run_id TEXT NOT NULL DEFAULT '',
  batch_id TEXT NOT NULL,
  entity TEXT NOT NULL CHECK (entity IN ('card', 'task', 'question', 'invariant', 'handoff', 'claim', 'node', 'decision', 'canvas', 'milestone', 'fact')),
  entity_id TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('create', 'update', 'remove')),
  data_json TEXT NOT NULL DEFAULT '{}',
  node_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
INSERT INTO change_ops_new(id, project_id, agent_run_id, batch_id, entity, entity_id, op, data_json, node_id, created_at)
  SELECT id, project_id, agent_run_id, batch_id, CASE entity WHEN 'board' THEN 'milestone' ELSE entity END,
    entity_id, op, data_json, node_id, created_at
  FROM change_ops;
DROP TABLE change_ops;
ALTER TABLE change_ops_new RENAME TO change_ops;
CREATE INDEX IF NOT EXISTS idx_change_ops_project ON change_ops(project_id, id);
CREATE INDEX IF NOT EXISTS idx_change_ops_batch ON change_ops(batch_id);
CREATE INDEX IF NOT EXISTS idx_change_ops_entity ON change_ops(entity_id);
