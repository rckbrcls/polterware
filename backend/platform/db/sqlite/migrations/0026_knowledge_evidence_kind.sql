-- Collapse knowledge kinds doc, runbook and source into a single `evidence` kind.
-- The former kind is preserved as a tag; `verdict` (Decisions) is unchanged, and
-- Verdicts stored as `adr` before the rename become `verdict`.

-- Dropping knowledge_items cascades into knowledge_entity_links while foreign keys
-- are enabled, so keep the links aside and restore them after the rebuild.
CREATE TEMP TABLE knowledge_entity_links_backup AS SELECT * FROM knowledge_entity_links;

CREATE TABLE knowledge_items_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('evidence', 'verdict')),
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
  id, project_id, title, body,
  CASE WHEN kind IN ('verdict', 'adr') THEN 'verdict' ELSE 'evidence' END,
  CASE
    WHEN kind IN ('verdict', 'adr') THEN tags_json
    WHEN EXISTS (SELECT 1 FROM json_each(knowledge_items.tags_json) WHERE value = knowledge_items.kind) THEN tags_json
    ELSE json_insert(tags_json, '$[#]', kind)
  END,
  summary, owner, status, extra_json, created_at, updated_at
FROM knowledge_items
WHERE kind IN ('doc', 'runbook', 'source', 'verdict', 'adr');

DROP TABLE knowledge_items;
ALTER TABLE knowledge_items_new RENAME TO knowledge_items;
CREATE INDEX IF NOT EXISTS idx_knowledge_project_kind ON knowledge_items(project_id, kind);

INSERT INTO knowledge_entity_links
SELECT * FROM knowledge_entity_links_backup
WHERE knowledge_id IN (SELECT id FROM knowledge_items);
DROP TABLE knowledge_entity_links_backup;

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
