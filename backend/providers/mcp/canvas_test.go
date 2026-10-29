package mcp

import (
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/domains/canvas"
	"github.com/polterware/polterware/backend/providers/demoseed"
)

func TestPolterQueryCanvasHidesPrivate(t *testing.T) {
	server := testServer(t)
	shared, err := server.Store.CreateCanvas(canvas.Canvas{
		ID:           "canvas-shared-public",
		ProjectID:    demoseed.ProjectID,
		Name:         "Shared map",
		Type:         canvas.TypeCanvas,
		AgentVisible: true,
		LayoutJSON:   `{"marker":"LAYOUT_ONLY_SECRET"}`,
		Graph: canvas.Graph{Nodes: []canvas.Node{
			{ID: "api", Kind: canvas.KindNote, Label: "Public API", Ref: &canvas.Ref{Kind: canvas.RefFact, ID: "fact-1"}},
			{ID: "note", Kind: canvas.KindNote, Label: "Sketch"},
		}},
	}, "run-1", "batch-shared")
	if err != nil {
		t.Fatal(err)
	}
	private, err := server.Store.CreateCanvas(canvas.Canvas{
		ID:           "canvas-private-secret",
		ProjectID:    demoseed.ProjectID,
		Name:         "Private board",
		Type:         canvas.TypeCanvas,
		AgentVisible: false,
		Graph:        canvas.Graph{Nodes: []canvas.Node{{ID: "hid", Kind: canvas.KindNote, Label: "SECRET_CANVAS_NODE"}}},
	}, "run-1", "batch-private")
	if err != nil {
		t.Fatal(err)
	}

	list, err := server.callTool(ToolPolterQuery, map[string]any{"project_id": demoseed.ProjectID, "query": "canvas"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(list, shared.ID) || !strings.Contains(list, "Shared map") {
		t.Fatalf("list missing shared canvas:\n%s", list)
	}
	if strings.Contains(list, private.ID) || strings.Contains(list, "Private board") || strings.Contains(list, "SECRET_CANVAS_NODE") {
		t.Fatalf("private canvas leaked into the list:\n%s", list)
	}

	for _, query := range []string{"canvas " + private.ID, "canvas Private board"} {
		text, err := server.callTool(ToolPolterQuery, map[string]any{"project_id": demoseed.ProjectID, "query": query})
		if err == nil {
			t.Fatalf("%s returned %s", query, text)
		}
		if strings.Contains(err.Error(), "SECRET_CANVAS_NODE") || strings.Contains(err.Error(), "agent_visible") || strings.Contains(text, "SECRET_CANVAS_NODE") {
			t.Fatalf("%s leaked the private canvas: %v %s", query, err, text)
		}
		if !strings.Contains(err.Error(), "unknown canvas") {
			t.Fatalf("%s: %v", query, err)
		}
	}

	body, err := server.callTool(ToolPolterQuery, map[string]any{"project_id": demoseed.ProjectID, "query": "canvas Shared map"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(body, `"trust":"referenced"`) || !strings.Contains(body, `"trust":"unverified"`) {
		t.Fatalf("export trust missing:\n%s", body)
	}
	if strings.Contains(body, "LAYOUT_ONLY_SECRET") || strings.Contains(body, "layout") || strings.Contains(body, "SECRET_CANVAS_NODE") {
		t.Fatalf("export leaked layout or the private canvas:\n%s", body)
	}
	byID, err := server.callTool(ToolPolterQuery, map[string]any{"project_id": demoseed.ProjectID, "query": "canvas " + shared.ID})
	if err != nil || byID != body {
		t.Fatalf("id export = %s err=%v", byID, err)
	}
}

func TestPolterQueryMentionsCanvas(t *testing.T) {
	var desc, query string
	for _, tool := range toolDefinitions() {
		if tool["name"] != ToolPolterQuery {
			continue
		}
		desc, _ = tool["description"].(string)
		props := tool["inputSchema"].(map[string]any)["properties"].(map[string]any)
		query = props["query"].(map[string]any)["description"].(string)
	}
	if !strings.Contains(desc, "canvas") || !strings.Contains(query, "canvas <name|id>") {
		t.Fatalf("description=%s query=%s", desc, query)
	}
	server := testServer(t)
	result, err := server.dispatch(rpcRequest{Method: "initialize", ID: []byte("1")})
	if err != nil {
		t.Fatal(err)
	}
	instructions, _ := result.(map[string]any)["instructions"].(string)
	if !strings.Contains(instructions, "canvas <name|id>") || !strings.Contains(instructions, "agent-visible") {
		t.Fatalf("instructions missing canvas: %s", instructions)
	}
}
