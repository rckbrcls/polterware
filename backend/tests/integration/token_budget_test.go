package integration

import (
	"bytes"
	"encoding/json"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/domains/canvas"
	contextpkg "github.com/polterware/polterware/backend/domains/context"
	"github.com/polterware/polterware/backend/providers/mcp"
	"github.com/polterware/polterware/backend/providers/seed"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// tokenCeilings are the estimated tokens an agent receives for each read of
// the seeded Polterware project. They ratchet: a read over its ceiling fails,
// and a read more than 10% under it fails too, so the ceiling is lowered to
// the new number in the change that made the read cheaper.
var tokenCeilings = map[string]int{
	// Four tools replace seventeen (initialize was 344, tools/list 2199).
	"mcp.initialize": 237,
	// The query list names "commits <slug>" in place of "drift" (683) and the
	// Conflict reads, and the format topics gain conflicts.
	"mcp.tools_list": 702,
	// The core alone; topics are read on demand (the whole spec was 1266). It
	// tells agents to raise a Conflict instead of breaking a Rule (390).
	"polter.format": 397,
	// One brief replaces oracle + decision + handoff + context.get (461).
	"card.context": 275,
	// One brief replaces oracle + context.get (273).
	"node.context": 201,
	// Compact lines replace the context.get JSON package (340).
	"search": 57,
	// Mermaid with frames as subgraphs replaces node-link JSON (312).
	"canvas.show": 91,
}

func TestAgentReadTokenBudget(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "budget.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	// An empty root keeps the seed deterministic: no checkout scan, no siblings.
	if err := seed.Polterware(store, t.TempDir()); err != nil {
		t.Fatal(err)
	}
	seedArchitectureCanvas(t, store)

	reads := map[string][]map[string]any{
		"mcp.initialize": {{"method": "initialize", "params": map[string]any{}}},
		"mcp.tools_list": {{"method": "tools/list"}},
		"polter.format":  {toolCall(mcp.ToolPolterFormat, map[string]any{})},
		// What an agent reads before it works on one card or node: its
		// brief (tasks, invariants, governing decisions, facts, milestone).
		"card.context": {toolCall(mcp.ToolPolterQuery, map[string]any{"project_id": seed.ProjectID, "query": "brief local-build-dogfood"})},
		"node.context": {toolCall(mcp.ToolPolterQuery, map[string]any{"project_id": seed.ProjectID, "query": "brief cli/commands"})},
		"search":       {toolCall(mcp.ToolPolterQuery, map[string]any{"project_id": seed.ProjectID, "query": "search commits"})},
		"canvas.show":  {toolCall(mcp.ToolPolterQuery, map[string]any{"project_id": seed.ProjectID, "query": "canvas Architecture"})},
	}

	measured := map[string]int{}
	for name, calls := range reads {
		var text strings.Builder
		for _, call := range calls {
			text.WriteString(mcpResult(t, store, call))
		}
		measured[name] = contextpkg.EstimateTokens(text.String())
		if testing.Verbose() && name != "mcp.tools_list" && name != "polter.format" && name != "mcp.initialize" {
			t.Logf("---- %s\n%s", name, text.String())
		}
	}

	names := make([]string, 0, len(measured))
	for name := range measured {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		got, ceiling := measured[name], tokenCeilings[name]
		t.Logf("%-16s %6d tokens (ceiling %d)", name, got, ceiling)
		switch {
		case ceiling == 0:
			t.Errorf("%s has no ceiling: add %q: %d", name, name, got)
		case got > ceiling:
			t.Errorf("%s grew to %d tokens, over its ceiling of %d", name, got, ceiling)
		case got*10 < ceiling*9:
			t.Errorf("%s fell to %d tokens: lower its ceiling from %d to %d", name, got, ceiling, got)
		}
	}
}

// seedArchitectureCanvas shares one canvas the way people draw them: a frame
// around two Structure components, a free database, a note, an unlabeled
// shape, and the links between them.
func seedArchitectureCanvas(t *testing.T, store *storepkg.Store) {
	t.Helper()
	nodes, err := store.StructureNodes(seed.ProjectID)
	if err != nil {
		t.Fatal(err)
	}
	ref := func(path string) *canvas.Ref {
		for _, node := range nodes {
			if node.Path == path {
				return &canvas.Ref{Kind: canvas.RefNode, ID: node.ID}
			}
		}
		t.Fatalf("no Structure node %s", path)
		return nil
	}
	graph := canvas.Graph{
		Nodes: []canvas.Node{
			{ID: "node-frame-core", Kind: "frame", Label: "Local core"},
			{ID: "node-core-server", Kind: "service", Label: "Server", Ref: ref("core/server")},
			{ID: "node-core-store", Kind: "database", Label: "Store", Ref: ref("core/store")},
			{ID: "node-renderer", Kind: "frontend", Label: "Renderer", Props: map[string]any{"technology": "Solid", "style": map[string]any{"fill": "blue"}}},
			{ID: "node-sqlite", Kind: "database", Label: "SQLite file", Props: map[string]any{"technology": "SQLite"}},
			{ID: "node-note-lock", Kind: canvas.KindNote, Label: "One serve process per database, guarded by a lock."},
			{ID: "node-blank", Kind: "rectangle", Label: ""},
		},
		Edges: []canvas.Edge{
			{ID: "edge-renderer-server", From: "node-renderer", To: "node-core-server", Kind: canvas.EdgeCalls},
			{ID: "edge-server-store", From: "node-core-server", To: "node-core-store", Kind: canvas.EdgeUses},
			{ID: "edge-store-sqlite", From: "node-core-store", To: "node-sqlite", Kind: canvas.EdgeWrites},
		},
	}
	layout := `{"version":1,"viewport":{"x":0,"y":0,"zoom":1},"nodes":{` +
		`"node-frame-core":{"x":300,"y":0,"width":520,"height":400},` +
		`"node-core-server":{"x":340,"y":60,"width":180,"height":100},` +
		`"node-core-store":{"x":340,"y":240,"width":180,"height":100},` +
		`"node-note-lock":{"x":580,"y":60,"width":200,"height":120},` +
		`"node-renderer":{"x":0,"y":60,"width":180,"height":100},` +
		`"node-sqlite":{"x":900,"y":240,"width":180,"height":100},` +
		`"node-blank":{"x":900,"y":0,"width":120,"height":80}}}`
	if _, err := store.CreateCanvas(canvas.Canvas{
		ID: "canvas-architecture", ProjectID: seed.ProjectID, Name: "Architecture", Type: canvas.TypeCanvas,
		AgentVisible: true, Graph: graph, LayoutJSON: layout,
	}, "", ""); err != nil {
		t.Fatal(err)
	}
}

func toolCall(name string, arguments map[string]any) map[string]any {
	return map[string]any{"method": "tools/call", "params": map[string]any{"name": name, "arguments": arguments}}
}

// mcpResult runs one JSON-RPC request through a fresh MCP session and returns
// what the agent reads: the tool text, or the whole result for other methods.
func mcpResult(t *testing.T, store *storepkg.Store, request map[string]any) string {
	t.Helper()
	request["jsonrpc"] = "2.0"
	request["id"] = 1
	line, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	server := &mcp.Server{Store: store, In: bytes.NewReader(append(line, '\n')), Out: &out, Err: &bytes.Buffer{}}
	defer server.Close()
	if err := server.Serve(); err != nil {
		t.Fatal(err)
	}
	var response struct {
		Result json.RawMessage `json:"result"`
		Error  *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(out.Bytes(), &response); err != nil {
		t.Fatalf("%s: %v", line, err)
	}
	if response.Error != nil {
		t.Fatalf("%s: %s", line, response.Error.Message)
	}
	var tool struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
		IsError bool `json:"isError"`
	}
	if request["method"] != "tools/call" || json.Unmarshal(response.Result, &tool) != nil {
		return string(response.Result)
	}
	if tool.IsError {
		t.Fatalf("%s: %s", line, tool.Content)
	}
	var text strings.Builder
	for _, part := range tool.Content {
		fmt.Fprintln(&text, part.Text)
	}
	return text.String()
}
