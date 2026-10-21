-- Slice 5: commit-to-task links. Explicit references are the match.
-- work_fts is a suggestion index only; a suggestion is never "delivered".

CREATE TABLE IF NOT EXISTS work_commit_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  evidence_id TEXT NOT NULL REFERENCES canon_evidence(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES work_tasks(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('explicit', 'suggested')),
  created_at TEXT NOT NULL,
  UNIQUE (evidence_id, task_id, method)
);
CREATE INDEX IF NOT EXISTS idx_work_commit_links_project ON work_commit_links(project_id);
CREATE INDEX IF NOT EXISTS idx_work_commit_links_task ON work_commit_links(task_id);

CREATE VIRTUAL TABLE IF NOT EXISTS work_fts USING fts5(
  task_id UNINDEXED,
  project_id UNINDEXED,
  card_slug UNINDEXED,
  title,
  tokenize = 'porter unicode61'
);

INSERT INTO work_fts(task_id, project_id, card_slug, title)
SELECT t.id, c.project_id, c.slug,
  trim(t.title || ' ' || c.title || ' ' || c.intent)
FROM work_tasks t
JOIN work_cards c ON c.id = t.card_id
WHERE c.status = 'active' AND t.state != 'dropped';
