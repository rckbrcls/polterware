package mcp_test

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/polterware/polterware/notes/backend/compositions/core"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/settings"
	"github.com/polterware/polterware/notes/backend/domains/space"
)

type revisionClient struct {
	rt      core.Runtime
	session *sdk.ClientSession
}

func newRevisionClient(t *testing.T) revisionClient {
	t.Helper()
	rt := openCore(t)
	server := httptest.NewServer(rt.MCP.Handler)
	t.Cleanup(server.Close)
	client := sdk.NewClient(&sdk.Implementation{Name: "revision-writes", Version: "0"}, nil)
	session, err := client.Connect(t.Context(), &sdk.StreamableClientTransport{Endpoint: server.URL}, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = session.Close() })
	return revisionClient{rt, session}
}
func (c revisionClient) call(t *testing.T, tool string, args any) map[string]any {
	t.Helper()
	res, err := c.session.CallTool(t.Context(), &sdk.CallToolParams{Name: tool, Arguments: args})
	if err != nil {
		t.Fatal(err)
	}
	out := structured(t, res)
	if rows, ok := out["results"].([]any); ok {
		return rows[0].(map[string]any)
	}
	return out
}
func (c revisionClient) create(t *testing.T, item map[string]any) string {
	t.Helper()
	row := c.call(t, "create_notes", map[string]any{"items": []any{item}})
	if row["ok"] != true {
		t.Fatal(row)
	}
	id := row["id"].(string)
	c.assertRev(t, id, row)
	return id
}
func (c revisionClient) assertRev(t *testing.T, id string, row map[string]any) {
	t.Helper()
	got, err := c.rt.Services.Notes.Get(t.Context(), id, note.Include{})
	if err != nil {
		t.Fatal(err)
	}
	if row["rev"] != float64(got.Note.Rev) {
		t.Fatalf("returned revision differs from committed note: %v / %d", row, got.Note.Rev)
	}
}
func (c revisionClient) uiEdit(t *testing.T, id string) {
	t.Helper()
	title := "Outside UI edit"
	if _, err := c.rt.Services.Notes.Update(t.Context(), actor.UI(), id, 0, note.Patch{Title: &title}); err != nil {
		t.Fatal(err)
	}
}
func (c revisionClient) update(t *testing.T, item map[string]any) map[string]any {
	t.Helper()
	return c.call(t, "update_notes", map[string]any{"items": []any{item}})
}

func TestCoreMCPUpdatePathsRegisterFinalRevision(t *testing.T) {
	schedule := map[string]any{"at": "2026-10-05T12:00:00Z"}
	place := map[string]any{"lat": -23.55, "lng": -46.63}
	for _, tc := range []struct {
		name  string
		patch map[string]any
	}{
		{"fields", map[string]any{"content": "Agent content"}},
		{"schedule_set", map[string]any{"schedule": schedule}},
		{"schedule_clear", map[string]any{"schedule": nil}},
		{"place_set", map[string]any{"place": place}},
		{"place_clear", map[string]any{"place": nil}},
		{"tags_replace", map[string]any{"tags": []string{"work"}}},
		{"tags_add", map[string]any{"addTags": []string{"work"}}},
		{"tags_remove", map[string]any{"removeTags": []string{"work"}}},
		{"checklist", map[string]any{"checklist": []string{"Check"}}},
		{"links", map[string]any{"links": []any{map[string]any{"url": "https://example.com"}}}},
		{"all_relations", map[string]any{"schedule": schedule, "place": place, "tags": []string{"work"}, "checklist": []string{"Check"}, "links": []any{map[string]any{"url": "https://example.com"}}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c := newRevisionClient(t)
			if _, err := c.rt.Services.Tags.Create(t.Context(), actor.UI(), "work", nil); err != nil {
				t.Fatal(err)
			}
			id := c.create(t, map[string]any{"title": "Task", "schedule": schedule, "place": place, "tags": []string{"work"}})
			tc.patch["id"] = id
			for range 2 {
				row := c.update(t, tc.patch)
				if row["ok"] != true {
					t.Fatal(row)
				}
				c.assertRev(t, id, row)
			}
			c.uiEdit(t, id)
			row := c.update(t, tc.patch)
			if row["conflict"] != true {
				t.Fatalf("outside UI write did not conflict: %v", row)
			}
		})
	}
}

func TestCoreMCPCreateExtrasRegisterFinalRevision(t *testing.T) {
	for _, field := range []string{"schedule", "place", "schedule_place"} {
		t.Run(field, func(t *testing.T) {
			c := newRevisionClient(t)
			item := map[string]any{"title": "Created"}
			if field != "place" {
				item["schedule"] = map[string]any{"at": "2026-10-05T12:00:00Z"}
			}
			if field != "schedule" {
				item["place"] = map[string]any{"lat": 0, "lng": 0}
			}
			id := c.create(t, item)
			for range 2 {
				row := c.update(t, map[string]any{"id": id, "content": "Follow-up"})
				if row["ok"] != true {
					t.Fatal(row)
				}
				c.assertRev(t, id, row)
			}
			c.uiEdit(t, id)
			if row := c.update(t, map[string]any{"id": id, "title": "Overwrite"}); row["conflict"] != true {
				t.Fatal(row)
			}
		})
	}
}

func TestCoreMCPSingleWritePathsKeepSessionRevision(t *testing.T) {
	for _, tool := range []string{"set_note_status", "set_occurrence_status", "toggle_check_item", "add_links", "add_files", "first_add_links"} {
		t.Run(tool, func(t *testing.T) {
			c := newRevisionClient(t)
			item := map[string]any{"title": "Task", "checklist": []string{"Check"}}
			if tool == "set_occurrence_status" {
				item["schedule"] = map[string]any{"at": "2026-10-05T12:00:00Z", "repeat": map[string]any{"freq": "daily"}}
			}
			id := ""
			if tool == "first_add_links" {
				m, err := c.rt.Services.Notes.Create(t.Context(), actor.UI(), note.Create{Title: "Unread"})
				if err != nil {
					t.Fatal(err)
				}
				id = m.ID
			} else {
				id = c.create(t, item)
			}
			name := tool
			args := map[string]any{"id": id, "status": "completed"}
			switch tool {
			case "set_occurrence_status":
				name = "set_note_status"
				args["occurrence"] = "2026-10-05T12:00:00Z"
			case "toggle_check_item":
				args = map[string]any{"noteId": id, "itemTitle": "Check"}
			case "add_links", "first_add_links":
				name = "add_attachments"
				args = map[string]any{"noteId": id, "links": []any{map[string]any{"url": "https://example.com/a"}, map[string]any{"url": "https://example.com/b"}}}
			case "add_files":
				name = "add_attachments"
				if _, err := c.rt.Services.Settings.Set(t.Context(), actor.UI(), []string{settings.KeyAgentsAllowFileAttach}, settings.Settings{AgentsAllowFileAttach: true}); err != nil {
					t.Fatal(err)
				}
				dir, err := filepath.EvalSymlinks(t.TempDir())
				if err != nil {
					t.Fatal(err)
				}
				path := filepath.Join(dir, "attachment.txt")
				if err := os.WriteFile(path, []byte("attachment content"), 0600); err != nil {
					t.Fatal(err)
				}
				args = map[string]any{"noteId": id, "files": []any{map[string]any{"path": path}}}
			}
			for range 2 {
				row := c.call(t, name, args)
				if row["error"] != nil {
					t.Fatal(row)
				}
				c.assertRev(t, id, row)
			}
			c.uiEdit(t, id)
			if row := c.call(t, name, args); row["conflict"] != true {
				t.Fatalf("outside UI write did not conflict: %v", row)
			}
		})
	}
}

func TestCoreMCPSpaceDeleteRegistersMovedNoteRevisions(t *testing.T) {
	for _, outsideBefore := range []bool{false, true} {
		t.Run(map[bool]string{false: "own_move", true: "unseen_UI_edit"}[outsideBefore], func(t *testing.T) {
			c := newRevisionClient(t)
			root := c.call(t, "create_space", map[string]any{"name": "Root"})["id"].(string)
			child := c.call(t, "create_space", map[string]any{"name": "Child", "parent": root})["id"].(string)
			id := c.create(t, map[string]any{"title": "Task", "space": child})
			if outsideBefore {
				c.uiEdit(t, id)
			}
			row := c.call(t, "delete_space", map[string]any{"id": root, "confirm": true})
			if row["error"] != nil || row["movedNoteCount"] != float64(1) {
				t.Fatal(row)
			}
			if outsideBefore {
				if row := c.update(t, map[string]any{"id": id, "title": "Overwrite"}); row["conflict"] != true {
					t.Fatal(row)
				}
				return
			}
			revisions := row["noteRevisions"].(map[string]any)
			c.assertRev(t, id, map[string]any{"rev": revisions[id]})
			for range 2 {
				row := c.update(t, map[string]any{"id": id, "content": "Follow-up"})
				if row["ok"] != true {
					t.Fatal(row)
				}
			}
			c.uiEdit(t, id)
			if row := c.update(t, map[string]any{"id": id, "title": "Overwrite"}); row["conflict"] != true {
				t.Fatal(row)
			}
			// Deletion itself still honors an externally changed space revision.
			next := c.call(t, "create_space", map[string]any{"name": "Next"})["id"].(string)
			renamed := "UI renamed"
			if _, err := c.rt.Services.Spaces.Update(t.Context(), actor.UI(), next, 0, space.Patch{Name: &renamed}); err != nil {
				t.Fatal(err)
			}
			if row := c.call(t, "delete_space", map[string]any{"id": next, "confirm": true}); row["conflict"] != true {
				t.Fatal(row)
			}
		})
	}
}

func TestCoreMCPUpdateFailureKeepsCommittedSessionRevision(t *testing.T) {
	for _, field := range []string{"schedule", "place", "links"} {
		t.Run(field, func(t *testing.T) {
			c := newRevisionClient(t)
			id := c.create(t, map[string]any{"title": "Original"})
			patch := map[string]any{"id": id, "title": "Rolled back", "checklist": []string{"Rolled back"}}
			switch field {
			case "schedule":
				patch[field] = map[string]any{"at": "invalid"}
			case "place":
				patch[field] = map[string]any{"lat": 100, "lng": 0}
			case "links":
				patch[field] = []any{map[string]any{"url": "https://example.com/first"}, map[string]any{"url": "invalid"}}
			}
			if row := c.update(t, patch); row["ok"] != false {
				t.Fatal(row)
			}
			got, err := c.rt.Services.Notes.Get(t.Context(), id, note.Include{Checklist: true})
			if err != nil || got.Note.Title != "Original" || got.Note.Rev != 1 || len(got.Checklist) != 0 {
				t.Fatalf("failed update leaked: %v / %v", got, err)
			}
			links, err := c.rt.Services.Attachments.List(t.Context(), id)
			if err != nil || len(links) != 0 {
				t.Fatalf("failed update leaked links: %v / %v", links, err)
			}
			if row := c.update(t, map[string]any{"id": id, "title": "Retry"}); row["ok"] != true {
				t.Fatal(row)
			}
		})
	}
}

func TestCoreMCPNoteDeleteAfterOwnWriteAndOutsideWrite(t *testing.T) {
	for _, outside := range []bool{false, true} {
		t.Run(map[bool]string{false: "own_write", true: "outside_write"}[outside], func(t *testing.T) {
			c := newRevisionClient(t)
			id := c.create(t, map[string]any{"title": "Task"})
			if row := c.update(t, map[string]any{"id": id, "place": map[string]any{"lat": 0, "lng": 0}}); row["ok"] != true {
				t.Fatal(row)
			}
			if outside {
				c.uiEdit(t, id)
			}
			row := c.call(t, "delete_notes", map[string]any{"ids": []string{id}, "confirm": true})
			if outside {
				if row["conflict"] != true {
					t.Fatal(row)
				}
			} else if row["ok"] != true {
				t.Fatal(row)
			}
		})
	}
}
