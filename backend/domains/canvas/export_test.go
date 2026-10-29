package canvas

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/domains/structure"
)

func TestExportNodeLinkShape(t *testing.T) {
	body, err := Export(Graph{
		Nodes: []Node{
			{ID: "s", Kind: KindSystem, Label: "API", Props: map[string]any{"tier": "edge"}, Ref: &Ref{Kind: RefNode, ID: "structure-1"}},
			{ID: "n", Kind: KindNote, Label: "later"},
		},
		Edges: []Edge{{ID: "e", From: "s", To: "n", Kind: EdgeUses, Props: map[string]any{"sync": true}}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(body), "layout") || strings.Contains(string(body), `"from"`) || strings.Contains(string(body), `"edges"`) {
		t.Fatalf("export mixed layout or storage shape into node-link JSON: %s", body)
	}
	var doc map[string]any
	if err := json.Unmarshal(body, &doc); err != nil {
		t.Fatal(err)
	}
	if doc["directed"] != true {
		t.Fatalf("directed = %v", doc["directed"])
	}
	if _, ok := doc["layout"]; ok {
		t.Fatal("layout leaked into export")
	}
	nodes, _ := doc["nodes"].([]any)
	links, _ := doc["links"].([]any)
	if len(nodes) != 2 || len(links) != 1 {
		t.Fatalf("nodes=%d links=%d body=%s", len(nodes), len(links), body)
	}
	first, _ := nodes[0].(map[string]any)
	if first["id"] != "s" || first["kind"] != KindSystem || first["label"] != "API" {
		t.Fatalf("node = %v", first)
	}
	props, _ := first["props"].(map[string]any)
	if props["tier"] != "edge" {
		t.Fatalf("props = %v", props)
	}
	ref, _ := first["ref"].(map[string]any)
	if ref["kind"] != RefNode || ref["id"] != "structure-1" {
		t.Fatalf("ref = %v", ref)
	}
	if first["trust"] != TrustReferenced {
		t.Fatalf("referenced trust = %v", first["trust"])
	}
	second, _ := nodes[1].(map[string]any)
	if _, ok := second["ref"]; ok {
		t.Fatalf("note ref = %v", second["ref"])
	}
	if second["trust"] != TrustUnverified {
		t.Fatalf("unverified trust = %v", second["trust"])
	}
	link, _ := links[0].(map[string]any)
	if link["id"] != "e" || link["source"] != "s" || link["target"] != "n" || link["kind"] != EdgeUses {
		t.Fatalf("link = %v", link)
	}
	linkProps, _ := link["props"].(map[string]any)
	if linkProps["sync"] != true {
		t.Fatalf("link props = %v", linkProps)
	}
}

func TestExportOmitsStyle(t *testing.T) {
	body, err := Export(Graph{Nodes: []Node{
		{ID: "r", Kind: "database", Props: map[string]any{"style": map[string]any{"fill": "blue"}, "technology": "Postgres"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(body), "style") || !strings.Contains(string(body), "Postgres") {
		t.Fatalf("export = %s", body)
	}
}

func TestExportEmptyGraph(t *testing.T) {
	body, err := Export(Graph{})
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Directed bool
		Nodes    []any
		Links    []any
	}
	if err := json.Unmarshal(body, &doc); err != nil {
		t.Fatal(err)
	}
	if !doc.Directed || doc.Nodes == nil || doc.Links == nil || len(doc.Nodes) != 0 || len(doc.Links) != 0 {
		t.Fatalf("empty export = %s", body)
	}
}

func TestExportTrustClearsEmptyRef(t *testing.T) {
	body, err := Export(Graph{Nodes: []Node{
		{ID: "a", Kind: KindNote, Label: "n", Ref: &Ref{}},
		{ID: "b", Kind: KindNote, Label: "y", Ref: &Ref{Kind: RefFact, ID: "f1"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Nodes []struct {
			ID    string
			Trust string
			Ref   *Ref
		}
	}
	if err := json.Unmarshal(body, &doc); err != nil {
		t.Fatal(err)
	}
	if doc.Nodes[0].Trust != TrustUnverified || doc.Nodes[0].Ref != nil {
		t.Fatalf("empty ref = %+v", doc.Nodes[0])
	}
	if doc.Nodes[1].Trust != TrustReferenced || doc.Nodes[1].Ref == nil || doc.Nodes[1].Ref.ID != "f1" {
		t.Fatalf("fact ref = %+v", doc.Nodes[1])
	}
}

func TestExportMermaidAndDot(t *testing.T) {
	graph := Graph{
		Nodes: []Node{
			{ID: "s", Kind: KindSystem, Label: "API", Ref: &Ref{Kind: RefNode, ID: "structure-1"}},
			{ID: "n", Kind: KindNote, Label: "later"},
		},
		Edges: []Edge{{ID: "e", From: "s", To: "n", Kind: EdgeUses}},
	}
	mermaid := ExportMermaid(graph)
	wantMermaid := "flowchart LR\n  s[\"API (referenced)\"]\n  n[\"later (unverified)\"]\n  s -->|\"uses\"| n\n"
	if mermaid != wantMermaid {
		t.Fatalf("mermaid =\n%s", mermaid)
	}
	dot := ExportDot(graph)
	wantDot := "digraph canvas {\n  rankdir=LR;\n  \"s\" [label=\"API\" kind=\"system\" trust=\"referenced\"];\n  \"n\" [label=\"later\" kind=\"note\" trust=\"unverified\"];\n  \"s\" -> \"n\" [label=\"uses\"];\n}\n"
	if dot != wantDot {
		t.Fatalf("dot =\n%s", dot)
	}
	if strings.Contains(mermaid, "layout") || strings.Contains(dot, "layout") {
		t.Fatal("layout leaked into a diagram export")
	}
	if _, err := ExportFormat(graph, "yaml"); err == nil {
		t.Fatal("expected unknown format")
	}
	text, err := ExportFormat(graph, "json")
	if err != nil || !strings.Contains(text, `"trust":"referenced"`) || strings.Contains(text, "layout") {
		t.Fatalf("json format = %s err=%v", text, err)
	}
}

func TestExportMermaidSanitizesIDs(t *testing.T) {
	text := ExportMermaid(Graph{
		Nodes: []Node{
			{ID: "a-b", Kind: "idea", Label: `say "hi"`},
			{ID: "a_b", Kind: "idea", Label: "Two"},
			{ID: "end", Kind: "end", Label: "Stop"},
			{ID: "9x", Kind: "idea", Label: "Nine"},
		},
		Edges: []Edge{{ID: "e", From: "end", To: "9x", Kind: "uses|sync"}},
	})
	for _, want := range []string{
		"flowchart LR\n",
		"  a_b[\"say #quot;hi#quot; (unverified)\"]\n",
		"  a_b_2[",
		"  n_end[",
		"  n_9x[",
		`n_end -->|"uses|sync"| n_9x`,
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("missing %q in\n%s", want, text)
		}
	}
	dot := ExportDot(Graph{Nodes: []Node{{ID: `a"b`, Kind: KindNote, Label: "line\n2"}}})
	if !strings.Contains(dot, "label=\"line\\n2\"") || !strings.Contains(dot, "a\\\"b") || !strings.Contains(dot, "trust=\"unverified\"") {
		t.Fatalf("dot escape =\n%s", dot)
	}
}

func TestMarshalGraphKeepsStorageShape(t *testing.T) {
	raw, err := MarshalGraph(Graph{
		Nodes: []Node{{ID: "a", Kind: "idea", Label: "One"}},
		Edges: []Edge{{ID: "e", From: "a", To: "a", Kind: EdgeRelates}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(raw, `"source"`) || strings.Contains(raw, "layout") {
		t.Fatalf("stored graph = %s", raw)
	}
	graph, err := UnmarshalGraph(raw)
	if err != nil || len(graph.Edges) != 1 || graph.Edges[0].From != "a" || graph.Edges[0].To != "a" {
		t.Fatalf("round trip = %+v err=%v", graph, err)
	}
}

func TestWithStructureLetsTheLinkedNodeWin(t *testing.T) {
	graph := Graph{Nodes: []Node{
		{ID: "a", Kind: "service", Label: "Old", Props: map[string]any{"technology": "Node.js"}, Ref: &Ref{Kind: RefNode, ID: "db"}},
		{ID: "b", Kind: KindComponent, Label: "Box", Ref: &Ref{Kind: RefNode, ID: "db"}},
		{ID: "c", Kind: "cache", Label: "Free", Props: map[string]any{"technology": "Redis"}},
		{ID: "d", Kind: "queue", Label: "Gone", Ref: &Ref{Kind: RefNode, ID: "missing"}},
	}}
	nodes := []structure.Node{{ID: "db", Title: "Database", Kind: "database", Tech: "Postgres", Status: structure.NodeActive}}
	out := WithStructure(graph, nodes)
	if a := out.Nodes[0]; a.Kind != "database" || a.Label != "Database" || a.Props["technology"] != "Postgres" {
		t.Fatalf("linked component = %+v", a)
	}
	if b := out.Nodes[1]; b.Kind != KindComponent || b.Label != "Database" || b.Props["technology"] != "Postgres" {
		t.Fatalf("structure kind keeps its kind: %+v", b)
	}
	if c, d := out.Nodes[2], out.Nodes[3]; c.Props["technology"] != "Redis" || d.Label != "Gone" || d.Kind != "queue" {
		t.Fatalf("unlinked nodes change: %+v %+v", c, d)
	}
	if graph.Nodes[0].Props["technology"] != "Node.js" || graph.Nodes[0].Label != "Old" {
		t.Fatal("WithStructure must not change its input")
	}
}
