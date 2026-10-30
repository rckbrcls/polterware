-- Docs have no types: a runbook becomes a doc tagged runbook, so the split lives in tags.
UPDATE knowledge_items
SET tags_json = CASE
      WHEN EXISTS (SELECT 1 FROM json_each(tags_json) WHERE value = 'runbook') THEN tags_json
      ELSE json_insert(tags_json, '$[#]', 'runbook')
    END,
    doc_type = 'doc'
WHERE kind = 'doc' AND doc_type = 'runbook';
