-- AGENTS.md sync is opt-in per project: when on, the core rewrites the
-- generated block in each checkout's AGENTS.md after project state changes.
ALTER TABLE project_settings ADD COLUMN agents_sync INTEGER NOT NULL DEFAULT 0;
