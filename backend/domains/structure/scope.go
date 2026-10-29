package structure

// Scope is a global filter over the project: one Structure node, or the whole
// project when NodeID is empty. Exact drops the ancestors from the match.
type Scope struct {
	NodeID string
	Exact  bool
}

// Active reports whether the scope narrows anything.
func (s Scope) Active() bool { return s.NodeID != "" }

// MultiScope is a global filter over several Structure nodes. The match is the
// union of each node's Scope. Exact applies to every node. An empty NodeIDs
// is the whole project.
type MultiScope struct {
	NodeIDs []string
	Exact   bool
}

// Active reports whether the scope narrows anything.
func (s MultiScope) Active() bool {
	for _, id := range s.NodeIDs {
		if id != "" {
			return true
		}
	}
	return false
}

// ScopeSet holds the node IDs a scope matches. A nil set matches everything.
type ScopeSet map[string]bool

// Matches reports whether an entity scoped to nodeID is visible. An entity with
// no scope belongs to the whole project and is visible under any filter.
func (s ScopeSet) Matches(nodeID string) bool {
	if s == nil || nodeID == "" {
		return true
	}
	return s[nodeID]
}

// ResolveScope returns the node itself and its descendants, plus its ancestors
// unless the scope is exact. Removed nodes are skipped. An unknown node yields
// an empty set that matches only unscoped entities.
func ResolveScope(nodes []Node, scope Scope) ScopeSet {
	if !scope.Active() {
		return nil
	}
	byID := map[string]Node{}
	children := map[string][]string{}
	for _, node := range nodes {
		if node.Status == NodeRemoved {
			continue
		}
		byID[node.ID] = node
		children[node.ParentID] = append(children[node.ParentID], node.ID)
	}
	set := ScopeSet{}
	if _, ok := byID[scope.NodeID]; !ok {
		return set
	}
	var down func(id string)
	down = func(id string) {
		if set[id] {
			return
		}
		set[id] = true
		for _, child := range children[id] {
			down(child)
		}
	}
	down(scope.NodeID)
	if scope.Exact {
		return set
	}
	for parent := byID[scope.NodeID].ParentID; parent != ""; parent = byID[parent].ParentID {
		if _, ok := byID[parent]; !ok {
			break
		}
		set[parent] = true
	}
	return set
}

// ResolveScopes returns the union of ResolveScope for each node. An empty
// scope matches everything (a nil set). A node that is unknown or removed
// contributes nothing; when every node is skipped the set is empty and matches
// only unscoped entities.
func ResolveScopes(nodes []Node, scope MultiScope) ScopeSet {
	if !scope.Active() {
		return nil
	}
	set := ScopeSet{}
	for _, id := range scope.NodeIDs {
		if id == "" {
			continue
		}
		for nodeID := range ResolveScope(nodes, Scope{NodeID: id, Exact: scope.Exact}) {
			set[nodeID] = true
		}
	}
	return set
}

// PathScopeSet is ScopeSet keyed by node path, for Work cards whose `under`
// names a node path.
func PathScopeSet(nodes []Node, set ScopeSet) map[string]bool {
	if set == nil {
		return nil
	}
	paths := map[string]bool{}
	for _, node := range nodes {
		if set[node.ID] {
			paths[node.Path] = true
		}
	}
	return paths
}
