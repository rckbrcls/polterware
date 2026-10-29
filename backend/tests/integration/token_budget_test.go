package integration

import (
	"bytes"
	"encoding/json"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"testing"

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
	"mcp.initialize": 344,
	"mcp.tools_list": 2251,
	"polter.format":  1266,
	// One brief replaces oracle + decision + handoff + context.get (461).
	"card.context": 297,
	// One brief replaces oracle + context.get (273).
	"node.context": 222,
	// Compact lines replace the context.get JSON package (340).
	"search": 87,
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

	reads := map[string][]map[string]any{
		"mcp.initialize": {{"method": "initialize", "params": map[string]any{}}},
		"mcp.tools_list": {{"method": "tools/list"}},
		"polter.format":  {toolCall(mcp.ToolPolterFormat, map[string]any{})},
		// What an agent reads before it works on one card or node: its
		// brief (tasks, invariants, governing decisions, facts, milestone).
		"card.context": {toolCall(mcp.ToolPolterQuery, map[string]any{"project_id": seed.ProjectID, "query": "brief local-build-dogfood"})},
		"node.context": {toolCall(mcp.ToolPolterQuery, map[string]any{"project_id": seed.ProjectID, "query": "brief polterware/cli/commands"})},
		"search":       {toolCall(mcp.ToolPolterQuery, map[string]any{"project_id": seed.ProjectID, "query": "search drift"})},
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
