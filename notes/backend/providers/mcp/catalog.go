package mcp

import (
	"embed"
	"encoding/json"
	"fmt"
	"strings"
)

//go:embed schemas/*.json
var contractFiles embed.FS

// Tool is the compact public descriptor, without SDK-inferred output schemas.
// InputSchema is copied directly from the frozen contract.
type Tool struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"inputSchema"`
}

// Catalog reads the 18 frozen contracts in deterministic order. Only display
// descriptions are shortened; input validation is not changed.
func Catalog() ([]Tool, error) {
	entries, err := contractFiles.ReadDir("schemas")
	if err != nil {
		return nil, fmt.Errorf("read MCP contracts: %w", err)
	}
	tools := make([]Tool, 0, 18)
	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".schema.json") {
			continue
		}
		data, err := contractFiles.ReadFile("schemas/" + entry.Name())
		if err != nil {
			return nil, fmt.Errorf("read MCP tool: %w", err)
		}
		var tool Tool
		if err := json.Unmarshal(data, &tool); err != nil {
			return nil, fmt.Errorf("decode MCP tool: %w", err)
		}
		switch tool.Name {
		case "list_notes":
			tool.Description = "Filter note summaries."
		case "get_current_time":
			tool.Description = "Current time and zone."
		case "create_space":
			tool.Description = "Create a space under parent (name or id)."
		case "get_note":
			tool.Description = "Get a note; default: content,checklist,schedule."
		case "list_occurrences":
			tool.Description = "Occurrences, completion, overdue."
		case "update_space":
			tool.Description = "Patch by id/name; null clears parent/color/icon."
		case "get_review":
			tool.Description = "Streak, counts, focus minutes."
		case "delete_space":
			tool.Description = "Delete space tree; notes to Inbox. confirm."
		case "add_attachments":
			tool.Description = "Add links or files. files needs allowFileAttach."
		case "set_note_status":
			tool.Description = "Set active or completed. occurrence for one repeat."
		case "update_notes":
			tool.Description = "Patch up to 50. null clears. tags replace; add/removeTags."
		case "create_notes":
			tool.Description = "Create up to 50 notes; per-item ok or error."
		case "delete_notes":
			tool.Description = "Delete notes; confirm true."
		case "list_tags":
			tool.Description = "Tags, colors, counts."
		case "search_notes":
			tool.Description = "Ranked full-text."
		case "toggle_check_item":
			tool.Description = "Toggle checklist item by id or title."
		}
		tools = append(tools, tool)
	}
	return tools, nil
}
