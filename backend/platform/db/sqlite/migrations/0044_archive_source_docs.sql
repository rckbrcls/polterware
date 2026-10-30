-- Source docs (registered repository files) are retired: agents read repo files
-- from the checkout. Existing ones are archived, never deleted.
UPDATE knowledge_items
SET archived_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE kind = 'doc' AND doc_type = 'source' AND archived_at = '';
