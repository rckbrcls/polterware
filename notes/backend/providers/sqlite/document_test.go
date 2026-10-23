package sqlite

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/space"
	"github.com/polterware/polterware/notes/backend/domains/tag"
	"github.com/polterware/polterware/notes/backend/platform/changes"
)

func TestDocumentSourceAndIndex(t *testing.T) {
	idx := &recIndex{}
	s, err := OpenWith(filepath.Join(t.TempDir(), "notes.db"), changes.New(), idx)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	ctx := context.Background()
	now := time.Date(2026, 10, 3, 21, 30, 0, 0, time.UTC)
	parent := "parent"
	if err := s.Spaces().Insert(ctx, space.Space{ID: parent, Name: "Work", CreatedAt: now, UpdatedAt: now, Rev: 1}); err != nil {
		t.Fatal(err)
	}
	if err := s.Spaces().Insert(ctx, space.Space{ID: "child", ParentID: &parent, Name: "Project", CreatedAt: now, UpdatedAt: now, Rev: 1}); err != nil {
		t.Fatal(err)
	}
	child := "child"
	if err := s.Notes().Insert(ctx, note.Note{
		ID: "m1", SpaceID: &child, Title: "café", Content: "# Hello\n**content**", Status: note.StatusActive, CreatedAt: now, UpdatedAt: now, Rev: 1,
	}); err != nil {
		t.Fatal(err)
	}
	if err := s.Tags().Insert(ctx, tag.Tag{ID: "t1", Name: "urgent", CreatedAt: now, UpdatedAt: now, Rev: 1}); err != nil {
		t.Fatal(err)
	}
	if err := s.Notes().SetTagIDs(ctx, "m1", []string{"t1"}); err != nil {
		t.Fatal(err)
	}
	if err := s.Notes().ReplaceCheckItems(ctx, "m1", []note.CheckItem{{
		ID: "c1", NoteID: "m1", Title: "buy milk", Detail: "2L", CreatedAt: now, UpdatedAt: now,
	}}); err != nil {
		t.Fatal(err)
	}
	doc, err := s.Documents().Document(ctx, "m1")
	if err != nil {
		t.Fatal(err)
	}
	if doc.Title != "café" || doc.Space != "Work / Project" || doc.Tags != "urgent" {
		t.Fatalf("doc: %+v", doc)
	}
	if doc.Checklist != "buy milk\n2L" {
		t.Fatalf("checklist %q", doc.Checklist)
	}
	if doc.Content != "Hello\nnote" {
		t.Fatalf("content %q", doc.Content)
	}
	last := idx.last()
	if last.NoteID != "m1" || last.Space != "Work / Project" {
		t.Fatalf("index last %+v", last)
	}
	if err := s.Notes().Delete(ctx, 0, "m1"); err != nil {
		t.Fatal(err)
	}
	if len(idx.deleted) == 0 || idx.deleted[len(idx.deleted)-1] != "m1" {
		t.Fatalf("delete index: %v", idx.deleted)
	}
}
