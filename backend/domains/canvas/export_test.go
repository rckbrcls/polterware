package canvas

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestExportNodeLinkShape(t *testing.T) {
	body, err := Export(Graph{
		Nodes: []Node{
			{ID: "s", Kind: KindSystem, Label: "API", Props: map[string]any{"tier": "edge"}, Ref: &Ref{Kind: RefNode, ID: "atlas-1"}},
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
	if ref["kind"] != RefNode || ref["id"] != "atlas-1" {
		t.Fatalf("ref = %v", ref)
	}
	second, _ := nodes[1].(map[string]any)
	if _, ok := second["ref"]; ok {
		t.Fatalf("note ref = %v", second["ref"])
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

func TestMarshalGraphKeepsStorageShape(t *testing.T) {
	raw, err := MarshalGraph(Graph{
		Nodes: []Node{{ID: "a", Kind: KindIdea, Label: "One"}},
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
