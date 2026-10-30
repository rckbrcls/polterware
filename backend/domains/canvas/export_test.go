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
			{ID: "s", Kind: KindDomain, Label: "API", Props: map[string]any{"tier": "edge"}, Ref: &Ref{Kind: RefNode, ID: "structure-1"}},
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
	if first["id"] != "s" || first["kind"] != KindDomain || first["label"] != "API" {
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

func TestExportMermaidNestsByLayoutAndDropsBlankShapes(t *testing.T) {
	graph := Graph{
		Nodes: []Node{
			{ID: "frame", Kind: "frame", Label: "Backend"},
			{ID: "api", Kind: "service", Label: "API", Props: map[string]any{"technology": "Go", "style": map[string]any{"fill": "red"}}, Ref: &Ref{Kind: RefNode, ID: "c"}},
			{ID: "inner", Kind: "frame", Label: "Workers"},
			{ID: "job", Kind: "worker", Label: "Mailer"},
			{ID: "db", Kind: "database", Label: "Postgres"},
			{ID: "note-frame", Kind: KindNote, Label: "Writes are\nidempotent"},
			{ID: "note-db", Kind: KindNote, Label: "Backups nightly"},
			{ID: "note-linked", Kind: KindNote, Label: "Hot path"},
			{ID: "blank", Kind: "rectangle", Label: ""},
			{ID: "placeholder", Kind: "ellipse", Label: "New ellipse"},
			{ID: "decision", Kind: "diamond", Label: ""},
			{ID: "loose", Kind: "cache", Label: "Redis"},
		},
		Edges: []Edge{
			{ID: "e1", From: "api", To: "db", Kind: EdgeReads},
			{ID: "e2", From: "job", To: "decision", Kind: EdgeRelates},
			{ID: "e3", From: "note-linked", To: "api", Kind: EdgeRelates},
			{ID: "e4", From: "api", To: "inner", Kind: "uses|sync"},
		},
	}
	layout := `{"nodes":{` +
		`"frame":{"x":0,"y":0,"width":1000,"height":600},` +
		`"api":{"x":40,"y":40},` +
		`"inner":{"x":400,"y":200,"width":500,"height":300},` +
		`"job":{"x":450,"y":250},` +
		`"note-frame":{"x":40,"y":400,"width":200,"height":100},` +
		`"db":{"x":1200,"y":40},` +
		`"note-db":{"x":1210,"y":50,"width":100,"height":40},` +
		`"blank":{"x":1500,"y":0},` +
		`"placeholder":{"x":1500,"y":300},` +
		`"decision":{"x":700,"y":250,"width":80,"height":80}}}`
	want := `flowchart LR
  subgraph n1["Backend"]
    n2["API · service · Go"]
    subgraph n3["Workers"]
      n4["Mailer · worker"]
      n6["diamond"]
    end
    %% note: Writes are idempotent
  end
  n5["Postgres · database"]
  %% note on Postgres: Backups nightly
  n7["Redis · cache"]
  %% note on API: Hot path
  n2 -->|reads| n5
  n4 --> n6
  n2 -->|uses#124;sync| n3
  class n4,n5,n7 unverified
`
	if got := ExportMermaid(graph, layout); got != want {
		t.Fatalf("mermaid:\n%s\nwant:\n%s", got, want)
	}
	if got := ExportMermaid(graph, layout); strings.Contains(got, "fill") || strings.Contains(got, "1200") {
		t.Fatal("style or layout leaked into the export")
	}
	flat := ExportMermaid(graph, "not json")
	if strings.Contains(flat, "subgraph") || !strings.Contains(flat, "  n1[\"Backend\"]\n") {
		t.Fatalf("without a layout every node is top level:\n%s", flat)
	}
}

func TestExportFormatDefaultsToMermaid(t *testing.T) {
	graph := Graph{
		Nodes: []Node{
			{ID: "s", Kind: KindDomain, Label: "API", Ref: &Ref{Kind: RefNode, ID: "structure-1"}},
			{ID: "n", Kind: KindNote, Label: "later"},
		},
		Edges: []Edge{{ID: "e", From: "s", To: "n", Kind: EdgeUses}},
	}
	if text, err := ExportFormat(graph, "", ""); err != nil || text != "flowchart LR\n  n1[\"API · domain\"]\n  %% note on API: later\n" {
		t.Fatalf("default = %q err=%v", text, err)
	}
	dot, err := ExportFormat(graph, "", "dot")
	wantDot := "digraph canvas {\n  rankdir=LR;\n  \"s\" [label=\"API\" kind=\"domain\" trust=\"referenced\"];\n  \"n\" [label=\"later\" kind=\"note\" trust=\"unverified\"];\n  \"s\" -> \"n\" [label=\"uses\"];\n}\n"
	if err != nil || dot != wantDot {
		t.Fatalf("dot =\n%s", dot)
	}
	if _, err := ExportFormat(graph, "", "yaml"); err == nil {
		t.Fatal("expected unknown format")
	}
	text, err := ExportFormat(graph, `{"nodes":{}}`, "json")
	if err != nil || !strings.Contains(text, `"trust":"referenced"`) || strings.Contains(text, "nodes\":{}") {
		t.Fatalf("json format = %s err=%v", text, err)
	}
}

func TestExportMermaidEscapesLabels(t *testing.T) {
	text := ExportMermaid(Graph{Nodes: []Node{{ID: "a-b", Kind: "service", Label: `say "hi" #1`}}}, "")
	if !strings.Contains(text, `n1["say #quot;hi#quot; #35;1 · service"]`) {
		t.Fatalf("escape:\n%s", text)
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
