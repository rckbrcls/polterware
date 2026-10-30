-- Structure drops the system level: the project is the root, domains sit
-- under it, and a component sits under a domain or loose under the project.
-- A system's children move up to the project, their paths lose the system's
-- segment, and the system is removed. Rules, Decisions, and Facts scoped to a
-- system hold for the whole project. A system drawn on a canvas becomes a
-- frame that cites nothing.

UPDATE OR IGNORE work_cards SET under = substr(under, instr(under, '/') + 1)
  WHERE instr(under, '/') > 0 AND EXISTS (
    SELECT 1 FROM structure_nodes s WHERE s.project_id = work_cards.project_id AND s.level = 'system'
      AND work_cards.under LIKE s.path || '/%');

UPDATE OR IGNORE structure_nodes SET path = substr(path, instr(path, '/') + 1)
  WHERE level <> 'system' AND instr(path, '/') > 0 AND EXISTS (
    SELECT 1 FROM structure_nodes s WHERE s.project_id = structure_nodes.project_id AND s.level = 'system'
      AND structure_nodes.path LIKE s.path || '/%');

UPDATE structure_nodes SET parent_id = NULL
  WHERE parent_id IN (SELECT id FROM structure_nodes WHERE level = 'system');

DELETE FROM entity_contexts WHERE node_id IN (SELECT id FROM structure_nodes WHERE level = 'system');

UPDATE structure_nodes SET status = 'removed', path = 'removed-system-' || lower(id), slug = 'removed-system-' || lower(id)
  WHERE level = 'system';

UPDATE canvases SET graph_json = json_set(graph_json, '$.nodes', (
    SELECT json_group_array(CASE WHEN json_extract(value, '$.kind') = 'system'
      THEN json_remove(json_set(value, '$.kind', 'frame'), '$.ref') ELSE json(value) END)
    FROM json_each(canvases.graph_json, '$.nodes')))
  WHERE EXISTS (SELECT 1 FROM json_each(canvases.graph_json, '$.nodes') WHERE json_extract(value, '$.kind') = 'system');
