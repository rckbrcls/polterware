package fake_test

import (
	"context"
	"errors"
	"github.com/polterware/polterware/notes/backend/domains/activity/fake/testkit"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/focus"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
	"github.com/polterware/polterware/notes/backend/domains/space"
	"strings"
	"testing"
	"time"
)

func check(t *testing.T, e error) {
	t.Helper()
	if e != nil {
		t.Fatal(e)
	}
}
func ptr[T any](v T) *T { return &v }
func TestNoteRepositoryContract(t *testing.T) {
	f := testkit.Setup()
	ctx := f.Ctx
	now := f.Audit.Clock.Now()
	n, e := f.NS.Create(ctx, actor.UI(), space.Create{Name: "Space"})
	check(t, e)
	child, e := f.NS.Create(ctx, actor.UI(), space.Create{Name: "Child", ParentID: &n.ID})
	check(t, e)
	tag, e := f.TS.Create(ctx, actor.UI(), "Tag", nil)
	check(t, e)
	a := note.Note{ID: "a", Title: "Alpha", Content: strings.Repeat("😀", 130), SpaceID: &n.ID, Status: note.StatusActive, Rev: 1, DueAt: &now, CreatedAt: now, UpdatedAt: now, SortOrder: 2}
	b := a
	b.ID = "b"
	b.Title = "Beta"
	b.SpaceID = &child.ID
	b.DueAt = nil
	b.CreatedAt = now.Add(time.Hour)
	b.UpdatedAt = b.CreatedAt
	b.SortOrder = 1
	b.Pinned = true
	c := a
	c.ID = "c"
	c.Title = "Inbox item"
	c.SpaceID = nil
	c.DueAt = ptr(now.Add(time.Hour))
	c.Status = note.StatusCompleted
	for _, m := range []note.Note{a, b, c} {
		check(t, f.Mem.Insert(ctx, m))
	}
	if e = f.Mem.Insert(ctx, a); !fault.IsCode(e, fault.CodeExists) {
		t.Fatal(e)
	}
	bad := a
	bad.ID = "bad"
	bad.SpaceID = ptr("missing")
	if e = f.Mem.Insert(ctx, bad); !fault.IsCode(e, fault.CodeNotFound) {
		t.Fatal(e)
	}
	if e = f.Mem.Update(ctx, 2, a); !fault.IsCode(e, fault.CodeConflict) {
		t.Fatal(e)
	}
	a.Rev = 2
	check(t, f.Mem.Update(ctx, 1, a))
	if _, e = f.Mem.Get(ctx, "missing"); !fault.IsCode(e, fault.CodeNotFound) {
		t.Fatal(e)
	}
	bad.ID = "a"
	if e = f.Mem.Update(ctx, 0, bad); !fault.IsCode(e, fault.CodeNotFound) {
		t.Fatal(e)
	}
	check(t, f.Mem.SetTagIDs(ctx, a.ID, []string{tag.ID, tag.ID}))
	ids, e := f.Mem.ListTagIDs(ctx, a.ID)
	check(t, e)
	if len(ids) != 1 {
		t.Fatal(ids)
	}
	if e = f.Mem.SetTagIDs(ctx, a.ID, []string{"missing"}); !fault.IsCode(e, fault.CodeNotFound) {
		t.Fatal(e)
	}
	items := []note.CheckItem{{ID: "i", NoteID: a.ID, Title: "One", SortOrder: 1}, {ID: "j", NoteID: a.ID, Title: "Two", SortOrder: 0}}
	check(t, f.Mem.ReplaceCheckItems(ctx, a.ID, items))
	out, e := f.Mem.ListCheckItems(ctx, a.ID)
	check(t, e)
	if out[0].ID != "j" {
		t.Fatal(out)
	}
	item, e := f.Mem.GetCheckItem(ctx, "i")
	check(t, e)
	item.Done = true
	check(t, f.Mem.UpdateCheckItem(ctx, item))
	item.NoteID = b.ID
	if e = f.Mem.UpdateCheckItem(ctx, item); !fault.IsCode(e, fault.CodeInvalid) {
		t.Fatal(e)
	}
	if _, e = f.Mem.GetCheckItem(ctx, "missing"); !fault.IsCode(e, fault.CodeNotFound) {
		t.Fatal(e)
	}
	for _, items := range [][]note.CheckItem{{{ID: "i", NoteID: b.ID}}, {{ID: "i", NoteID: a.ID}, {ID: "i", NoteID: a.ID}}} {
		if e = f.Mem.ReplaceCheckItems(ctx, a.ID, items); !fault.IsCode(e, fault.CodeInvalid) {
			t.Fatal(e)
		}
	}
	if e = f.Mem.ReplaceCheckItems(ctx, b.ID, []note.CheckItem{{ID: "i", NoteID: b.ID}}); !fault.IsCode(e, fault.CodeExists) {
		t.Fatal(e)
	}
	completion := note.Completion{ID: "done", NoteID: a.ID, OccurrenceAt: now, CompletedAt: now}
	check(t, f.Mem.InsertCompletion(ctx, completion))
	duplicate := completion
	duplicate.ID = "other"
	if e = f.Mem.InsertCompletion(ctx, duplicate); !fault.IsCode(e, fault.CodeExists) {
		t.Fatal(e)
	}
	duplicate = completion
	duplicate.OccurrenceAt = now.Add(time.Hour)
	if e = f.Mem.InsertCompletion(ctx, duplicate); !fault.IsCode(e, fault.CodeExists) {
		t.Fatal(e)
	}
	duplicate.ID = "later"
	check(t, f.Mem.InsertCompletion(ctx, duplicate))
	check(t, f.Mem.DeleteCompletion(ctx, a.ID, now.Add(2*time.Hour)))
	check(t, f.Mem.DeleteCompletion(ctx, a.ID, now))
	nCount, e := f.Mem.CountBySpaces(ctx, []string{n.ID, child.ID})
	check(t, e)
	if nCount != 2 {
		t.Fatal(nCount)
	}
	check(t, f.Store.Put(ctx, "schedules", a.ID, schedule.Schedule{NoteID: a.ID}))
	check(t, f.Store.Put(ctx, "places", b.ID, struct{ NoteID string }{b.ID}))
	for _, tc := range []struct {
		filter note.ListFilter
		ids    string
	}{{note.ListFilter{InboxOnly: true}, "c"}, {note.ListFilter{SpaceID: &n.ID}, "a"}, {note.ListFilter{SpaceID: &n.ID, IncludeDescendants: true}, "ba"}, {note.ListFilter{Pinned: ptr(true)}, "b"}, {note.ListFilter{Status: note.StatusCompleted}, "c"}, {note.ListFilter{TagIDs: []string{tag.ID}}, "a"}, {note.ListFilter{TagIDs: []string{"missing"}}, ""}, {note.ListFilter{DueFrom: &now, DueTo: ptr(now.Add(time.Hour))}, "a"}, {note.ListFilter{UpdatedFrom: ptr(now.Add(time.Hour)), UpdatedTo: ptr(now.Add(2 * time.Hour))}, "b"}, {note.ListFilter{HasSchedule: ptr(true)}, "a"}, {note.ListFilter{HasPlace: ptr(true)}, "b"}, {note.ListFilter{HasSchedule: ptr(false), HasPlace: ptr(false)}, "c"}, {note.ListFilter{Query: "alpha"}, "a"}, {note.ListFilter{Order: note.OrderManual}, "bac"}, {note.ListFilter{Order: note.OrderDue}, "acb"}, {note.ListFilter{Order: note.OrderCreated}, "bac"}} {
		page, e := f.Mem.List(ctx, tc.filter)
		check(t, e)
		ids := ""
		for _, m := range page.Notes {
			ids += m.ID
			if len([]rune(m.Snippet)) > 120 {
				t.Fatal("snippet too long")
			}
		}
		if ids != tc.ids {
			t.Fatalf("%+v: got %s, want %s", tc.filter, ids, tc.ids)
		}
	}
	page, e := f.Mem.List(ctx, note.ListFilter{Limit: 1})
	check(t, e)
	first := page.Notes[0].ID
	check(t, f.Mem.Delete(ctx, 0, first))
	next, e := f.Mem.List(ctx, note.ListFilter{Limit: 1, Cursor: page.NextCursor})
	check(t, e)
	if len(next.Notes) != 1 || next.Notes[0].ID == first {
		t.Fatal(next)
	}
	for _, filt := range []note.ListFilter{{Cursor: "!bad"}, {Limit: -1}, {Limit: 501}} {
		_, e := f.Mem.List(ctx, filt)
		if !fault.IsCode(e, fault.CodeInvalid) {
			t.Fatal(e)
		}
	}
	check(t, f.Store.Put(ctx, "attachments", "attach", struct{ ID, NoteID string }{"attach", a.ID}))
	check(t, f.Focus.InsertSession(ctx, focus.Session{ID: "focus", NoteID: &a.ID, StartedAt: now}))
	check(t, f.Mem.Delete(ctx, 0, a.ID))
	if _, e = f.Mem.GetCheckItem(ctx, "i"); !fault.IsCode(e, fault.CodeNotFound) {
		t.Fatal(e)
	}
	cs, e := f.Mem.ListCompletions(ctx, a.ID)
	check(t, e)
	if len(cs) != 0 {
		t.Fatal(cs)
	}
	ss, e := f.Focus.ListSessions(ctx, now, now.Add(time.Hour))
	check(t, e)
	if len(ss) != 1 || ss[0].NoteID != nil {
		t.Fatal(ss)
	}
	if e = f.Mem.Delete(ctx, 0, "missing"); !fault.IsCode(e, fault.CodeNotFound) {
		t.Fatal(e)
	}
}
func TestRepositoryCancellation(t *testing.T) {
	f := testkit.Setup()
	ctx, cancel := context.WithCancel(f.Ctx)
	cancel()
	for _, call := range []func() error{func() error { _, e := f.Mem.Get(ctx, "id"); return e }, func() error { _, e := f.Mem.List(ctx, note.ListFilter{}); return e }, func() error { return f.Mem.Insert(ctx, note.Note{}) }, func() error { return f.Mem.Update(ctx, 1, note.Note{}) }, func() error { return f.Mem.Delete(ctx, 0, "id") }, func() error { _, e := f.Mem.ListCheckItems(ctx, "id"); return e }, func() error { _, e := f.Mem.GetCheckItem(ctx, "id"); return e }, func() error { return f.Mem.UpdateCheckItem(ctx, note.CheckItem{}) }, func() error { return f.Mem.ReplaceCheckItems(ctx, "id", nil) }, func() error { _, e := f.Mem.ListTagIDs(ctx, "id"); return e }, func() error { return f.Mem.SetTagIDs(ctx, "id", nil) }, func() error { _, e := f.Mem.ListCompletions(ctx, "id"); return e }, func() error { return f.Mem.InsertCompletion(ctx, note.Completion{}) }, func() error { return f.Mem.DeleteCompletion(ctx, "id", time.Time{}) }, func() error { _, e := f.Mem.CountBySpaces(ctx, nil); return e }} {
		if e := call(); !errors.Is(e, context.Canceled) {
			t.Fatal(e)
		}
	}
}
