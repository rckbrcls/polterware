package canvas

import (
	"fmt"
	"sort"
)

// Relation is an edge between two Structure nodes, read through the canvas
// nodes that cite them. How the project's parts relate lives only here: a
// Structure node declares no dependencies of its own.
type Relation struct {
	From      string // Structure node id
	To        string // Structure node id
	Kind      string
	FromLabel string
	ToLabel   string
}

func (r Relation) key() string { return r.From + "\x00" + r.To + "\x00" + r.Kind }

// Relations lists the graph's edges whose two ends cite a Structure node,
// once each, in a stable order.
func Relations(graph Graph) []Relation {
	cites := map[string]Node{}
	for _, node := range graph.Nodes {
		if structureRef(node.Ref) {
			cites[node.ID] = node
		}
	}
	seen := map[string]bool{}
	var out []Relation
	for _, edge := range graph.Edges {
		from, okFrom := cites[edge.From]
		to, okTo := cites[edge.To]
		if !okFrom || !okTo {
			continue
		}
		relation := Relation{From: from.Ref.ID, To: to.Ref.ID, Kind: edge.Kind, FromLabel: from.Label, ToLabel: to.Label}
		if seen[relation.key()] {
			continue
		}
		seen[relation.key()] = true
		out = append(out, relation)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].key() < out[j].key() })
	return out
}

// RelationChanges compares the relations of two versions of a canvas.
func RelationChanges(before, after Graph) (added, removed []Relation) {
	old, next := map[string]bool{}, map[string]bool{}
	for _, relation := range Relations(before) {
		old[relation.key()] = true
	}
	for _, relation := range Relations(after) {
		next[relation.key()] = true
		if !old[relation.key()] {
			added = append(added, relation)
		}
	}
	for _, relation := range Relations(before) {
		if !next[relation.key()] {
			removed = append(removed, relation)
		}
	}
	return added, removed
}

// RelationSummary names one changed relation ("Connect CLI → API (calls)")
// or counts several.
func RelationSummary(added, removed []Relation) string {
	switch {
	case len(added) == 1 && len(removed) == 0:
		return fmt.Sprintf("Connect %s → %s (%s)", added[0].FromLabel, added[0].ToLabel, added[0].Kind)
	case len(added) == 0 && len(removed) == 1:
		return fmt.Sprintf("Disconnect %s → %s (%s)", removed[0].FromLabel, removed[0].ToLabel, removed[0].Kind)
	default:
		return fmt.Sprintf("Change %d relations", len(added)+len(removed))
	}
}

// RelationSubjects are the Structure nodes a set of changed relations touch.
func RelationSubjects(added, removed []Relation) []string {
	seen := map[string]bool{}
	var out []string
	for _, relation := range append(append([]Relation{}, added...), removed...) {
		for _, id := range []string{relation.From, relation.To} {
			if !seen[id] {
				seen[id] = true
				out = append(out, id)
			}
		}
	}
	return out
}
