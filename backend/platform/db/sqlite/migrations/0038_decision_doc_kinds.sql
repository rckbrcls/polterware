-- Knowledge kinds take the names the product uses: `decision` for Decisions and
-- `doc` for the documents that back facts. A doc keeps its type (doc, runbook,
-- source) in doc_type instead of a tag, and decisions lose their kind tag.
-- Numbered titles and the decisions: references on cards and nodes read
-- "Decision" (the refs as Decision-NNNN), and a principle is a decision level
-- (extra_json.level) instead of extra_json.scope.

-- Dropping knowledge_items cascades into knowledge_entity_links while foreign keys
-- are enabled, so keep the links aside and restore them after the rebuild.
CREATE TEMP TABLE knowledge_entity_links_backup AS SELECT * FROM knowledge_entity_links;

CREATE TABLE knowledge_items_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('doc', 'decision')),
  doc_type TEXT NOT NULL DEFAULT '' CHECK (
    (kind = 'decision' AND doc_type = '') OR (kind = 'doc' AND doc_type IN ('doc', 'runbook', 'source'))
  ),
  tags_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  extra_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  scope_node_id TEXT REFERENCES structure_nodes(id) ON DELETE SET NULL,
  archived_at TEXT NOT NULL DEFAULT ''
);

INSERT INTO knowledge_items_new (
  id, project_id, title, body, kind, doc_type, tags_json, summary, owner, status,
  extra_json, created_at, updated_at, scope_node_id, archived_at
)
SELECT
  id, project_id,
  CASE
    WHEN kind <> 'verdict' THEN title
    WHEN title LIKE 'verdict %' OR title LIKE 'verdict-%' THEN 'Decision' || substr(title, 8)
    WHEN title LIKE 'adr %' OR title LIKE 'adr-%' THEN 'Decision' || substr(title, 4)
    ELSE title
  END,
  body,
  CASE WHEN kind = 'verdict' THEN 'decision' ELSE 'doc' END,
  CASE
    WHEN kind = 'verdict' THEN ''
    -- ImportProjectSources ids are src-import-<hash>; older imports wrote no tags.
    WHEN id LIKE 'src-import-%' THEN 'source'
    WHEN json_valid(tags_json) AND EXISTS (SELECT 1 FROM json_each(knowledge_items.tags_json) WHERE value = 'source') THEN 'source'
    WHEN json_valid(tags_json) AND EXISTS (SELECT 1 FROM json_each(knowledge_items.tags_json) WHERE value = 'runbook') THEN 'runbook'
    ELSE 'doc'
  END,
  CASE
    WHEN NOT json_valid(tags_json) OR json_type(tags_json) <> 'array' THEN '[]'
    WHEN kind = 'verdict' THEN (
      SELECT json_group_array(value) FROM json_each(knowledge_items.tags_json)
      WHERE value NOT IN ('verdict', 'adr', 'decision')
    )
    ELSE (
      SELECT json_group_array(value) FROM json_each(knowledge_items.tags_json)
      WHERE value NOT IN ('doc', 'runbook', 'source')
    )
  END,
  summary, owner, status,
  CASE
    WHEN NOT json_valid(extra_json) THEN '{}'
    WHEN json_extract(extra_json, '$.scope') = 'principle'
      THEN json_set(json_remove(extra_json, '$.scope'), '$.level', 'principle')
    ELSE json_remove(extra_json, '$.scope')
  END,
  created_at, updated_at, scope_node_id, archived_at
FROM knowledge_items
WHERE kind IN ('evidence', 'verdict');

DROP TABLE knowledge_items;
ALTER TABLE knowledge_items_new RENAME TO knowledge_items;
CREATE INDEX IF NOT EXISTS idx_knowledge_project_kind ON knowledge_items(project_id, kind);

INSERT INTO knowledge_entity_links
SELECT * FROM knowledge_entity_links_backup
WHERE knowledge_id IN (SELECT id FROM knowledge_items);
DROP TABLE knowledge_entity_links_backup;

-- A numbered reference (Verdict-7, ADR-0007, Verdict 0007) becomes Decision-0007;
-- ids and titles in decisions: stay as written.
CREATE TEMP TABLE decision_ref_map AS
SELECT DISTINCT value AS old_ref, 'Decision-' || printf('%04d', CAST(digits AS INTEGER)) AS new_ref
FROM (
  SELECT refs.value AS value,
    CASE
      WHEN lower(substr(refs.value, 1, 7)) = 'verdict' AND substr(refs.value, 8, 1) IN ('-', ' ', '_') THEN trim(substr(refs.value, 9))
      WHEN lower(substr(refs.value, 1, 3)) = 'adr' AND substr(refs.value, 4, 1) IN ('-', ' ', '_') THEN trim(substr(refs.value, 5))
      ELSE ''
    END AS digits
  FROM (
    SELECT decisions_json AS list FROM work_cards WHERE json_valid(decisions_json)
    UNION ALL
    SELECT decisions_json FROM structure_nodes WHERE json_valid(decisions_json)
  ) AS lists, json_each(lists.list) AS refs
  WHERE refs.type = 'text'
)
WHERE digits <> '' AND digits NOT GLOB '*[^0-9]*';

UPDATE work_cards
SET decisions_json = (
  SELECT json_group_array(COALESCE(m.new_ref, refs.value))
  FROM json_each(work_cards.decisions_json) AS refs
  LEFT JOIN decision_ref_map AS m ON m.old_ref = refs.value
)
WHERE json_valid(decisions_json) AND json_array_length(decisions_json) > 0
  AND EXISTS (SELECT 1 FROM json_each(work_cards.decisions_json) AS refs JOIN decision_ref_map AS m ON m.old_ref = refs.value);

UPDATE structure_nodes
SET decisions_json = (
  SELECT json_group_array(COALESCE(m.new_ref, refs.value))
  FROM json_each(structure_nodes.decisions_json) AS refs
  LEFT JOIN decision_ref_map AS m ON m.old_ref = refs.value
)
WHERE json_valid(decisions_json) AND json_array_length(decisions_json) > 0
  AND EXISTS (SELECT 1 FROM json_each(structure_nodes.decisions_json) AS refs JOIN decision_ref_map AS m ON m.old_ref = refs.value);

DROP TABLE decision_ref_map;

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
FROM knowledge_items
WHERE archived_at = '';
