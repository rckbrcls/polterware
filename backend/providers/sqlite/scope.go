package sqlite

import (
	"database/sql"
	"fmt"

	"github.com/polterware/polterware/backend/domains/structure"
)

// Scope kinds name where an entity's scope is stored.
const (
	ScopeDecision = "decision"
	ScopeFact     = "fact"
	ScopeRule     = "rule"
	// ScopeKnowledge is any knowledge item, such as a doc.
	ScopeKnowledge = "knowledge"
	// ScopeItem is a derived Drift finding or Inbox item, keyed by its item key.
	ScopeItem = "item"
)

var scopeTables = map[string]string{
	ScopeDecision:  "knowledge_items",
	ScopeKnowledge: "knowledge_items",
	ScopeFact:      "canon_facts",
	ScopeRule:      "rules",
}

// SetScope replaces an entity's contexts (or a derived item's, by item key) with
// nodeIDs; an empty list clears them, which means the whole project. Node paths
// are not accepted; resolve them first. Every node must be an active Structure node.
func (s *Store) SetScope(projectID, kind, id string, nodeIDs []string) error {
	nodeIDs = uniqueIDs(nodeIDs)
	for _, nodeID := range nodeIDs {
		var found string
		err := s.DB.QueryRow(`SELECT id FROM structure_nodes WHERE id=? AND project_id=? AND status<>'removed'`, nodeID, projectID).Scan(&found)
		if err != nil {
			return fmt.Errorf("unknown structure node %q", nodeID)
		}
	}
	if kind != ScopeItem {
		table, ok := scopeTables[kind]
		if !ok {
			return fmt.Errorf("unknown scope kind %q", kind)
		}
		var found string
		if err := s.DB.QueryRow(`SELECT id FROM `+table+` WHERE id=? AND project_id=?`, id, projectID).Scan(&found); err != nil {
			return fmt.Errorf("%s %q not found", kind, id)
		}
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if err := replaceContexts(tx, projectID, id, nodeIDs); err != nil {
		return err
	}
	return tx.Commit()
}

// replaceContexts writes an entity's contexts as exactly nodeIDs.
func replaceContexts(tx *sql.Tx, projectID, id string, nodeIDs []string) error {
	if _, err := tx.Exec(`DELETE FROM entity_contexts WHERE project_id=? AND entity_id=?`, projectID, id); err != nil {
		return err
	}
	for _, nodeID := range uniqueIDs(nodeIDs) {
		if _, err := tx.Exec(`INSERT INTO entity_contexts(project_id,entity_id,node_id) VALUES(?,?,?)`, projectID, id, nodeID); err != nil {
			return err
		}
	}
	return nil
}

// setContextPaths resolves Structure node paths and writes them as an entity's
// contexts. An empty list clears them.
func setContextPaths(tx *sql.Tx, projectID, id string, paths []string) error {
	nodeIDs := make([]string, 0, len(paths))
	for _, path := range paths {
		var nodeID string
		if err := tx.QueryRow(`SELECT id FROM structure_nodes WHERE project_id=? AND path=? AND status<>'removed'`, projectID, path).Scan(&nodeID); err != nil {
			return fmt.Errorf("scope %q is not a Structure node path: list them with polterware structure", path)
		}
		nodeIDs = append(nodeIDs, nodeID)
	}
	return replaceContexts(tx, projectID, id, nodeIDs)
}

// contextPaths maps entity id to the paths of its context nodes, sorted.
func (s *Store) contextPaths(projectID string) (map[string][]string, error) {
	out := map[string][]string{}
	err := s.eachRow(`SELECT c.entity_id,n.path FROM entity_contexts c JOIN structure_nodes n ON n.id=c.node_id
		WHERE c.project_id=? ORDER BY c.entity_id, n.path`, projectID, func(rows *sql.Rows) error {
		var id, path string
		if err := rows.Scan(&id, &path); err != nil {
			return err
		}
		out[id] = append(out[id], path)
		return nil
	})
	return out, err
}

// ScopeMap returns entity ID (or item key) to its context node IDs for every
// entity of kind in the project that has contexts. Entities without any are absent.
func (s *Store) ScopeMap(projectID, kind string) (map[string][]string, error) {
	query := ""
	if kind == ScopeItem {
		// Item keys are not rows of any entity table.
		query = `SELECT c.entity_id,c.node_id FROM entity_contexts c WHERE c.project_id=?
			AND NOT EXISTS (SELECT 1 FROM knowledge_items t WHERE t.id=c.entity_id)
			AND NOT EXISTS (SELECT 1 FROM canon_facts t WHERE t.id=c.entity_id)
			AND NOT EXISTS (SELECT 1 FROM rules t WHERE t.id=c.entity_id)
			ORDER BY c.entity_id, c.node_id`
	} else {
		table, ok := scopeTables[kind]
		if !ok {
			return nil, fmt.Errorf("unknown scope kind %q", kind)
		}
		query = `SELECT c.entity_id,c.node_id FROM entity_contexts c JOIN ` + table + ` t ON t.id=c.entity_id
			WHERE c.project_id=? ORDER BY c.entity_id, c.node_id`
	}
	out := map[string][]string{}
	err := s.eachRow(query, projectID, func(rows *sql.Rows) error {
		var id, node string
		if err := rows.Scan(&id, &node); err != nil {
			return err
		}
		out[id] = append(out[id], node)
		return nil
	})
	return out, err
}

func uniqueIDs(ids []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
}

// NodeScope is the resolved filter for one project: the matching node set and
// the nodes it was built from, so callers can also match by node path.
type NodeScope struct {
	Set   structure.ScopeSet
	Nodes []structure.Node
}

// Matches reports whether an entity scoped to nodeID is visible.
func (n NodeScope) Matches(nodeID string) bool { return n.Set.Matches(nodeID) }

// MatchesAny reports whether an entity with these contexts is visible: one of
// them is inside the scope, or it has none (the whole project).
func (n NodeScope) MatchesAny(nodeIDs []string) bool { return n.Set.MatchesAny(nodeIDs) }

// MatchesPath reports whether an entity scoped by node path is visible. An empty
// path is unscoped and always matches.
func (n NodeScope) MatchesPath(path string) bool {
	if n.Set == nil || path == "" {
		return true
	}
	for _, node := range n.Nodes {
		if node.Path == path {
			return n.Set[node.ID]
		}
	}
	return false
}

// LoadScope resolves one node against the project's Structure. An inactive scope
// returns a NodeScope whose Set is nil and matches everything.
func (s *Store) LoadScope(projectID string, scope structure.Scope) (NodeScope, error) {
	var ids []string
	if scope.NodeID != "" {
		ids = []string{scope.NodeID}
	}
	return s.LoadScopes(projectID, structure.MultiScope{NodeIDs: ids, Exact: scope.Exact})
}

// LoadScopes resolves several nodes against the project's Structure. The set is
// the union of each node's scope. An inactive scope matches everything.
func (s *Store) LoadScopes(projectID string, scope structure.MultiScope) (NodeScope, error) {
	if !scope.Active() {
		return NodeScope{}, nil
	}
	nodes, err := s.loadStructureNodes(projectID)
	if err != nil {
		return NodeScope{}, err
	}
	return NodeScope{Set: structure.ResolveScopes(nodes, scope), Nodes: nodes}, nil
}

// StructureNodes returns every Structure node of the project, removed ones included.
func (s *Store) StructureNodes(projectID string) ([]structure.Node, error) {
	return s.loadStructureNodes(projectID)
}
