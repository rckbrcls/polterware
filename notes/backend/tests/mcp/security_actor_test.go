package mcp_test

import (
	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"net/http/httptest"
	"testing"
)

func TestMCPAttachmentWritesCarrySessionActor(t *testing.T) {
	rt := openCore(t)
	server := httptest.NewServer(rt.MCP.Handler)
	defer server.Close()
	client := sdk.NewClient(&sdk.Implementation{Name: "attachment-security", Version: "1"}, nil)
	session, err := client.Connect(t.Context(), &sdk.StreamableClientTransport{Endpoint: server.URL}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	m, err := rt.Services.Notes.Create(t.Context(), actor.UI(), note.Create{Title: "Attachment actor"})
	if err != nil {
		t.Fatal(err)
	}
	result, err := session.CallTool(t.Context(), &sdk.CallToolParams{Name: "add_attachments", Arguments: map[string]any{"noteId": m.ID, "links": []map[string]string{{"url": "https://example.com", "title": "Link"}}}})
	if err != nil || result.IsError {
		t.Fatalf("tool: %+v %v", result, err)
	}
	page, err := rt.Services.Activity.List(t.Context(), "", "", 100)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, event := range page.Events {
		if event.Entity == "attachment" {
			found = true
			if event.Actor != "mcp:attachment-security" {
				t.Fatalf("incorrect actor: %s", event.Actor)
			}
		}
	}
	if !found {
		t.Fatal("missing attachment audit event")
	}
}
