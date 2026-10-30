// Package structure is the project graph above Work cards: the project is the
// root, with domains under it and components under a domain or loose. Features stay cards. Status is derived when the graph is read.
package structure

const (
	LevelDomain    = "domain"
	LevelComponent = "component"

	NodeActive  = "active"
	NodeRemoved = "removed"

	StatusProposed   = "proposed"
	StatusInProgress = "in_progress"
	StatusDelivered  = "delivered"
)

// Levels lists node levels from the top of the graph down to a component.
var Levels = []string{LevelDomain, LevelComponent}

// ValidLevel reports whether level is domain or component.
func ValidLevel(level string) bool {
	for _, item := range Levels {
		if item == level {
			return true
		}
	}
	return false
}

// ParentLevel is the level a node's parent has. A domain has none: it sits
// under the project.
func ParentLevel(level string) (string, bool) {
	switch level {
	case LevelComponent:
		return LevelDomain, true
	default:
		return "", false
	}
}

// AllowedParent reports whether a node at level may sit under a parent at
// parentLevel. Only a component has a parent: a domain. With none, it sits
// loose under the project.
func AllowedParent(level, parentLevel string) bool {
	want, ok := ParentLevel(level)
	return ok && want == parentLevel
}

// Node is one Structure node. The Rules that hold for it live apart, with the
// node among their contexts.
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
	// Kind is what a component is (see ComponentKinds); other levels have none.
	Kind string
	// Tech is the free-text technology (`Go`, `Postgres`), the canvas technology prop.
	Tech string
	// MigrationFrom and MigrationTo describe a node moving between designs.
	// Both empty means it is not migrating.
	MigrationFrom string
	MigrationTo   string
}

// Feature is a Work card reduced to what status derivation needs.
type Feature struct {
	Slug          string
	Title         string
	Under         string
	Stage         string
	OpenQuestions int
}

// Row is a node plus the status and counts derived from its descendants.
type Row struct {
	Node
	Derived       string
	ChildCount    int
	FeatureCount  int
	OpenQuestions int
}

// DeriveStatus reports proposed, in_progress, or delivered. No features is
// proposed. Every feature delivered is delivered.
func DeriveStatus(stages []string) string {
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
		questions := 0
		count := 0
		for _, feature := range features {
			if feature.Under == "" || !paths[feature.Under] {
				continue
			}
			count++
			stages = append(stages, feature.Stage)
			questions += feature.OpenQuestions
		}
		rows = append(rows, Row{
			Node:          node,
			Derived:       DeriveStatus(stages),
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
