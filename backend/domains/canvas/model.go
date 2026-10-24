// Package canvas is a typed property graph. Layout (positions, sizes, groups)
// is stored beside the graph and is never part of its semantics.
package canvas

import (
	"encoding/json"
	"errors"
	"strings"
	"time"
)

const (
	TypeFree         = "free"
	TypeArchitecture = "architecture"
	TypeRoadmap      = "roadmap"
	TypeFlow         = "flow"
	TypeBrainstorm   = "brainstorm"
	TypeIdeas        = "ideas"

	// Annotations are allowed on every canvas type and skip structural rules.
	KindNote = "note"
	KindText = "text"

	KindLane      = "lane"
	KindMilestone = "milestone"
	KindItem      = "item"

	KindSystem    = "system"
	KindDomain    = "domain"
	KindComponent = "component"
	KindService   = "service"
	KindDatabase  = "database"
	KindQueue     = "queue"

	KindStep     = "step"
	KindDecision = "decision"
	KindStart    = "start"
	KindEnd      = "end"

	KindIdea  = "idea"
	KindGroup = "group"

	EdgeDependsOn = "depends_on"
	EdgePrecedes  = "precedes"
	EdgeUses      = "uses"
	EdgeContains  = "contains"
	EdgeNext      = "next"
	EdgeRelates   = "relates"

	// Entity refs. RefNode is an Atlas structure node.
	RefCard     = "card"
	RefDecision = "decision"
	RefFact     = "fact"
	RefEvidence = "evidence"
	RefNode     = "node"

	// Entity is the change_ops entity name for a canvas write.
	Entity = "canvas"

	OpCreate = "create"
	OpUpdate = "update"
	OpRemove = "remove"
)

var (
	ErrInvalidGraph = errors.New("invalid canvas graph")
	ErrUnknownType  = errors.New("unknown canvas type")
	ErrNameRequired = errors.New("canvas name is required")
	ErrLayout       = errors.New("layout must be JSON")
	ErrUnknownScope = errors.New("unknown scope node")
)

// Ref points at another project entity. It is optional on a node.
type Ref struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
}

// Node is one vertex. Props are semantic; position lives in the layout.
type Node struct {
	ID    string         `json:"id"`
	Kind  string         `json:"kind"`
	Label string         `json:"label"`
	Props map[string]any `json:"props"`
	Ref   *Ref           `json:"ref,omitempty"`
}

// Edge connects From to To. Props are semantic.
type Edge struct {
	ID    string         `json:"id"`
	From  string         `json:"from"`
	To    string         `json:"to"`
	Kind  string         `json:"kind"`
	Props map[string]any `json:"props"`
}

// Graph is the semantic document. It has no positions.
type Graph struct {
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}

// Canvas is one saved surface. LayoutJSON is opaque to the graph.
type Canvas struct {
	ID           string
	ProjectID    string
	Name         string
	Type         string
	AgentVisible bool
	Graph        Graph
	LayoutJSON   string
	ScopeNodeID  string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// ValidRefKind reports whether kind is an entity a node may cite.
func ValidRefKind(kind string) bool {
	switch kind {
	case RefCard, RefDecision, RefFact, RefEvidence, RefNode:
		return true
	default:
		return false
	}
}

// MarshalGraph encodes the semantic graph. Layout is not included.
func MarshalGraph(graph Graph) (string, error) {
	body, err := json.Marshal(normalize(graph))
	if err != nil {
		return "", err
	}
	return string(body), nil
}

// UnmarshalGraph reads a semantic graph. Empty input is an empty graph.
func UnmarshalGraph(raw string) (Graph, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return normalize(Graph{}), nil
	}
	var graph Graph
	if err := json.Unmarshal([]byte(raw), &graph); err != nil {
		return Graph{}, err
	}
	return normalize(graph), nil
}

func normalize(graph Graph) Graph {
	if graph.Nodes == nil {
		graph.Nodes = []Node{}
	}
	if graph.Edges == nil {
		graph.Edges = []Edge{}
	}
	for i := range graph.Nodes {
		node := &graph.Nodes[i]
		node.ID = strings.TrimSpace(node.ID)
		node.Kind = strings.TrimSpace(node.Kind)
		node.Label = strings.TrimSpace(node.Label)
		if node.Props == nil {
			node.Props = map[string]any{}
		}
		if node.Ref != nil {
			node.Ref.Kind = strings.TrimSpace(node.Ref.Kind)
			node.Ref.ID = strings.TrimSpace(node.Ref.ID)
			if node.Ref.Kind == "" && node.Ref.ID == "" {
				node.Ref = nil
			}
		}
	}
	for i := range graph.Edges {
		edge := &graph.Edges[i]
		edge.ID = strings.TrimSpace(edge.ID)
		edge.From = strings.TrimSpace(edge.From)
		edge.To = strings.TrimSpace(edge.To)
		edge.Kind = strings.TrimSpace(edge.Kind)
		if edge.Props == nil {
			edge.Props = map[string]any{}
		}
	}
	return graph
}
