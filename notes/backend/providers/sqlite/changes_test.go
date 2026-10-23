package sqlite

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/platform/changes"
)

func TestChangesAfterCommitNeverOnRollback(t *testing.T) {
	s := openStore(t)
	ctx := context.Background()
	now := time.Date(2026, 10, 3, 21, 30, 0, 0, time.UTC)
	watch, err := s.Changes().Watch(ctx, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer watch.Close()
	if e, err := watch.Next(ctx); err != nil || !e.Snapshot {
		t.Fatalf("snapshot: %+v %v", e, err)
	}
	if err := s.Notes().Insert(ctx, note.Note{ID: "m1", Title: "one", Status: note.StatusActive, CreatedAt: now, UpdatedAt: now, Rev: 1}); err != nil {
		t.Fatal(err)
	}
	wait, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	e, err := watch.Next(wait)
	if err != nil {
		t.Fatal(err)
	}
	if len(e.Changes) != 1 || e.Changes[0].Entity != "note" || e.Changes[0].ID != "m1" || e.Changes[0].Op != "create" {
		t.Fatalf("commit event: %+v", e)
	}
	boom := errors.New("boom")
	err = s.Within(ctx, func(ctx context.Context) error {
		if err := s.Notes().Insert(ctx, note.Note{ID: "m2", Title: "two", Status: note.StatusActive, CreatedAt: now, UpdatedAt: now, Rev: 1}); err != nil {
			return err
		}
		return boom
	})
	if !errors.Is(err, boom) {
		t.Fatalf("rollback: %v", err)
	}
	wait2, cancel2 := context.WithTimeout(ctx, 150*time.Millisecond)
	defer cancel2()
	if _, err := watch.Next(wait2); err == nil {
		t.Fatal("change published on rollback")
	}
}

func TestWALReaderDoesNotBlock(t *testing.T) {
	s := openStore(t)
	ctx := context.Background()
	now := time.Date(2026, 10, 3, 21, 30, 0, 0, time.UTC)
	if err := s.Notes().Insert(ctx, note.Note{ID: "seed", Title: "seed", Status: note.StatusActive, CreatedAt: now, UpdatedAt: now, Rev: 1}); err != nil {
		t.Fatal(err)
	}
	tx, err := s.Handle().Writer().BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO notes(id, title, content, status, created_at, updated_at, rev) VALUES ('held', 'held', '', 'active', ?, ?, 1)`,
		formatTime(now), formatTime(now)); err != nil {
		t.Fatal(err)
	}
	started := time.Now()
	page, err := s.Notes().List(ctx, note.ListFilter{Limit: 10})
	if err != nil {
		t.Fatalf("reader during write: %v", err)
	}
	if time.Since(started) > time.Second {
		t.Fatalf("reader blocked %s", time.Since(started))
	}
	if page.Total != 1 {
		t.Fatalf("reader saw uncommitted write: %+v", page)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	page, err = s.Notes().List(ctx, note.ListFilter{Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 2 {
		t.Fatalf("after commit total=%d", page.Total)
	}
	_ = changes.Change{}
}
