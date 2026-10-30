package canvas

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Violation is one reason a graph does not match its canvas type.
type Violation struct {
	Where   string
	Message string
}

// FormatViolations joins violations as "where: message" clauses.
func FormatViolations(list []Violation) string {
	parts := make([]string, 0, len(list))
	for _, item := range list {
		if item.Where == "" {
			parts = append(parts, item.Message)
			continue
		}
		parts = append(parts, item.Where+": "+item.Message)
	}
	return strings.Join(parts, "; ")
}

// Validate checks graph against def. Only structure kinds (system, domain,
// component) must ref a structure node; components and freeform nodes may
// omit a ref. Unrestricted skips kind checks. The result is empty when the
// graph is valid. Layout is not an input.
func Validate(def Definition, graph Graph) []Violation {
	var found []Violation
	add := func(where, message string) {
		found = append(found, Violation{Where: where, Message: message})
	}
	if def.Type == "" {
		add("type", "canvas type is required")
		return found
	}

	ids := map[string]bool{}
	for i, node := range graph.Nodes {
		where := fmt.Sprintf("nodes[%d]", i)
		if node.ID == "" {
			add(where, "id is required")
		} else if ids[node.ID] {
			add(where, fmt.Sprintf("duplicate id %q", node.ID))
		} else {
			ids[node.ID] = true
		}
		if node.Kind == "" {
			add(where, "kind is required")
		} else if !nodeKindAllowed(def, node.Kind) {
			add(where, fmt.Sprintf("kind %q is not allowed on a %s canvas", node.Kind, def.Type))
		}
		if node.Ref != nil {
			refWhere := where + ".ref"
			if !ValidRefKind(node.Ref.Kind) {
				add(refWhere, fmt.Sprintf("kind %q is not a card, decision, fact, or node", node.Ref.Kind))
			}
			if node.Ref.ID == "" {
				add(refWhere, "id is required")
			}
		}
		if contains(StructureKinds, node.Kind) && !structureRef(node.Ref) {
			add(where, "requires a ref to a structure node")
		}
	}

	edgeIDs := map[string]bool{}
	for i, edge := range graph.Edges {
		where := fmt.Sprintf("edges[%d]", i)
		if edge.ID == "" {
			add(where, "id is required")
		} else if edgeIDs[edge.ID] {
			add(where, fmt.Sprintf("duplicate id %q", edge.ID))
		} else {
			edgeIDs[edge.ID] = true
		}
		if edge.Kind == "" {
			add(where, "kind is required")
		} else if !edgeKindAllowed(def, edge.Kind) {
			add(where, fmt.Sprintf("kind %q is not allowed on a %s canvas", edge.Kind, def.Type))
		}
		if edge.From == "" {
			add(where, "from is required")
		} else if !ids[edge.From] {
			add(where, fmt.Sprintf("from %q does not match a node", edge.From))
		}
		if edge.To == "" {
			add(where, "to is required")
		} else if !ids[edge.To] {
			add(where, fmt.Sprintf("to %q does not match a node", edge.To))
		}
	}
	return found
}

// Prepare trims identity fields, defaults an empty layout to "{}", and
// validates the graph against the canvas type. Layout is checked only as JSON.
func Prepare(item Canvas) (Canvas, error) {
	item.Name = strings.TrimSpace(item.Name)
	item.Type = strings.TrimSpace(item.Type)
	if item.Type == "" {
		item.Type = TypeCanvas
	}
	item.ScopeNodeID = strings.TrimSpace(item.ScopeNodeID)
	item.ID = strings.TrimSpace(item.ID)
	item.ProjectID = strings.TrimSpace(item.ProjectID)
	if item.Name == "" {
		return Canvas{}, ErrNameRequired
	}
	def, ok := Lookup(item.Type)
	if !ok {
		return Canvas{}, fmt.Errorf("%w %q", ErrUnknownType, item.Type)
	}
	layout := strings.TrimSpace(item.LayoutJSON)
	if layout == "" {
		layout = "{}"
	}
	if !json.Valid([]byte(layout)) {
		return Canvas{}, ErrLayout
	}
	item.LayoutJSON = layout
	item.Graph = normalize(item.Graph)
	if violations := Validate(def, item.Graph); len(violations) > 0 {
		return Canvas{}, fmt.Errorf("%w: %s", ErrInvalidGraph, FormatViolations(violations))
	}
	return item, nil
}

func isFreeform(kind string) bool {
	return kind == KindNote || kind == KindText || contains(ShapeKinds, kind)
}

func nodeKindAllowed(def Definition, kind string) bool {
	if def.Unrestricted || isFreeform(kind) {
		return true
	}
	return contains(def.NodeKinds, kind)
}

func edgeKindAllowed(def Definition, kind string) bool {
	if def.Unrestricted {
		return true
	}
	return contains(def.EdgeKinds, kind)
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}

func structureRef(ref *Ref) bool {
	return ref != nil && ref.Kind == RefNode && ref.ID != ""
}
