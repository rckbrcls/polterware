-- Structure nodes no longer declare dependencies: how nodes relate is drawn on a canvas.
ALTER TABLE structure_nodes DROP COLUMN uses_json;
