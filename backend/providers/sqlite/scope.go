package sqlite

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/polterware/polterware/backend/domains/structure"
)

// Scope kinds name where an entity's scope is stored.
const (
	ScopeDecision = "decision"
	ScopeFact     = "fact"
	ScopeEvidence = "evidence"
	// ScopeKnowledge is any knowledge item, such as the Evidence notes the Desktop lists.
	ScopeKnowledge = "knowledge"
	// ScopeItem is a derived Drift finding or Inbox item, keyed by its item key.
	ScopeItem = "item"
)

var scopeTables = map[string]string{
	ScopeDecision:  "knowledge_items",
	ScopeKnowledge: "knowledge_items",
	ScopeFact:      "canon_facts",
	ScopeEvidence:  "canon_evidence",
}

// SetScope assigns an entity to a Structure node, or clears the scope when nodeID
// is empty. A node path in nodeID is not accepted; resolve it first.
func (s *Store) SetScope(projectID, kind, id, nodeID string) error {
	if nodeID != "" {
		var found string
		err := s.DB.QueryRow(`SELECT id FROM structure_nodes WHERE id=? AND project_id=? AND status<>'removed'`, nodeID, projectID).Scan(&found)
		if err != nil {
			return fmt.Errorf("unknown structure node %q", nodeID)
		}
	}
	if kind == ScopeItem {
		if nodeID == "" {
			_, err := s.DB.Exec(`DELETE FROM scope_assignments WHERE project_id=? AND item_key=?`, projectID, id)
			return err
		}
		_, err := s.DB.Exec(`INSERT INTO scope_assignments(project_id,item_key,node_id,updated_at) VALUES(?,?,?,?)
			ON CONFLICT(project_id,item_key) DO UPDATE SET node_id=excluded.node_id, updated_at=excluded.updated_at`,
			projectID, id, nodeID, time.Now().UTC().Format(time.RFC3339))
		return err
	}
	table, ok := scopeTables[kind]
	if !ok {
		return fmt.Errorf("unknown scope kind %q", kind)
	}
	var value any
	if nodeID != "" {
		value = nodeID
	}
	res, err := s.DB.Exec(`UPDATE `+table+` SET scope_node_id=? WHERE id=? AND project_id=?`, value, id, projectID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("%s %q not found", kind, id)
	}
	return nil
}

// ScopeMap returns entity ID (or item key) to node ID for every scoped entity
// of kind in the project. Unscoped entities are absent.
func (s *Store) ScopeMap(projectID, kind string) (map[string]string, error) {
	query := ""
	if kind == ScopeItem {
		query = `SELECT item_key,node_id FROM scope_assignments WHERE project_id=?`
	} else {
		table, ok := scopeTables[kind]
		if !ok {
			return nil, fmt.Errorf("unknown scope kind %q", kind)
		}
		query = `SELECT id,scope_node_id FROM ` + table + ` WHERE project_id=? AND scope_node_id IS NOT NULL`
	}
	out := map[string]string{}
	err := s.eachRow(query, projectID, func(rows *sql.Rows) error {
		var id, node string
		if err := rows.Scan(&id, &node); err != nil {
			return err
		}
		out[id] = node
		return nil
	})
	return out, err
}

// NodeScope is the resolved filter for one project: the matching node set and
// the nodes it was built from, so callers can also match by node path.
type NodeScope struct {
	Set   structure.ScopeSet
	Nodes []structure.Node
}

// Matches reports whether an entity scoped to nodeID is visible.
func (n NodeScope) Matches(nodeID string) bool { return n.Set.Matches(nodeID) }

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
