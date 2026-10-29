-- Structure is the only name of the project graph. The tables keep their rows;
-- SQLite rewrites the foreign keys that point at them (knowledge, facts,
-- evidence, canvases, deployments), and the indexes are recreated under the
-- new names.

ALTER TABLE atlas_nodes RENAME TO structure_nodes;
ALTER TABLE atlas_invariants RENAME TO structure_invariants;

DROP INDEX IF EXISTS idx_atlas_nodes_project;
DROP INDEX IF EXISTS idx_atlas_nodes_parent;
DROP INDEX IF EXISTS idx_atlas_invariants_node;
CREATE INDEX IF NOT EXISTS idx_structure_nodes_project ON structure_nodes(project_id, position);
CREATE INDEX IF NOT EXISTS idx_structure_nodes_parent ON structure_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_structure_invariants_node ON structure_invariants(node_id, position);
