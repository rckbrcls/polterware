-- Saved filters: named filter combinations per project and surface (page).
-- They are UI preferences, not audited changes, so no change_ops are written.
-- A NULL project_id is an app-level surface (for example 'projects'); the
-- unique index folds NULL to '' so app-level names are unique per surface too.
-- payload_json is opaque JSON the UI owns.

CREATE TABLE IF NOT EXISTS saved_filters (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  surface TEXT NOT NULL,
  name TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_filters_name ON saved_filters(COALESCE(project_id, ''), surface, name);
CREATE INDEX IF NOT EXISTS idx_saved_filters_surface ON saved_filters(COALESCE(project_id, ''), surface, position);
