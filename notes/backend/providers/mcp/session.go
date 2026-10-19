package mcp

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/note"
)

// NoteSession belongs to exactly one MCP transport session. Its caller must
// discard it when that SDK session closes; it must never be shared by clients.
// Mutations delegate atomic revision checks to the same service used by the UI.
type NoteSession struct {
	service note.Service
	actor   actor.Actor
	mu      sync.Mutex
	reads   map[string]int64
}

func NewNoteSession(service note.Service, clientName string) *NoteSession {
	return &NoteSession{service: service, actor: actor.MCP(clientName), reads: make(map[string]int64)}
}

// provisional carries the existing expectations without publishing writes
// that may still roll back in an enclosing transaction.
func (s *NoteSession) provisional() *NoteSession {
	out := NewNoteSession(s.service, "unknown")
	out.actor = s.actor
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, rev := range s.reads {
		out.reads[id] = rev
	}
	return out
}

func (s *NoteSession) observe(id string, rev int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Out-of-order read responses must not lower a revision already observed.
	if rev > s.reads[id] {
		s.reads[id] = rev
	}
}

func (s *NoteSession) expected(id string, explicit *int64) int64 {
	if explicit != nil {
		return *explicit
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.reads[id] // zero means first-write last-write-wins at the domain port
}

func (s *NoteSession) Get(ctx context.Context, id string, include note.Include) (note.GetResult, error) {
	result, err := s.service.Get(ctx, id, include)
	if err == nil {
		s.observe(result.Note.ID, result.Note.Rev)
	}
	return result, err
}

func (s *NoteSession) List(ctx context.Context, filter note.ListFilter) (note.ListPage, error) {
	page, err := s.service.List(ctx, filter)
	if err == nil {
		for _, item := range page.Notes {
			s.observe(item.ID, item.Rev)
		}
	}
	return page, err
}

func (s *NoteSession) Update(ctx context.Context, id string, explicitRev *int64, patch note.Patch) (note.Note, error) {
	if err := validateRevision(explicitRev); err != nil {
		return note.Note{}, err
	}
	result, err := s.service.Update(ctx, s.actor, id, s.expected(id, explicitRev), patch)
	if err == nil {
		s.observe(result.ID, result.Rev)
	}
	return result, err
}

func (s *NoteSession) SetStatus(ctx context.Context, id string, explicitRev *int64, status string, occurrence *time.Time) (note.Note, error) {
	if err := validateRevision(explicitRev); err != nil {
		return note.Note{}, err
	}
	result, err := s.service.SetStatus(ctx, s.actor, id, s.expected(id, explicitRev), status, occurrence)
	if err == nil {
		s.observe(result.ID, result.Rev)
	}
	return result, err
}

func (s *NoteSession) ToggleCheckItem(ctx context.Context, noteID, itemID string, explicitRev *int64, done *bool) (note.CheckItem, error) {
	item, _, err := s.ToggleWithRevision(ctx, noteID, itemID, explicitRev, done)
	return item, err
}

// ToggleWithRevision derives the exact committed revision from the domain's
// atomic expected-revision check and single increment; no post-commit read.
func (s *NoteSession) ToggleWithRevision(ctx context.Context, noteID, itemID string, explicitRev *int64, done *bool) (note.CheckItem, int64, error) {
	if err := validateRevision(explicitRev); err != nil {
		return note.CheckItem{}, 0, err
	}
	// Freeze a positive expected revision before the mutation. The domain's
	// successful toggle increments that revision exactly once in its transaction.
	rev := s.expected(noteID, explicitRev)
	if rev == 0 {
		got, err := s.service.Get(ctx, noteID, note.Include{})
		if err != nil {
			return note.CheckItem{}, 0, err
		}
		rev = got.Note.Rev
	}
	if rev <= 0 {
		return note.CheckItem{}, 0, fmt.Errorf("note revision must be positive")
	}
	item, err := s.service.ToggleCheckItem(ctx, s.actor, noteID, itemID, rev, done)
	if err == nil {
		s.observe(noteID, rev+1)
	}
	return item, rev + 1, err
}

func (s *NoteSession) Delete(ctx context.Context, id string, explicitRev *int64) error {
	if err := validateRevision(explicitRev); err != nil {
		return err
	}
	err := s.service.Delete(ctx, s.actor, id, s.expected(id, explicitRev))
	if err == nil {
		s.forget(id)
	}
	return err
}

func (s *NoteSession) Create(ctx context.Context, in note.Create) (note.Note, error) {
	result, err := s.service.Create(ctx, s.actor, in)
	if err == nil {
		s.observe(result.ID, result.Rev)
	}
	return result, err
}

func (s *NoteSession) Actor() actor.Actor { return s.actor }

func (s *NoteSession) observeSpace(id string, rev int64) { s.observe("space:"+id, rev) }

func (s *NoteSession) expectedSpace(id string, explicit *int64) int64 {
	return s.expected("space:"+id, explicit)
}

func (s *NoteSession) forget(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.reads, id)
}

func (s *NoteSession) forgetSpace(id string) { s.forget("space:" + id) }

func validateRevision(explicit *int64) error {
	if explicit != nil && *explicit <= 0 {
		return fault.Invalid(fault.Violation{Field: "expectedRev", Reason: "must be positive"})
	}
	return nil
}
