CREATE TABLE spaces (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES spaces(id) ON DELETE CASCADE,       -- deleting a Space deletes its descendants
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  color TEXT,                                                   -- '#RRGGBB'
  icon TEXT,                                                    -- Hugeicons name
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, rev INTEGER NOT NULL DEFAULT 1
) STRICT;
CREATE INDEX spaces_parent ON spaces(parent_id, sort_order);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  space_id TEXT REFERENCES spaces(id) ON DELETE SET NULL,         -- NULL = Inbox; notes survive Space deletion
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  content TEXT NOT NULL DEFAULT '',                                -- Markdown
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  pinned INTEGER NOT NULL DEFAULT 0,
  priority INTEGER CHECK (priority BETWEEN 0 AND 3),            -- NULL none; 1 low .. 3 high; 0 reserved
  due_at TEXT, due_all_day INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  auto_complete_on_checklist INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, rev INTEGER NOT NULL DEFAULT 1
) STRICT;
CREATE INDEX notes_space ON notes(space_id, status, sort_order);
CREATE INDEX notes_status_updated ON notes(status, updated_at DESC);
CREATE INDEX notes_due ON notes(due_at) WHERE due_at IS NOT NULL;
CREATE INDEX notes_pinned ON notes(pinned) WHERE pinned = 1;

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(name) BETWEEN 1 AND 60),
  color TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, rev INTEGER NOT NULL DEFAULT 1
) STRICT;
CREATE TABLE note_tags (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
) STRICT;
CREATE INDEX note_tags_tag ON note_tags(tag_id);

CREATE TABLE check_items (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) <= 500),
  detail TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX check_items_note ON check_items(note_id, sort_order);

CREATE TABLE schedules (                                        -- 1:1 with notes
  note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  active INTEGER NOT NULL DEFAULT 1,
  fire_at TEXT NOT NULL,                                        -- instant of the FIRST occurrence (UTC)
  tz TEXT NOT NULL,                                             -- IANA zone the wall-clock rules are evaluated in
  all_day INTEGER NOT NULL DEFAULT 0,
  freq TEXT CHECK (freq IN ('minutely','hourly','daily','weekly','monthly','yearly')),   -- NULL = one-shot
  every INTEGER NOT NULL DEFAULT 1 CHECK (every >= 1),
  weekday_mask INTEGER NOT NULL DEFAULT 0 CHECK (weekday_mask BETWEEN 0 AND 127),        -- bit0=Sun .. bit6=Sat
  end_type TEXT NOT NULL DEFAULT 'never' CHECK (end_type IN ('never','until','count')),
  until_at TEXT,                                                -- inclusive, when end_type='until'
  occurrence_count INTEGER CHECK (occurrence_count >= 1),       -- when end_type='count'
  focus_enabled INTEGER NOT NULL DEFAULT 0,
  focus_work_min INTEGER, focus_short_break_min INTEGER, focus_long_break_min INTEGER,
  focus_cycles INTEGER, focus_auto_continue INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  CHECK (weekday_mask = 0 OR freq = 'weekly'),
  CHECK ((end_type = 'until') = (until_at IS NOT NULL)),
  CHECK ((end_type = 'count') = (occurrence_count IS NOT NULL)),
  CHECK (freq IS NOT NULL OR end_type = 'never')
) STRICT;

CREATE TABLE places (                                           -- 1:1 with notes; stored + shown, never armed in v1
  note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  name TEXT, lat REAL NOT NULL CHECK (lat BETWEEN -90 AND 90), lng REAL NOT NULL CHECK (lng BETWEEN -180 AND 180),
  radius_m REAL NOT NULL DEFAULT 200 CHECK (radius_m BETWEEN 25 AND 5000),
  event TEXT NOT NULL DEFAULT 'enter' CHECK (event IN ('enter','exit')),
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE completions (                                      -- per-occurrence completion for recurring notes
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  occurrence_at TEXT NOT NULL,                                  -- exact occurrence instant (UTC)
  completed_at TEXT NOT NULL,
  UNIQUE (note_id, occurrence_at)
) STRICT;
CREATE INDEX completions_completed_at ON completions(completed_at);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('photo','audio','file','link')),
  name TEXT, mime TEXT, size_bytes INTEGER, sha256 TEXT,
  rel_path TEXT,                                                -- relative to <data>/attachments; NULL for links
  url TEXT, title TEXT,                                         -- links
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  CHECK ((kind = 'link' AND url IS NOT NULL AND rel_path IS NULL) OR (kind <> 'link' AND rel_path IS NOT NULL))
) STRICT;
CREATE INDEX attachments_note ON attachments(note_id, kind, sort_order);

CREATE TABLE focus_sessions (
  id TEXT PRIMARY KEY,
  note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,    -- NULL = quick focus
  phase TEXT NOT NULL CHECK (phase IN ('work','short_break','long_break')),
  planned_s INTEGER NOT NULL, elapsed_s INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('completed','stopped')),
  started_at TEXT NOT NULL, ended_at TEXT NOT NULL
) STRICT;
CREATE INDEX focus_sessions_started ON focus_sessions(started_at);

CREATE TABLE reminder_oneoffs (                                 -- extra OS notifications not derived from a schedule
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('focus_phase','snooze')),
  note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
  fire_at TEXT NOT NULL, title TEXT NOT NULL, body TEXT,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX reminder_oneoffs_fire ON reminder_oneoffs(fire_at);   -- rows older than 1 day are pruned by maintenance

CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL) STRICT;

CREATE TABLE activity (                                         -- append-only audit; capped to 50k rows by a maintenance job
  id TEXT PRIMARY KEY, at TEXT NOT NULL,
  actor TEXT NOT NULL,                                          -- 'ui' | 'cli' | 'mcp:<clientName>' | 'system'
  entity TEXT NOT NULL, entity_id TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('create','update','delete','complete','reopen')),
  summary TEXT NOT NULL
) STRICT;
CREATE INDEX activity_at ON activity(at DESC);

-- search (see 05-search-attachments-map.md)
CREATE VIRTUAL TABLE note_fts USING fts5(
  note_id UNINDEXED, title, content, checklist, tags, space,
  tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3'
);
