package security

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/space"
	"github.com/polterware/polterware/notes/backend/domains/tag"
	"github.com/polterware/polterware/notes/backend/providers/sqlite"
)

func TestHostileSQLValuesCannotChangeQueryStructure(t *testing.T) {
	store, err := sqlite.Open(filepath.Join(t.TempDir(), "notes.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	now := time.Now().UTC()
	payload := "x'); DROP TABLE notes; --"
	ctx := t.Context()
	if err := store.Spaces().Insert(ctx, space.Space{ID: "space", Name: payload, CreatedAt: now, UpdatedAt: now, Rev: 1}); err != nil {
		t.Fatal(err)
	}
	if err := store.Tags().Insert(ctx, tag.Tag{ID: "tag", Name: payload, CreatedAt: now, UpdatedAt: now, Rev: 1}); err != nil {
		t.Fatal(err)
	}
	if err := store.Notes().Insert(ctx, note.Note{ID: "note", SpaceID: ptr("space"), Title: payload, Content: payload, Status: note.StatusActive, CreatedAt: now, UpdatedAt: now, Rev: 1}); err != nil {
		t.Fatal(err)
	}
	got, err := store.Notes().Get(ctx, "note")
	if err != nil || got.Title != payload || got.Content != payload {
		t.Fatalf("hostile text was not literal: %+v %v", got, err)
	}
	for _, filter := range []note.ListFilter{{SpaceID: ptr("' OR 1=1 --")}, {Status: "' OR 1=1 --"}, {TagIDs: []string{"') OR 1=1 --"}}} {
		page, err := store.Notes().List(ctx, filter)
		if err != nil || len(page.Notes) != 0 {
			t.Fatalf("filter escaped parameters: %+v %v", page, err)
		}
	}
	for _, id := range []string{"' OR 1=1 --", "note'; DELETE FROM notes; --"} {
		if _, err := store.Notes().Get(ctx, id); err == nil {
			t.Fatalf("hostile lookup returned a row: %s", id)
		}
	}
	if _, err := store.Tags().GetByName(ctx, payload); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Activity().List(ctx, "", "' OR 1=1 --", 10); err != nil {
		t.Fatal(err)
	}
	// FTS grammar may reject hostile syntax; it must never change SQL structure.
	_, _ = store.Notes().List(ctx, note.ListFilter{Query: "x' OR 1=1 --"})
	if _, err := store.Notes().Get(ctx, "note"); err != nil {
		t.Fatalf("table was altered: %v", err)
	}
}
func ptr(value string) *string { return &value }
