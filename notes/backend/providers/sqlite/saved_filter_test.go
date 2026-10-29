package sqlite

import (
	"testing"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/savedfilter"
)

func TestSavedFiltersUpsertOrderAndDelete(t *testing.T) {
	s := openStore(t)
	repo := s.SavedFilters()
	ctx := t.Context()
	t0 := time.Date(2026, 10, 29, 9, 0, 0, 0, time.UTC)
	save := func(id, surface, name, payload string, at time.Time) savedfilter.SavedFilter {
		t.Helper()
		f, err := repo.Save(ctx, savedfilter.SavedFilter{ID: id, Surface: surface, Name: name, PayloadJSON: payload, CreatedAt: at, UpdatedAt: at})
		if err != nil {
			t.Fatal(err)
		}
		return f
	}
	a := save("a", "notes.library", "Urgent", `{"version":1}`, t0)
	b := save("b", "notes.library", "Inbox", `{"version":1}`, t0)
	c := save("c", "notes.search", "Urgent", `{"version":1}`, t0)
	if a.Position != 0 || b.Position != 1 || c.Position != 0 {
		t.Fatalf("positions a=%d b=%d c=%d", a.Position, b.Position, c.Position)
	}

	t1 := t0.Add(time.Hour)
	updated := save("ignored", "notes.library", "Urgent", `{"version":1,"clauses":[{"field":"priority"}]}`, t1)
	if updated.ID != "a" || updated.Position != 0 || !updated.CreatedAt.Equal(t0) || !updated.UpdatedAt.Equal(t1) ||
		updated.PayloadJSON != `{"version":1,"clauses":[{"field":"priority"}]}` {
		t.Fatalf("upsert %+v", updated)
	}

	library, err := repo.List(ctx, "notes.library")
	if err != nil {
		t.Fatal(err)
	}
	if len(library) != 2 || library[0].ID != "a" || library[1].ID != "b" {
		t.Fatalf("library %+v", library)
	}
	if empty, err := repo.List(ctx, "notes.unknown"); err != nil || len(empty) != 0 || empty == nil {
		t.Fatalf("unknown surface %v %v", empty, err)
	}

	if err := repo.Delete(ctx, "a"); err != nil {
		t.Fatal(err)
	}
	if err := repo.Delete(ctx, "a"); !fault.IsCode(err, fault.CodeNotFound) {
		t.Fatalf("second delete: %v", err)
	}
	if next := save("d", "notes.library", "Later", `{"version":1}`, t1); next.Position != 2 {
		t.Fatalf("position after delete = %d", next.Position)
	}
	if search, _ := repo.List(ctx, "notes.search"); len(search) != 1 || search[0].ID != "c" {
		t.Fatalf("search %+v", search)
	}
}
