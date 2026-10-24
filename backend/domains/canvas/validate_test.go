package canvas

import (
	"strings"
	"testing"
)

func def(t *testing.T, typ string) Definition {
	t.Helper()
	item, ok := Lookup(typ)
	if !ok {
		t.Fatalf("missing type %s", typ)
	}
	return item
}

func violations(t *testing.T, typ string, graph Graph) string {
	t.Helper()
	return FormatViolations(Validate(def(t, typ), graph))
}

func mustValid(t *testing.T, typ string, graph Graph) {
	t.Helper()
	if got := violations(t, typ, graph); got != "" {
		t.Fatalf("%s rejected a valid graph: %s", typ, got)
	}
}

func mustReject(t *testing.T, typ string, graph Graph, fragment string) {
	t.Helper()
	got := violations(t, typ, graph)
	if got == "" {
		t.Fatalf("%s accepted graph, want a violation containing %q", typ, fragment)
	}
	if !strings.Contains(got, fragment) {
		t.Fatalf("%s violation %q, want fragment %q", typ, got, fragment)
	}
}

func TestRegistryPalettes(t *testing.T) {
	types := Types()
	if len(types) != 6 {
		t.Fatalf("types = %d", len(types))
	}
	wantNodes := map[string][]string{
		TypeFree:         nil,
		TypeArchitecture: {KindSystem, KindDomain, KindComponent, KindService, KindDatabase, KindQueue},
		TypeRoadmap:      {KindLane, KindMilestone, KindItem},
		TypeFlow:         {KindStep, KindDecision, KindStart, KindEnd},
		TypeBrainstorm:   {KindIdea, KindGroup},
		TypeIdeas:        {KindIdea, KindGroup},
	}
	wantEdges := map[string][]string{
		TypeFree:         nil,
		TypeArchitecture: {EdgeUses, EdgeContains},
		TypeRoadmap:      {EdgeDependsOn, EdgePrecedes},
		TypeFlow:         {EdgeNext},
		TypeBrainstorm:   {EdgeRelates, EdgeContains},
		TypeIdeas:        {EdgeRelates, EdgeContains},
	}
	for _, item := range types {
		if item.Type == TypeFree && !item.Unrestricted {
			t.Fatal("free must be unrestricted")
		}
		if item.Type != TypeFree && item.Unrestricted {
			t.Fatalf("%s must not be unrestricted", item.Type)
		}
		for _, kind := range append(wantNodes[item.Type], KindNote, KindText) {
			if !contains(item.NodeKinds, kind) {
				t.Fatalf("%s palette missing node %s: %v", item.Type, kind, item.NodeKinds)
			}
		}
		for _, kind := range wantEdges[item.Type] {
			if !contains(item.EdgeKinds, kind) {
				t.Fatalf("%s palette missing edge %s: %v", item.Type, kind, item.EdgeKinds)
			}
		}
	}
}

func TestValidatePerType(t *testing.T) {
	structure := &Ref{Kind: RefNode, ID: "atlas-1"}
	mustValid(t, TypeArchitecture, Graph{
		Nodes: []Node{
			{ID: "s", Kind: KindSystem, Label: "App", Ref: structure},
			{ID: "d", Kind: KindDomain, Ref: &Ref{Kind: RefNode, ID: "atlas-2"}},
			{ID: "c", Kind: KindComponent, Ref: &Ref{Kind: RefNode, ID: "atlas-3"}},
			{ID: "svc", Kind: KindService, Ref: &Ref{Kind: RefNode, ID: "atlas-4"}},
			{ID: "db", Kind: KindDatabase, Ref: &Ref{Kind: RefNode, ID: "atlas-5"}},
			{ID: "q", Kind: KindQueue, Ref: &Ref{Kind: RefNode, ID: "atlas-6"}},
			{ID: "n", Kind: KindNote, Label: "later"},
		},
		Edges: []Edge{
			{ID: "e1", From: "s", To: "svc", Kind: EdgeUses},
			{ID: "e2", From: "s", To: "d", Kind: EdgeContains},
		},
	})
	mustReject(t, TypeArchitecture, Graph{Nodes: []Node{{ID: "s", Kind: KindSystem}}}, "structure node")
	mustReject(t, TypeArchitecture, Graph{Nodes: []Node{{ID: "s", Kind: KindSystem, Ref: &Ref{Kind: RefCard, ID: "card-1"}}}}, "structure node")
	mustReject(t, TypeArchitecture, Graph{Nodes: []Node{{ID: "s", Kind: "worker", Ref: structure}}}, "not allowed")
	mustReject(t, TypeArchitecture, Graph{
		Nodes: []Node{{ID: "s", Kind: KindSystem, Ref: structure}, {ID: "db", Kind: KindDatabase, Ref: structure}},
		Edges: []Edge{{ID: "e", From: "s", To: "db", Kind: EdgeNext}},
	}, "not allowed")

	mustValid(t, TypeRoadmap, Graph{
		Nodes: []Node{
			{ID: "lane", Kind: KindLane, Label: "Platform"},
			{ID: "ms", Kind: KindMilestone, Label: "Beta"},
			{ID: "a", Kind: KindItem, Label: "Import", Props: map[string]any{"start": "2026-01-01", "end": "2026-02-01"}},
			{ID: "b", Kind: KindItem, Label: "Ship", Props: map[string]any{"quarter": "2026Q2"}},
			{ID: "n", Kind: KindText, Label: "note"},
		},
		Edges: []Edge{
			{ID: "e1", From: "a", To: "b", Kind: EdgeDependsOn},
			{ID: "e2", From: "a", To: "ms", Kind: EdgePrecedes},
		},
	})
	mustReject(t, TypeRoadmap, Graph{Nodes: []Node{{ID: "a", Kind: KindItem, Props: map[string]any{"start": "2026-01-01"}}}}, "quarter")
	mustReject(t, TypeRoadmap, Graph{Nodes: []Node{{ID: "a", Kind: KindItem, Props: map[string]any{"quarter": "  "}}}}, "quarter")
	mustReject(t, TypeRoadmap, Graph{Nodes: []Node{{ID: "db", Kind: KindDatabase}}}, "not allowed")
	mustReject(t, TypeRoadmap, Graph{
		Nodes: []Node{{ID: "a", Kind: KindItem, Props: map[string]any{"quarter": "2026Q1"}}, {ID: "n", Kind: KindNote}},
		Edges: []Edge{{ID: "e", From: "n", To: "a", Kind: EdgeUses}},
	}, "not allowed")

	mustValid(t, TypeFlow, Graph{
		Nodes: []Node{
			{ID: "s", Kind: KindStart},
			{ID: "a", Kind: KindStep, Label: "Lint"},
			{ID: "d", Kind: KindDecision, Label: "Green?"},
			{ID: "e", Kind: KindEnd},
			{ID: "n", Kind: KindNote},
		},
		Edges: []Edge{
			{ID: "e1", From: "s", To: "a", Kind: EdgeNext},
			{ID: "e2", From: "a", To: "d", Kind: EdgeNext},
			{ID: "e3", From: "d", To: "e", Kind: EdgeNext},
		},
	})
	mustReject(t, TypeFlow, Graph{Nodes: []Node{{ID: "a", Kind: KindLane}}}, "not allowed")
	mustReject(t, TypeFlow, Graph{
		Nodes: []Node{{ID: "s", Kind: KindStart}, {ID: "e", Kind: KindEnd}},
		Edges: []Edge{{ID: "e", From: "s", To: "e", Kind: EdgeDependsOn}},
	}, "not allowed")

	for _, typ := range []string{TypeBrainstorm, TypeIdeas} {
		mustValid(t, typ, Graph{
			Nodes: []Node{
				{ID: "g", Kind: KindGroup, Label: "Auth"},
				{ID: "i", Kind: KindIdea, Label: "Passkeys"},
				{ID: "n", Kind: KindNote},
			},
			Edges: []Edge{
				{ID: "e1", From: "g", To: "i", Kind: EdgeContains},
				{ID: "e2", From: "i", To: "i", Kind: EdgeRelates},
			},
		})
		mustReject(t, typ, Graph{Nodes: []Node{{ID: "a", Kind: KindStep}}}, "not allowed")
	}

	mustValid(t, TypeFree, Graph{
		Nodes: []Node{{ID: "x", Kind: "sticky", Label: "Hi", Ref: &Ref{Kind: RefCard, ID: "card-1"}}},
		Edges: []Edge{{ID: "e", From: "x", To: "x", Kind: "scribble"}},
	})
	mustReject(t, TypeFree, Graph{
		Nodes: []Node{{ID: "a", Kind: "sticky"}, {ID: "a", Kind: "other"}},
	}, "duplicate id")
	mustReject(t, TypeFree, Graph{
		Nodes: []Node{{ID: "a", Kind: "sticky"}},
		Edges: []Edge{{ID: "e", From: "missing", To: "a", Kind: "scribble"}},
	}, "does not match a node")
	mustReject(t, TypeFree, Graph{
		Nodes: []Node{{ID: "a", Kind: "sticky", Ref: &Ref{Kind: "widget", ID: "w"}}},
	}, "not a card")
}

func TestNoteAndTextSkipStructuralRules(t *testing.T) {
	for _, typ := range []string{TypeArchitecture, TypeRoadmap, TypeFlow, TypeBrainstorm, TypeIdeas, TypeFree} {
		mustValid(t, typ, Graph{Nodes: []Node{
			{ID: "n", Kind: KindNote, Label: "remember"},
			{ID: "t", Kind: KindText, Label: "body"},
		}})
	}
}

func TestPrepareRejectsNameTypeAndLayout(t *testing.T) {
	if _, err := Prepare(Canvas{Type: TypeFree}); err != ErrNameRequired {
		t.Fatalf("name: %v", err)
	}
	if _, err := Prepare(Canvas{Name: "Map", Type: "poster"}); err == nil || !strings.Contains(err.Error(), "poster") {
		t.Fatalf("type: %v", err)
	}
	if _, err := Prepare(Canvas{Name: "Map", Type: TypeFree, LayoutJSON: "{"}); err != ErrLayout {
		t.Fatalf("layout: %v", err)
	}
	item, err := Prepare(Canvas{Name: " Map ", Type: TypeFree, LayoutJSON: "  "})
	if err != nil || item.Name != "Map" || item.LayoutJSON != "{}" {
		t.Fatalf("prepare = %+v err=%v", item, err)
	}
}

func TestItemQuarterNumberCounts(t *testing.T) {
	mustValid(t, TypeRoadmap, Graph{Nodes: []Node{{ID: "a", Kind: KindItem, Props: map[string]any{"quarter": 3}}}})
}
