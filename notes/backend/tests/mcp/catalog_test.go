package mcp_test

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"
	"unicode/utf8"

	provider "github.com/polterware/polterware/notes/backend/providers/mcp"
)

// This fixture covers the compact catalog only. It is not an SDK wire smoke
// transcript; those remain blocked on the dependency and core integration.
func TestCatalogBudgetAndGolden(t *testing.T) {
	tools, err := provider.Catalog()
	if err != nil {
		t.Fatal(err)
	}
	if len(tools) != 18 {
		t.Fatalf("tools: %d", len(tools))
	}
	seen := make(map[string]bool)
	for _, tool := range tools {
		if seen[tool.Name] || tool.Name == "" {
			t.Fatalf("invalid tool name: %s", tool.Name)
		}
		seen[tool.Name] = true
		if utf8.RuneCountInString(tool.Description) > 300 {
			t.Fatalf("description: %s", tool.Name)
		}
		var schema map[string]any
		if err := json.Unmarshal(tool.InputSchema, &schema); err != nil {
			t.Fatal(err)
		}
		checkDescriptions(t, schema)
	}
	wire, err := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "result": map[string]any{"tools": tools}})
	if err != nil {
		t.Fatal(err)
	}
	if len(wire) > 6000 {
		t.Fatalf("tools/list catalog: %d bytes > 6000", len(wire))
	}
	t.Logf("compact tools/list catalog: %d bytes", len(wire))
	golden, err := os.ReadFile("golden/tools-list-catalog.json")
	if err != nil {
		t.Fatal(err)
	}
	var compact bytes.Buffer
	if err := json.Compact(&compact, golden); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(wire, compact.Bytes()) {
		t.Fatal("catalog differs from golden fixture")
	}
}

func checkDescriptions(t *testing.T, value any) {
	t.Helper()
	switch v := value.(type) {
	case map[string]any:
		for key, child := range v {
			if key == "description" {
				if text, ok := child.(string); ok && utf8.RuneCountInString(text) > 120 {
					t.Fatal("parameter description exceeds 120 characters")
				}
			}
			checkDescriptions(t, child)
		}
	case []any:
		for _, child := range v {
			checkDescriptions(t, child)
		}
	}
}
