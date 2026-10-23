package canon

import (
	"encoding/json"
	"strings"
)

// ParseLayoutNodes extracts component refs from architecture layout body_json.
// Supports formatVersion 1 (name) and legacy seed (label).
func ParseLayoutNodes(bodyJSON string) []LayoutNode {
	if strings.TrimSpace(bodyJSON) == "" {
		return nil
	}
	var doc struct {
		Nodes []map[string]any `json:"nodes"`
	}
	if err := json.Unmarshal([]byte(bodyJSON), &doc); err != nil {
		return nil
	}
	out := make([]LayoutNode, 0, len(doc.Nodes))
	for _, node := range doc.Nodes {
		id, _ := node["id"].(string)
		if id == "" {
			continue
		}
		title := stringField(node, "name")
		if title == "" {
			title = stringField(node, "label")
		}
		if title == "" {
			title = id
		}
		out = append(out, LayoutNode{ID: id, Title: title})
	}
	return out
}

// LayoutEdge is a canvas relationship projected into canon_relationships.
type LayoutEdge struct {
	SourceNodeID string
	TargetNodeID string
	Predicate    string
	Evidence     bool
}

// ParseLayoutEdges extracts edges from architecture layout body_json.
// Supports formatVersion 1 relationships[] and legacy edges[].
func ParseLayoutEdges(bodyJSON string) []LayoutEdge {
	if strings.TrimSpace(bodyJSON) == "" {
		return nil
	}
	var doc struct {
		Relationships []map[string]any `json:"relationships"`
		Edges         []map[string]any `json:"edges"`
	}
	if err := json.Unmarshal([]byte(bodyJSON), &doc); err != nil {
		return nil
	}

	out := make([]LayoutEdge, 0, len(doc.Relationships)+len(doc.Edges))
	for _, rel := range doc.Relationships {
		source := stringField(rel, "sourceNodeId")
		target := stringField(rel, "targetNodeId")
		if source == "" || target == "" {
			continue
		}
		out = append(out, LayoutEdge{
			SourceNodeID: source,
			TargetNodeID: target,
			Predicate:    PredicateForCanvasType(stringField(rel, "type")),
			Evidence:     evidenceField(rel),
		})
	}
	for _, edge := range doc.Edges {
		source := stringField(edge, "from")
		target := stringField(edge, "to")
		if source == "" || target == "" {
			continue
		}
		kind := stringField(edge, "kind")
		if kind == "" {
			kind = stringField(edge, "type")
		}
		out = append(out, LayoutEdge{
			SourceNodeID: source,
			TargetNodeID: target,
			Predicate:    PredicateForCanvasType(kind),
			Evidence:     evidenceField(edge),
		})
	}
	return out
}

// PredicateForCanvasType maps canvas relationship types to Canon predicates.
func PredicateForCanvasType(canvasType string) string {
	switch strings.ToLower(strings.TrimSpace(canvasType)) {
	case "depends_on", "hosted_on", "deployed_on", "stores_in", "deploys_to",
		"reads_from", "writes_to", "consumes_from", "publishes_to":
		return PredDependsOn
	case "calls", "routes_to", "connects_to", "authenticates_with":
		return PredCalls
	default:
		return PredRelatedTo
	}
}

func stringField(node map[string]any, key string) string {
	value, _ := node[key].(string)
	return strings.TrimSpace(value)
}

// evidenceField defaults to true when the key is omitted (intentional declared edge).
func evidenceField(node map[string]any) bool {
	raw, ok := node["evidence"]
	if !ok || raw == nil {
		return true
	}
	switch typed := raw.(type) {
	case bool:
		return typed
	case float64:
		return typed != 0
	case string:
		switch strings.ToLower(strings.TrimSpace(typed)) {
		case "false", "0", "no":
			return false
		default:
			return true
		}
	default:
		return true
	}
}
