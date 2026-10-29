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

func TestRegistryHasOneGeneralistType(t *testing.T) {
	types := Types()
	if len(types) != 1 || types[0].Type != TypeCanvas || types[0].Unrestricted {
		t.Fatalf("types = %+v", types)
	}
	for _, kind := range []string{"database", "frontend", "llm", "agent", "secrets", "pipeline", "dataset", KindSystem, "cylinder", "frame", KindNote, KindText} {
		if !contains(types[0].NodeKinds, kind) {
			t.Fatalf("palette missing node %s: %v", kind, types[0].NodeKinds)
		}
	}
	for _, kind := range []string{EdgeRelates, EdgeCalls, EdgeContains} {
		if !contains(types[0].EdgeKinds, kind) {
			t.Fatalf("palette missing edge %s: %v", kind, types[0].EdgeKinds)
		}
	}
}

func TestValidateCanvas(t *testing.T) {
	structure := &Ref{Kind: RefNode, ID: "structure-1"}
	mustValid(t, TypeCanvas, Graph{
		Nodes: []Node{
			{ID: "s", Kind: KindSystem, Label: "App", Ref: structure},
			{ID: "web", Kind: "frontend", Label: "Web", Props: map[string]any{"technology": "React"}},
			{ID: "db", Kind: "database", Label: "Main", Props: map[string]any{"technology": "Postgres"}, Ref: &Ref{Kind: RefNode, ID: "structure-2"}},
			{ID: "r", Kind: "rectangle", Label: "box"},
			{ID: "n", Kind: KindNote, Label: "later"},
			{ID: "t", Kind: KindText, Label: "body"},
		},
		Edges: []Edge{
			{ID: "e1", From: "web", To: "db", Kind: EdgeReads},
			{ID: "e2", From: "s", To: "web", Kind: EdgeContains},
		},
	})
	mustReject(t, TypeCanvas, Graph{Nodes: []Node{{ID: "s", Kind: KindSystem}}}, "structure node")
	mustReject(t, TypeCanvas, Graph{Nodes: []Node{{ID: "s", Kind: KindDomain, Ref: &Ref{Kind: RefCard, ID: "card-1"}}}}, "structure node")
	mustReject(t, TypeCanvas, Graph{Nodes: []Node{{ID: "x", Kind: "spaceship"}}}, "not allowed")
	mustReject(t, TypeCanvas, Graph{
		Nodes: []Node{{ID: "a", Kind: "api"}},
		Edges: []Edge{{ID: "e", From: "a", To: "a", Kind: "scribble"}},
	}, "not allowed")
	mustReject(t, TypeCanvas, Graph{Nodes: []Node{{ID: "a", Kind: "api"}, {ID: "a", Kind: "api"}}}, "duplicate id")
	mustReject(t, TypeCanvas, Graph{
		Nodes: []Node{{ID: "a", Kind: "api"}},
		Edges: []Edge{{ID: "e", From: "missing", To: "a", Kind: EdgeCalls}},
	}, "does not match a node")
	mustReject(t, TypeCanvas, Graph{Nodes: []Node{{ID: "a", Kind: "api", Ref: &Ref{Kind: "widget", ID: "w"}}}}, "not a card")
}

func TestPrepareDefaultsTypeAndRejectsNameAndLayout(t *testing.T) {
	if _, err := Prepare(Canvas{}); err != ErrNameRequired {
		t.Fatalf("name: %v", err)
	}
	if _, err := Prepare(Canvas{Name: "Map", Type: "poster"}); err == nil || !strings.Contains(err.Error(), "poster") {
		t.Fatalf("type: %v", err)
	}
	if _, err := Prepare(Canvas{Name: "Map", LayoutJSON: "{"}); err != ErrLayout {
		t.Fatalf("layout: %v", err)
	}
	item, err := Prepare(Canvas{Name: " Map ", LayoutJSON: "  "})
	if err != nil || item.Name != "Map" || item.Type != TypeCanvas || item.LayoutJSON != "{}" {
		t.Fatalf("prepare = %+v err=%v", item, err)
	}
}
