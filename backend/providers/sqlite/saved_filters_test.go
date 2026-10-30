package sqlite_test

import (
	"errors"
	"testing"
	"time"

	"github.com/polterware/polterware/backend/domains/filters"
	"github.com/polterware/polterware/backend/domains/projects"
)

func TestSavedFilterStoreRoundTrip(t *testing.T) {
	store := newStore(t)
	now := time.Now().UTC()
	for _, id := range []string{"proj-a", "proj-b"} {
		if err := store.SaveProject(projects.Project{ID: id, Name: id, CreatedAt: now, UpdatedAt: now}); err != nil {
			t.Fatal(err)
		}
	}
	if items, err := store.ListSavedFilters("proj-a", "work"); err != nil || len(items) != 0 {
		t.Fatalf("empty surface: %+v, %v", items, err)
	}

	mine, err := store.SaveSavedFilter(filters.SavedFilter{ProjectID: "proj-a", Surface: " work ", Name: " Mine ", PayloadJSON: `{"version":1,"clauses":[]}`})
	if err != nil {
		t.Fatal(err)
	}
	if mine.ID == "" || mine.Surface != "work" || mine.Name != "Mine" || mine.Position != 0 || mine.CreatedAt.IsZero() {
		t.Fatalf("mine = %+v", mine)
	}
	blocked, err := store.SaveSavedFilter(filters.SavedFilter{ProjectID: "proj-a", Surface: "work", Name: "Blocked", PayloadJSON: `{"version":1}`})
	if err != nil || blocked.Position != 1 {
		t.Fatalf("blocked = %+v, %v", blocked, err)
	}

	// Saving an existing name replaces the payload in place.
	updated, err := store.SaveSavedFilter(filters.SavedFilter{ProjectID: "proj-a", Surface: "work", Name: "Mine", PayloadJSON: `{"version":1,"clauses":[{"field":"owner"}]}`})
	if err != nil {
		t.Fatal(err)
	}
	if updated.ID != mine.ID || updated.Position != 0 || updated.PayloadJSON != `{"version":1,"clauses":[{"field":"owner"}]}` {
		t.Fatalf("upsert = %+v", updated)
	}

	// The same name is free on another surface, another project, and app level.
	for _, scope := range []filters.SavedFilter{
		{ProjectID: "proj-a", Surface: "truth.facts"},
		{ProjectID: "proj-b", Surface: "work"},
		{Surface: "work"},
	} {
		scope.Name, scope.PayloadJSON = "Mine", `{"version":1}`
		saved, err := store.SaveSavedFilter(scope)
		if err != nil || saved.ID == mine.ID || saved.Position != 0 {
			t.Fatalf("save %+v = %+v, %v", scope, saved, err)
		}
	}
	appLevel, err := store.SaveSavedFilter(filters.SavedFilter{Surface: "work", Name: "Mine", PayloadJSON: `{"version":2}`})
	if err != nil {
		t.Fatal(err)
	}
	if listed, err := store.ListSavedFilters("", "work"); err != nil || len(listed) != 1 || listed[0].ID != appLevel.ID || listed[0].ProjectID != "" || listed[0].PayloadJSON != `{"version":2}` {
		t.Fatalf("app-level upsert must reuse the NULL-project row: %+v, %v", listed, err)
	}

	listed, err := store.ListSavedFilters("proj-a", "work")
	if err != nil {
		t.Fatal(err)
	}
	if len(listed) != 2 || listed[0].ID != mine.ID || listed[1].ID != blocked.ID {
		t.Fatalf("list = %+v", listed)
	}

	if _, err := store.SaveSavedFilter(filters.SavedFilter{ProjectID: "proj-a", Surface: "work", Name: "Bad", PayloadJSON: `{}`}); !errors.Is(err, filters.ErrPayload) {
		t.Fatalf("bad payload: %v", err)
	}
	if _, err := store.SaveSavedFilter(filters.SavedFilter{ProjectID: "missing", Surface: "work", Name: "Ghost", PayloadJSON: `{"version":1}`}); !errors.Is(err, filters.ErrProjectNotFound) {
		t.Fatalf("unknown project: %v", err)
	}

	if err := store.DeleteSavedFilter(mine.ID); err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteSavedFilter(mine.ID); !errors.Is(err, filters.ErrNotFound) {
		t.Fatalf("second delete: %v", err)
	}
	if listed, err := store.ListSavedFilters("proj-a", "work"); err != nil || len(listed) != 1 || listed[0].ID != blocked.ID {
		t.Fatalf("after delete: %+v, %v", listed, err)
	}

	var changeOps int
	if err := store.DB.QueryRow(`SELECT COUNT(*) FROM change_ops`).Scan(&changeOps); err != nil || changeOps != 0 {
		t.Fatalf("saved filters must not write change_ops: %d, %v", changeOps, err)
	}

	if _, err := store.DB.Exec(`DELETE FROM projects WHERE id='proj-b'`); err != nil {
		t.Fatal(err)
	}
	if listed, err := store.ListSavedFilters("proj-b", "work"); err != nil || len(listed) != 0 {
		t.Fatalf("project delete cascades: %+v, %v", listed, err)
	}
}
