-- Archive instead of delete. Knowledge items and canvases keep their row with
-- archived_at set (RFC3339; empty means active). Normal reads leave archived
-- rows out and Restore clears the column. A permanent delete is only allowed
-- for an archived row, and decisions are never archived or deleted.

ALTER TABLE knowledge_items ADD COLUMN archived_at TEXT NOT NULL DEFAULT '';
ALTER TABLE canvases ADD COLUMN archived_at TEXT NOT NULL DEFAULT '';
