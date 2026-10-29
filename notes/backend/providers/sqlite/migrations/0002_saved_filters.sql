CREATE TABLE saved_filters (                                    -- named filter combinations per UI surface (UI preferences, not audited)
  id TEXT PRIMARY KEY,
  surface TEXT NOT NULL CHECK (length(surface) BETWEEN 1 AND 60), -- e.g. 'notes.library', 'notes.search'
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  payload_json TEXT NOT NULL DEFAULT '{}',                      -- opaque UI JSON: {"version":1,"clauses":[...],"extra":{}}
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (surface, name)
) STRICT;
CREATE INDEX saved_filters_surface ON saved_filters(surface, position);
