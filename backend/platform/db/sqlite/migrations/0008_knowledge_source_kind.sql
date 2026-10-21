-- Allow knowledge kind `source` for indexed project path references in Knowledge Sources.

CREATE TABLE knowledge_items_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'doc', 'runbook', 'spec', 'plan', 'tasks', 'verdict',
    'clarify', 'checklist', 'source'
  )),
  tags_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  extra_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO knowledge_items_new (
  id, project_id, title, body, kind, tags_json, summary, owner, status, extra_json, created_at, updated_at
)
SELECT
  id, project_id, title, body, kind, tags_json, summary, owner, status, extra_json, created_at, updated_at
FROM knowledge_items;

DROP TABLE knowledge_items;
ALTER TABLE knowledge_items_new RENAME TO knowledge_items;
CREATE INDEX IF NOT EXISTS idx_knowledge_project_kind ON knowledge_items(project_id, kind);

DROP TABLE IF EXISTS knowledge_fts;
CREATE VIRTUAL TABLE knowledge_fts USING fts5(
  knowledge_id UNINDEXED,
  project_id UNINDEXED,
  kind UNINDEXED,
  title,
  body,
  summary,
  tags,
  tokenize = 'porter unicode61'
);

INSERT INTO knowledge_fts(knowledge_id, project_id, kind, title, body, summary, tags)
SELECT
  id,
  project_id,
  kind,
  title,
  body,
  summary,
  REPLACE(REPLACE(REPLACE(tags_json, '[', ''), ']', ''), '"', '')
FROM knowledge_items;
