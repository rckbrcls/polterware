-- Verdict kind, canonical knowledge→entity links, and FTS5 index.

CREATE TABLE knowledge_items_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('doc', 'runbook', 'spec', 'plan', 'tasks', 'verdict')),
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

CREATE TABLE IF NOT EXISTS knowledge_entity_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  knowledge_id TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES canon_entities(id) ON DELETE CASCADE,
  predicate TEXT NOT NULL CHECK (predicate IN ('DOCUMENTS', 'OPERATES', 'RELATED_TO', 'DEFINES')),
  truth_class TEXT NOT NULL DEFAULT 'declared'
    CHECK (truth_class IN ('declared', 'observed', 'operational', 'inferred')),
  source TEXT NOT NULL DEFAULT 'polterware',
  actor TEXT NOT NULL DEFAULT 'human',
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (knowledge_id, entity_id, predicate)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_project ON knowledge_entity_links(project_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_entity ON knowledge_entity_links(entity_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_knowledge ON knowledge_entity_links(knowledge_id);

CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
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
