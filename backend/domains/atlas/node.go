// Package atlas is the project graph above Work cards: system, domain, and
// component nodes. Features stay cards. Status is derived when the graph is read.
package atlas

const (
	LevelSystem    = "system"
	LevelDomain    = "domain"
	LevelComponent = "component"

	NodeActive  = "active"
	NodeRemoved = "removed"

	StatusProposed   = "proposed"
	StatusInProgress = "in_progress"
	StatusDelivered  = "delivered"
	StatusDrift      = "drift"
)

// Levels lists node levels from the top of the graph down to a component.
var Levels = []string{LevelSystem, LevelDomain, LevelComponent}

// ValidLevel reports whether level is system, domain, or component.
func ValidLevel(level string) bool {
	for _, item := range Levels {
		if item == level {
			return true
		}
	}
	return false
}

// ParentLevel is the level a node's parent usually has. A system has none.
func ParentLevel(level string) (string, bool) {
	switch level {
	case LevelDomain:
		return LevelSystem, true
	case LevelComponent:
		return LevelDomain, true
	default:
		return "", false
	}
}

// AllowedParent reports whether a node at level may sit under a parent at
// parentLevel. A component sits under a domain, or loose under its system.
func AllowedParent(level, parentLevel string) bool {
	if want, ok := ParentLevel(level); ok && want == parentLevel {
		return true
	}
	return level == LevelComponent && parentLevel == LevelSystem
}

// Node is one Atlas node. Invariants are its contract.
type Node struct {
	ID        string
	ProjectID string
	ParentID  string
	Level     string
	Slug      string
	Path      string
	Title     string
	Intent    string
	Status    string
	Decisions []string
	// Uses lists the node paths this node depends on. The map draws them as edges.
	Uses []string
	// Deploys lists where this node is deployed, one link per environment.
	// Provider is a catalog id. Resource names the remote target.
	// Credentials are never stored.
	Deploys  []Deployment
	Position int
	// Repo is a project_repos name; empty is the project root checkout.
	Repo string
	// Folder is a directory inside that checkout (`src/auth`). Path stays
	// the node identity and is never a filesystem folder.
	Folder string
	// MigrationFrom and MigrationTo describe a node moving between designs.
	// Both empty means it is not migrating.
	MigrationFrom string
	MigrationTo   string
	Invariants    []Invariant
}

// Invariant is one contract line on a node. Removed lines stay in the table.
type Invariant struct {
	ID       string
	NodeID   string
	Text     string
	State    string
	Position int
}

// Feature is a Work card reduced to what status derivation needs.
type Feature struct {
	Slug          string
	Title         string
	Under         string
	Stage         string
	OpenQuestions int
	Drift         bool
}

// Row is a node plus the status and counts derived from its descendants.
type Row struct {
	Node
	Derived       string
	ChildCount    int
	FeatureCount  int
	OpenQuestions int
}

// DeriveStatus reports proposed, in_progress, delivered, or drift.
// Drift wins. No features is proposed. Every feature delivered is delivered.
func DeriveStatus(stages []string, drifted bool) string {
	if drifted {
		return StatusDrift
	}
	if len(stages) == 0 {
		return StatusProposed
	}
	for _, stage := range stages {
		if stage != "delivered" {
			return StatusInProgress
		}
	}
	return StatusDelivered
}

// Decorate attaches derived status and counts. Removed nodes are left out.
func Decorate(nodes []Node, features []Feature) []Row {
	active := make([]Node, 0, len(nodes))
	for _, node := range nodes {
		if node.Status == NodeRemoved {
			continue
		}
		active = append(active, node)
	}
	children := map[string][]Node{}
	for _, node := range active {
		children[node.ParentID] = append(children[node.ParentID], node)
	}
	componentPaths := map[string]map[string]bool{}
	var walk func(node Node) map[string]bool
	walk = func(node Node) map[string]bool {
		if paths, ok := componentPaths[node.ID]; ok {
			return paths
		}
		paths := map[string]bool{}
		if node.Level == LevelComponent {
			paths[node.Path] = true
		}
		for _, child := range children[node.ID] {
			for path := range walk(child) {
				paths[path] = true
			}
		}
		componentPaths[node.ID] = paths
		return paths
	}
	rows := make([]Row, 0, len(active))
	for _, node := range active {
		paths := walk(node)
		var stages []string
		drift := false
		questions := 0
		count := 0
		for _, feature := range features {
			if feature.Under == "" || !paths[feature.Under] {
				continue
			}
			count++
			stages = append(stages, feature.Stage)
			questions += feature.OpenQuestions
			if feature.Drift {
				drift = true
			}
		}
		rows = append(rows, Row{
			Node:          node,
			Derived:       DeriveStatus(stages, drift),
			ChildCount:    len(children[node.ID]),
			FeatureCount:  count,
			OpenQuestions: questions,
		})
	}
	return rows
}

// Migrating reports whether the node has a migration state.
func (n Node) Migrating() bool {
	return n.MigrationFrom != "" || n.MigrationTo != ""
}
