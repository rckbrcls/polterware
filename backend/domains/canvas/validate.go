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

// Validate checks graph against def. Note and text nodes skip structural
// rules. Free (Unrestricted) has no kind or structural rules. The result is
// empty when the graph is valid. Layout is not an input.
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
				add(refWhere, fmt.Sprintf("kind %q is not a card, decision, fact, evidence, or node", node.Ref.Kind))
			}
			if node.Ref.ID == "" {
				add(refWhere, "id is required")
			}
		}
		if def.Unrestricted || isAnnotation(node.Kind) {
			continue
		}
		switch def.Type {
		case TypeRoadmap:
			if node.Kind == KindItem && !itemTimed(node.Props) {
				add(where, "item requires start and end, or a quarter")
			}
		case TypeArchitecture:
			if !structureRef(node.Ref) {
				add(where, "requires a ref to a structure node")
			}
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

func isAnnotation(kind string) bool {
	return kind == KindNote || kind == KindText
}

func nodeKindAllowed(def Definition, kind string) bool {
	if def.Unrestricted || isAnnotation(kind) {
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

func itemTimed(props map[string]any) bool {
	if propSet(props, "quarter") {
		return true
	}
	return propSet(props, "start") && propSet(props, "end")
}

func propSet(props map[string]any, key string) bool {
	if props == nil {
		return false
	}
	value, ok := props[key]
	if !ok || value == nil {
		return false
	}
	text, ok := value.(string)
	if !ok {
		return true
	}
	return strings.TrimSpace(text) != ""
}

func structureRef(ref *Ref) bool {
	return ref != nil && ref.Kind == RefNode && ref.ID != ""
}
