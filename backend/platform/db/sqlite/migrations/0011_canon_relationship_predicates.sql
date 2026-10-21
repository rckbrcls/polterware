-- Expand canon_relationships predicates for canvas DEPENDS_ON / CALLS (B5).

CREATE TABLE canon_relationships_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subject_entity_id TEXT NOT NULL REFERENCES canon_entities(id) ON DELETE CASCADE,
  predicate TEXT NOT NULL CHECK (predicate IN (
    'DOCUMENTS', 'OPERATES', 'RELATED_TO', 'DEFINES', 'DEPENDS_ON', 'CALLS'
  )),
  object_entity_id TEXT NOT NULL REFERENCES canon_entities(id) ON DELETE CASCADE,
  truth_class TEXT NOT NULL DEFAULT 'declared'
    CHECK (truth_class IN ('declared', 'observed', 'operational', 'inferred')),
  source TEXT NOT NULL DEFAULT 'polterware',
  actor TEXT NOT NULL DEFAULT 'system',
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, subject_entity_id, predicate, object_entity_id)
);

INSERT INTO canon_relationships_new (
  id, project_id, subject_entity_id, predicate, object_entity_id,
  truth_class, source, actor, observed_at, created_at
)
SELECT
  id, project_id, subject_entity_id, predicate, object_entity_id,
  truth_class, source, actor, observed_at, created_at
FROM canon_relationships;

DROP TABLE canon_relationships;
ALTER TABLE canon_relationships_new RENAME TO canon_relationships;

CREATE INDEX IF NOT EXISTS idx_canon_relationships_project ON canon_relationships(project_id);
CREATE INDEX IF NOT EXISTS idx_canon_relationships_subject ON canon_relationships(subject_entity_id);
CREATE INDEX IF NOT EXISTS idx_canon_relationships_object ON canon_relationships(object_entity_id);
