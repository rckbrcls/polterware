package repotest

import (
	"context"
	"errors"
	"testing"

	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/focus"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/place"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
	"github.com/polterware/polterware/notes/backend/domains/space"
	"github.com/polterware/polterware/notes/backend/domains/tag"
)

func testSpaceCascadeAndRev(t *testing.T, setup func(*testing.T) (Repos, func())) {
	r, done := setup(t)
	defer done()
	ctx := context.Background()
	root := space.Space{ID: "root", Name: "Root", CreatedAt: at(1), UpdatedAt: at(1), Rev: 1}
	child := space.Space{ID: "child", ParentID: ptr("root"), Name: "Child", CreatedAt: at(2), UpdatedAt: at(2), Rev: 1}
	if err := r.Spaces.Insert(ctx, root); err != nil {
		t.Fatal(err)
	}
	if err := r.Spaces.Insert(ctx, child); err != nil {
		t.Fatal(err)
	}
	mem := note.Note{ID: "mem1", SpaceID: ptr("child"), Title: "Keep me", Status: note.StatusActive, CreatedAt: at(3), UpdatedAt: at(3), Rev: 1}
	if err := r.Notes.Insert(ctx, mem); err != nil {
		t.Fatal(err)
	}
	inbox := note.Note{ID: "inbox", Title: "Inbox", Status: note.StatusActive, CreatedAt: at(4), UpdatedAt: at(4), Rev: 1}
	if err := r.Notes.Insert(ctx, inbox); err != nil {
		t.Fatal(err)
	}
	stale := root
	stale.Name = "Nope"
	stale.Rev = 2
	if err := r.Spaces.Update(ctx, 99, stale); !fault.IsCode(err, fault.CodeConflict) {
		t.Fatalf("rev conflict: %v", err)
	}
	if err := r.Spaces.Delete(ctx, 0, "root"); err != nil {
		t.Fatal(err)
	}
	if _, err := r.Spaces.Get(ctx, "child"); !fault.IsCode(err, fault.CodeNotFound) {
		t.Fatalf("child survived: %v", err)
	}
	got, err := r.Notes.Get(ctx, "mem1")
	if err != nil {
		t.Fatal(err)
	}
	if got.SpaceID != nil {
		t.Fatalf("space_id not nulled: %+v", got.SpaceID)
	}
	if _, err := r.Notes.Get(ctx, "inbox"); err != nil {
		t.Fatal(err)
	}
}

func testNoteGraph(t *testing.T, setup func(*testing.T) (Repos, func())) {
	r, done := setup(t)
	defer done()
	ctx := context.Background()
	m := note.Note{ID: "m", Title: "Task", Content: "body", Status: note.StatusActive, CreatedAt: at(1), UpdatedAt: at(1), Rev: 1}
	if err := r.Notes.Insert(ctx, m); err != nil {
		t.Fatal(err)
	}
	if err := r.Tags.Insert(ctx, tag.Tag{ID: "t1", Name: "Work", CreatedAt: at(1), UpdatedAt: at(1), Rev: 1}); err != nil {
		t.Fatal(err)
	}
	if err := r.Notes.SetTagIDs(ctx, "m", []string{"t1"}); err != nil {
		t.Fatal(err)
	}
	items := []note.CheckItem{{
		ID: "c1", NoteID: "m", Title: "one", Detail: "detail", SortOrder: 0, CreatedAt: at(2), UpdatedAt: at(2),
	}}
	if err := r.Notes.ReplaceCheckItems(ctx, "m", items); err != nil {
		t.Fatal(err)
	}
	if err := r.Notes.InsertCompletion(ctx, note.Completion{ID: "k1", NoteID: "m", OccurrenceAt: at(10), CompletedAt: at(11)}); err != nil {
		t.Fatal(err)
	}
	got, err := r.Notes.Get(ctx, "m")
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != "Task" {
		t.Fatalf("get: %+v", got)
	}
	tags, err := r.Notes.ListTagIDs(ctx, "m")
	if err != nil || len(tags) != 1 || tags[0] != "t1" {
		t.Fatalf("tags: %v %v", tags, err)
	}
	checks, err := r.Notes.ListCheckItems(ctx, "m")
	if err != nil || len(checks) != 1 || checks[0].Detail != "detail" {
		t.Fatalf("checks: %+v %v", checks, err)
	}
	comps, err := r.Notes.ListCompletions(ctx, "m")
	if err != nil || len(comps) != 1 {
		t.Fatalf("completions: %v %v", comps, err)
	}
	next := got
	next.Title = "Renamed"
	next.Rev = 2
	next.UpdatedAt = at(20)
	if err := r.Notes.Update(ctx, 1, next); err != nil {
		t.Fatal(err)
	}
	if err := r.Notes.Update(ctx, 1, next); !fault.IsCode(err, fault.CodeConflict) {
		t.Fatalf("note rev: %v", err)
	}
	if err := r.Notes.DeleteCompletion(ctx, "m", at(10)); err != nil {
		t.Fatal(err)
	}
}

func testNoteKeyset(t *testing.T, setup func(*testing.T) (Repos, func())) {
	r, done := setup(t)
	defer done()
	ctx := context.Background()
	for i := 0; i < 5; i++ {
		m := note.Note{
			ID: string(rune('a' + i)), Title: string(rune('A' + i)), Status: note.StatusActive,
			CreatedAt: at(i), UpdatedAt: at(10 + i), Rev: 1,
		}
		if err := r.Notes.Insert(ctx, m); err != nil {
			t.Fatal(err)
		}
	}
	page1, err := r.Notes.List(ctx, note.ListFilter{Order: note.OrderUpdated, Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(page1.Notes) != 2 || page1.NextCursor == "" || page1.Total != 5 {
		t.Fatalf("page1: %+v", page1)
	}
	if page1.Notes[0].UpdatedAt.Before(page1.Notes[1].UpdatedAt) {
		t.Fatal("not descending")
	}
	page2, err := r.Notes.List(ctx, note.ListFilter{Order: note.OrderUpdated, Limit: 2, Cursor: page1.NextCursor})
	if err != nil {
		t.Fatal(err)
	}
	if page2.Notes[0].ID == page1.Notes[0].ID || page2.Notes[0].ID == page1.Notes[1].ID {
		t.Fatalf("offset reused: %s", page2.Notes[0].ID)
	}
	seen := map[string]bool{}
	for _, p := range []note.ListPage{page1, page2} {
		for _, m := range p.Notes {
			if seen[m.ID] {
				t.Fatalf("duplicate %s", m.ID)
			}
			seen[m.ID] = true
		}
	}
}

func testTagRetarget(t *testing.T, setup func(*testing.T) (Repos, func())) {
	r, done := setup(t)
	defer done()
	ctx := context.Background()
	if err := r.Notes.Insert(ctx, note.Note{ID: "m", Title: "x", Status: note.StatusActive, CreatedAt: at(1), UpdatedAt: at(1), Rev: 1}); err != nil {
		t.Fatal(err)
	}
	if err := r.Tags.Insert(ctx, tag.Tag{ID: "a", Name: "alpha", CreatedAt: at(1), UpdatedAt: at(1), Rev: 1}); err != nil {
		t.Fatal(err)
	}
	if err := r.Tags.Insert(ctx, tag.Tag{ID: "b", Name: "beta", CreatedAt: at(1), UpdatedAt: at(1), Rev: 1}); err != nil {
		t.Fatal(err)
	}
	if err := r.Notes.SetTagIDs(ctx, "m", []string{"a"}); err != nil {
		t.Fatal(err)
	}
	n, err := r.Tags.Retarget(ctx, "a", "b")
	if err != nil || n == 0 {
		t.Fatalf("retarget %d %v", n, err)
	}
	ids, err := r.Notes.ListTagIDs(ctx, "m")
	if err != nil || len(ids) != 1 || ids[0] != "b" {
		t.Fatalf("tags after retarget: %v %v", ids, err)
	}
	listed, err := r.Tags.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range listed {
		if item.ID == "b" && item.UsageCount != 1 {
			t.Fatalf("usage: %+v", item)
		}
	}
}

func testRelated(t *testing.T, setup func(*testing.T) (Repos, func())) {
	r, done := setup(t)
	defer done()
	ctx := context.Background()
	if err := r.Notes.Insert(ctx, note.Note{ID: "m", Title: "x", Status: note.StatusActive, CreatedAt: at(1), UpdatedAt: at(1), Rev: 1}); err != nil {
		t.Fatal(err)
	}
	if err := r.Schedules.Upsert(ctx, schedule.Schedule{
		NoteID: "m", Active: true, FireAt: at(50), TZ: "UTC", EndType: schedule.EndNever, Every: 1, FocusAutoContinue: true, UpdatedAt: at(2),
	}); err != nil {
		t.Fatal(err)
	}
	got, err := r.Schedules.Get(ctx, "m")
	if err != nil || !got.Active || got.TZ != "UTC" {
		t.Fatalf("schedule: %+v %v", got, err)
	}
	if err := r.Places.Upsert(ctx, place.Place{NoteID: "m", Lat: -23.5, Lng: -46.6, RadiusM: 200, Event: place.EventEnter, Active: true, UpdatedAt: at(3)}); err != nil {
		t.Fatal(err)
	}
	in, err := r.Places.ListInBounds(ctx, place.Bounds{South: -24, West: -47, North: -23, East: -46})
	if err != nil || len(in) != 1 {
		t.Fatalf("bounds: %v %v", in, err)
	}
	if err := r.Settings.Set(ctx, "appearance.theme", `"dark"`); err != nil {
		t.Fatal(err)
	}
	v, ok, err := r.Settings.Get(ctx, "appearance.theme")
	if err != nil || !ok || v != `"dark"` {
		t.Fatalf("settings %s %v %v", v, ok, err)
	}
	if err := r.Focus.InsertSession(ctx, focus.Session{
		ID: "f1", Phase: focus.PhaseWork, PlannedS: 1500, ElapsedS: 60, State: focus.StateCompleted, StartedAt: at(100), EndedAt: at(160),
	}); err != nil {
		t.Fatal(err)
	}
	sessions, err := r.Focus.ListSessions(ctx, at(0), at(200))
	if err != nil || len(sessions) != 1 {
		t.Fatalf("focus: %v %v", sessions, err)
	}
}

func testActivity(t *testing.T, setup func(*testing.T) (Repos, func())) {
	r, done := setup(t)
	defer done()
	ctx := context.Background()
	for i := 0; i < 3; i++ {
		if err := r.Activity.Append(ctx, activity.Event{
			ID: string(rune('1' + i)), At: at(10 + i), Actor: "ui", Entity: "note", EntityID: "m", Op: activity.OpCreate, Summary: "x",
		}); err != nil {
			t.Fatal(err)
		}
	}
	page, err := r.Activity.List(ctx, "", "ui", 2)
	if err != nil || len(page.Events) != 2 || page.NextCursor == "" {
		t.Fatalf("activity: %+v %v", page, err)
	}
	page2, err := r.Activity.List(ctx, page.NextCursor, "ui", 2)
	if err != nil || len(page2.Events) != 1 {
		t.Fatalf("activity page2: %+v %v", page2, err)
	}
}

func testTxRollback(t *testing.T, setup func(*testing.T) (Repos, func())) {
	r, done := setup(t)
	defer done()
	ctx := context.Background()
	if err := r.Notes.Insert(ctx, note.Note{ID: "keep", Title: "keep", Status: note.StatusActive, CreatedAt: at(1), UpdatedAt: at(1), Rev: 1}); err != nil {
		t.Fatal(err)
	}
	errBoom := errors.New("boom")
	err := r.Tx.Within(ctx, func(ctx context.Context) error {
		if err := r.Notes.Insert(ctx, note.Note{ID: "drop", Title: "drop", Status: note.StatusActive, CreatedAt: at(2), UpdatedAt: at(2), Rev: 1}); err != nil {
			return err
		}
		return errBoom
	})
	if !errors.Is(err, errBoom) {
		t.Fatalf("within: %v", err)
	}
	if _, err := r.Notes.Get(ctx, "drop"); !fault.IsCode(err, fault.CodeNotFound) {
		t.Fatalf("rolled back insert visible: %v", err)
	}
	if _, err := r.Notes.Get(ctx, "keep"); err != nil {
		t.Fatal(err)
	}
}
