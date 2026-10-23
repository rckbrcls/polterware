package mcp

import (
	"errors"
	"fmt"
	"strings"

	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/space"
)

func sentence(err error) string {
	if err == nil {
		return "internal error"
	}
	var domain *fault.Error
	if errors.As(err, &domain) {
		if domain.Code == fault.CodeConflict {
			title := domain.EntityID
			if current, ok := domain.Current.(note.Note); ok && current.Title != "" {
				title = current.Title
			}
			if current, ok := domain.Current.(note.Summary); ok && current.Title != "" {
				title = current.Title
			}
			if current, ok := domain.Current.(space.Space); ok && current.Name != "" {
				title = current.Name
			}
			return fmt.Sprintf("%s changed since this session last read it (rev %d). Current: %q.", domain.Entity, domain.Rev, title)
		}
		if domain.Message != "" {
			return strings.TrimSuffix(domain.Message, ".") + "."
		}
	}
	text := strings.TrimSpace(err.Error())
	if text == "" {
		return "internal error"
	}
	if !strings.HasSuffix(text, ".") {
		text += "."
	}
	return text
}

func fail(err error) *mcpsdk.CallToolResult {
	text := sentence(err)
	out := map[string]any{"error": text}
	var domain *fault.Error
	if errors.As(err, &domain) && domain.Code == fault.CodeConflict {
		out["conflict"] = true
		out["rev"] = domain.Rev
		out["entity"] = domain.Entity
		out["id"] = domain.EntityID
	}
	return &mcpsdk.CallToolResult{
		Content:           []mcpsdk.Content{&mcpsdk.TextContent{Text: text}},
		StructuredContent: out,
		IsError:           true,
	}
}

func ok(text string, data any) *mcpsdk.CallToolResult {
	return &mcpsdk.CallToolResult{
		Content:           []mcpsdk.Content{&mcpsdk.TextContent{Text: text}},
		StructuredContent: data,
	}
}

func itemError(id string, err error) map[string]any {
	row := map[string]any{"ok": false, "error": sentence(err)}
	if id != "" {
		row["id"] = id
	}
	var domain *fault.Error
	if errors.As(err, &domain) && domain.Code == fault.CodeConflict {
		row["conflict"] = true
		row["rev"] = domain.Rev
	}
	return row
}

func itemOK(id string, extra map[string]any) map[string]any {
	row := map[string]any{"ok": true}
	if id != "" {
		row["id"] = id
	}
	for key, value := range extra {
		row[key] = value
	}
	return row
}
