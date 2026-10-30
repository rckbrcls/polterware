package canvas

import (
	"reflect"
	"testing"
)

func relationGraph(edges ...Edge) Graph {
	return Graph{
		Nodes: []Node{
			{ID: "a", Kind: KindComponent, Label: "CLI", Ref: &Ref{Kind: RefNode, ID: "cli"}},
			{ID: "b", Kind: KindComponent, Label: "API", Ref: &Ref{Kind: RefNode, ID: "api"}},
			{ID: "n", Kind: KindNote, Label: "idea"},
		},
		Edges: edges,
	}
}

func TestRelationChangesListOnlyEdgesBetweenStructureNodes(t *testing.T) {
	before := relationGraph(Edge{ID: "e0", From: "n", To: "b", Kind: EdgeRelates})
	after := relationGraph(
		Edge{ID: "e0", From: "n", To: "b", Kind: EdgeRelates},
		Edge{ID: "e1", From: "a", To: "b", Kind: EdgeCalls},
	)
	added, removed := RelationChanges(before, after)
	if len(added) != 1 || len(removed) != 0 {
		t.Fatalf("added %+v removed %+v", added, removed)
	}
	if got := RelationSummary(added, removed); got != "Connect CLI → API (calls)" {
		t.Fatalf("summary = %q", got)
	}
	if got := RelationSubjects(added, removed); !reflect.DeepEqual(got, []string{"cli", "api"}) {
		t.Fatalf("subjects = %v", got)
	}
	added, removed = RelationChanges(after, before)
	if got := RelationSummary(added, removed); got != "Disconnect CLI → API (calls)" {
		t.Fatalf("summary = %q", got)
	}
}

func TestRelationChangesIgnoreMovesAndRedrawnEdges(t *testing.T) {
	before := relationGraph(Edge{ID: "e1", From: "a", To: "b", Kind: EdgeCalls})
	// The same relation drawn again under a new edge id is no change.
	after := relationGraph(Edge{ID: "e9", From: "a", To: "b", Kind: EdgeCalls})
	if added, removed := RelationChanges(before, after); len(added)+len(removed) != 0 {
		t.Fatalf("added %+v removed %+v", added, removed)
	}
}
