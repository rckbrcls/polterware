package mcp

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/note"
)

// Only the use cases exercised here are implemented. Embedded unused methods
// are deliberately unavailable; this is not a replacement domain service.
type revisionService struct {
	note.Service
	mu           sync.Mutex
	current      note.Note
	lastActor    actor.Actor
	lastExpected int64
}

func (f *revisionService) Get(context.Context, string, note.Include) (note.GetResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return note.GetResult{Note: f.current}, nil
}

func (f *revisionService) List(context.Context, note.ListFilter) (note.ListPage, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return note.ListPage{Total: 1, Notes: []note.Summary{{ID: f.current.ID, Rev: f.current.Rev}}}, nil
}

func (f *revisionService) Update(_ context.Context, who actor.Actor, id string, expected int64, p note.Patch) (note.Note, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastActor, f.lastExpected = who, expected
	if expected != 0 && expected != f.current.Rev {
		return note.Note{}, fault.Conflict("note", id, f.current.Rev, f.current)
	}
	if p.Title != nil {
		f.current.Title = *p.Title
	}
	f.current.Rev++
	return f.current, nil
}

func (f *revisionService) SetStatus(ctx context.Context, who actor.Actor, id string, expected int64, status string, _ *time.Time) (note.Note, error) {
	m, err := f.Update(ctx, who, id, expected, note.Patch{})
	if err == nil {
		m.Status = status
	}
	return m, err
}

func (f *revisionService) ToggleCheckItem(ctx context.Context, who actor.Actor, id, itemID string, expected int64, _ *bool) (note.CheckItem, error) {
	if _, err := f.Update(ctx, who, id, expected, note.Patch{}); err != nil {
		return note.CheckItem{}, err
	}
	return note.CheckItem{ID: itemID, NoteID: id, Title: "A", Done: true}, nil
}

func (f *revisionService) Delete(_ context.Context, who actor.Actor, id string, expected int64) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastActor, f.lastExpected = who, expected
	if expected != 0 && expected != f.current.Rev {
		return fault.Conflict("note", id, f.current.Rev, f.current)
	}
	f.current = note.Note{}
	return nil
}

func TestSessionRejectsInterveningUIWrite(t *testing.T) {
	for _, read := range []string{"get", "list"} {
		for _, write := range []string{"update", "status"} {
			t.Run(read+"/"+write, func(t *testing.T) {
				ctx := context.Background()
				service := &revisionService{current: note.Note{ID: "note-1", Title: "Before", Rev: 1}}
				s := NewNoteSession(service, "Claude Code")
				var err error
				if read == "get" {
					_, err = s.Get(ctx, "note-1", note.Include{})
				} else {
					_, err = s.List(ctx, note.ListFilter{})
				}
				if err != nil {
					t.Fatal(err)
				}
				title := "UI edit"
				if _, err := service.Update(ctx, actor.UI(), "note-1", 1, note.Patch{Title: &title}); err != nil {
					t.Fatal(err)
				}
				agentTitle := "Agent edit"
				if write == "update" {
					_, err = s.Update(ctx, "note-1", nil, note.Patch{Title: &agentTitle})
				} else {
					_, err = s.SetStatus(ctx, "note-1", nil, note.StatusCompleted, nil)
				}
				if !fault.IsCode(err, fault.CodeConflict) {
					t.Fatalf("expected conflict, got %v", err)
				}
				current, _ := service.Get(ctx, "note-1", note.Include{})
				if current.Note.Title != "UI edit" || current.Note.Rev != 2 {
					t.Fatal("UI write overwritten")
				}
				if service.lastActor.Raw != "mcp:Claude Code" || service.lastExpected != 1 {
					t.Fatal("actor/revision not delegated")
				}
			})
		}
	}
}

func TestSessionFirstWriteExplicitRevAndIsolation(t *testing.T) {
	ctx := context.Background()
	service := &revisionService{current: note.Note{ID: "note-1", Rev: 5}}
	a := NewNoteSession(service, "same-client")
	b := NewNoteSession(service, "same-client")
	if _, err := a.Get(ctx, "note-1", note.Include{}); err != nil {
		t.Fatal(err)
	}
	if _, err := b.Update(ctx, "note-1", nil, note.Patch{}); err != nil {
		t.Fatal(err)
	}
	if service.lastExpected != 0 {
		t.Fatal("revision leaked between sessions")
	}
	if _, err := a.Update(ctx, "note-1", nil, note.Patch{}); !fault.IsCode(err, fault.CodeConflict) {
		t.Fatal("stale session overwrote")
	}
	explicit := int64(6)
	if _, err := a.Update(ctx, "note-1", &explicit, note.Patch{}); err != nil {
		t.Fatal(err)
	}
	if service.lastExpected != 6 {
		t.Fatal("explicit revision ignored")
	}
	if _, err := a.Update(ctx, "note-1", nil, note.Patch{}); err != nil {
		t.Fatal(err)
	}
	if service.lastExpected != 7 {
		t.Fatal("returned revision not observed")
	}
}

func TestSessionDeleteAndToggleHonorReadRev(t *testing.T) {
	ctx := context.Background()
	service := &revisionService{current: note.Note{ID: "note-1", Title: "Before", Rev: 1}}
	s := NewNoteSession(service, "Claude Code")
	if _, err := s.Get(ctx, "note-1", note.Include{}); err != nil {
		t.Fatal(err)
	}
	title := "UI edit"
	if _, err := service.Update(ctx, actor.UI(), "note-1", 1, note.Patch{Title: &title}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ToggleCheckItem(ctx, "note-1", "item-1", nil, nil); !fault.IsCode(err, fault.CodeConflict) {
		t.Fatalf("toggle: %v", err)
	}
	if err := s.Delete(ctx, "note-1", nil); !fault.IsCode(err, fault.CodeConflict) {
		t.Fatalf("delete: %v", err)
	}
	explicit := int64(2)
	if _, err := s.ToggleCheckItem(ctx, "note-1", "item-1", &explicit, nil); err != nil {
		t.Fatal(err)
	}
	if service.lastExpected != 2 {
		t.Fatal("explicit toggle revision ignored")
	}
}

func TestSessionConcurrentObservations(t *testing.T) {
	s := NewNoteSession(nil, "test")
	var wg sync.WaitGroup
	for i := 1; i <= 100; i++ {
		wg.Add(1)
		go func(rev int64) { defer wg.Done(); s.observe("note-1", rev); _ = s.expected("note-1", nil) }(int64(i))
	}
	wg.Wait()
	if got := s.expected("note-1", nil); got != 100 {
		t.Fatalf("revision regressed: %d", got)
	}
}

func TestSessionRejectsExplicitNonpositiveRevision(t *testing.T) {
	for _, rev := range []int64{0, -1} {
		service := &revisionService{current: note.Note{ID: "m", Rev: 1}}
		sess := NewNoteSession(service, "test")
		if _, err := sess.Update(t.Context(), "m", &rev, note.Patch{}); !fault.IsCode(err, fault.CodeInvalid) {
			t.Fatalf("update %d: %v", rev, err)
		}
		if _, err := sess.SetStatus(t.Context(), "m", &rev, "completed", nil); !fault.IsCode(err, fault.CodeInvalid) {
			t.Fatalf("status %d: %v", rev, err)
		}
		if _, err := sess.ToggleCheckItem(t.Context(), "m", "i", &rev, nil); !fault.IsCode(err, fault.CodeInvalid) {
			t.Fatalf("toggle %d: %v", rev, err)
		}
		if err := sess.Delete(t.Context(), "m", &rev); !fault.IsCode(err, fault.CodeInvalid) {
			t.Fatalf("delete %d: %v", rev, err)
		}
		if service.current.Rev != 1 {
			t.Fatal("invalid revision mutated note")
		}
	}
}

type interveningToggle struct{ *revisionService }

func (f interveningToggle) ToggleCheckItem(ctx context.Context, who actor.Actor, id, itemID string, rev int64, done *bool) (note.CheckItem, error) {
	item, err := f.revisionService.ToggleCheckItem(ctx, who, id, itemID, rev, done)
	if err != nil {
		return item, err
	}
	// Force the exact race from the review before the MCP service returns.
	title := "UI edit after toggle"
	_, err = f.revisionService.Update(ctx, actor.UI(), id, rev+1, note.Patch{Title: &title})
	return item, err
}
func TestToggleReturnsOwnRevisionWithoutObservingLaterUIWrite(t *testing.T) {
	service := &revisionService{current: note.Note{ID: "m", Rev: 1}}
	sess := NewNoteSession(interveningToggle{service}, "test")
	_, rev, err := sess.ToggleWithRevision(t.Context(), "m", "i", nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if rev != 2 || sess.expected("m", nil) != 2 {
		t.Fatalf("returned %d, observed %d", rev, sess.expected("m", nil))
	}
	if _, err := sess.Update(t.Context(), "m", nil, note.Patch{}); !fault.IsCode(err, fault.CodeConflict) {
		t.Fatalf("UI write was not protected: %v", err)
	}
}
