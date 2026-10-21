package space_test

import (
	"context"
	"errors"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/space"
	"strings"
	"sync"
	"testing"
)

func TestTreeRules(t *testing.T) {
	f := setup()
	ctx := f.Ctx
	a := actor.UI()
	root, e := f.NS.Create(ctx, a, space.Create{Name: "Root", Color: ptr("#AABBCC"), Icon: ptr("folder")})
	check(t, e)
	child, e := f.NS.Create(ctx, a, space.Create{Name: "Child", ParentID: &root.ID})
	check(t, e)
	leaf, e := f.NS.Create(ctx, a, space.Create{Name: "Leaf", ParentID: &child.ID})
	check(t, e)
	for _, tc := range []struct {
		name string
		p    space.Patch
		code string
	}{{"self", space.Patch{ParentID: &root.ID}, fault.CodeCycle}, {"descendant", space.Patch{ParentID: &leaf.ID}, fault.CodeCycle}, {"missing", space.Patch{ParentID: ptr("missing")}, fault.CodeNotFound}, {"blank", space.Patch{Name: ptr(" ")}, fault.CodeInvalid}, {"long", space.Patch{Name: ptr(strings.Repeat("a", 121))}, fault.CodeInvalid}, {"color", space.Patch{Color: ptr("red")}, fault.CodeInvalid}, {"conflicting parent", space.Patch{ParentID: &child.ID, ClearParent: true}, fault.CodeInvalid}, {"conflicting color", space.Patch{Color: ptr("#ABCDEF"), ClearColor: true}, fault.CodeInvalid}, {"conflicting icon", space.Patch{Icon: ptr("x"), ClearIcon: true}, fault.CodeInvalid}} {
		t.Run(tc.name, func(t *testing.T) { _, e := f.NS.Update(ctx, a, root.ID, 1, tc.p); code(t, e, tc.code) })
	}
	_, e = f.NS.Update(ctx, a, root.ID, 99, space.Patch{})
	code(t, e, fault.CodeConflict)
	_, e = f.NS.Update(ctx, a, "missing", 1, space.Patch{})
	code(t, e, fault.CodeNotFound)
	updated, e := f.NS.Update(ctx, a, root.ID, 1, space.Patch{Name: ptr("Renamed"), Color: ptr("#010203"), Icon: ptr("star"), SortOrder: ptr(9)})
	check(t, e)
	if updated.Rev != 2 || updated.Name != "Renamed" {
		t.Fatal(updated)
	}
	updated, e = f.NS.Update(ctx, a, root.ID, 2, space.Patch{ClearColor: true, ClearIcon: true})
	check(t, e)
	if updated.Color != nil || updated.Icon != nil {
		t.Fatal(updated)
	}
	child, e = f.NS.Update(ctx, a, child.ID, 1, space.Patch{ClearParent: true})
	check(t, e)
	child, e = f.NS.Update(ctx, a, child.ID, 2, space.Patch{ParentID: &root.ID})
	check(t, e)
	_, e = f.NS.Get(ctx, root.ID)
	check(t, e)
	rows, e := f.NS.List(ctx)
	check(t, e)
	if len(rows) != 3 {
		t.Fatal(rows)
	}
	found, e := space.ResolveName(ctx, f.Spaces, "renamed")
	check(t, e)
	if found.ID != root.ID {
		t.Fatal(found)
	}
	_, e = space.ResolveName(ctx, f.Spaces, "rename")
	code(t, e, fault.CodeNotFound)
	_, e = f.MS.Create(ctx, a, note.Create{Title: "Survives", SpaceID: &leaf.ID})
	check(t, e)
	result, e := f.NS.Delete(ctx, a, root.ID, 0)
	check(t, e)
	if len(result.DeletedSpaceIDs) != 3 || result.MovedNoteCount != 1 {
		t.Fatal(result)
	}
	page, e := f.MS.List(ctx, note.ListFilter{InboxOnly: true})
	check(t, e)
	if len(page.Notes) != 1 {
		t.Fatal(page)
	}
	_, e = f.NS.Delete(ctx, a, "missing", 0)
	code(t, e, fault.CodeNotFound)
}
func TestSpaceCreateAndReorder(t *testing.T) {
	f := setup()
	for _, in := range []space.Create{{Name: ""}, {Name: "X", Color: ptr("#GGGGGG")}, {Name: "X", ParentID: ptr("missing")}} {
		_, e := f.NS.Create(f.Ctx, actor.UI(), in)
		if e == nil {
			t.Fatal(in)
		}
	}
	one, e := f.NS.Create(f.Ctx, actor.CLI(), space.Create{Name: "One"})
	check(t, e)
	two, e := f.NS.Create(f.Ctx, actor.CLI(), space.Create{Name: "Two"})
	check(t, e)
	for _, ids := range [][]string{{one.ID}, {one.ID, one.ID}, {one.ID, "missing"}} {
		_, e := f.NS.Reorder(f.Ctx, actor.CLI(), nil, ids)
		code(t, e, fault.CodeInvalid)
	}
	rows, e := f.NS.Reorder(f.Ctx, actor.CLI(), nil, []string{two.ID, one.ID})
	check(t, e)
	if rows[0].SortOrder != 0 || rows[1].SortOrder != 1 || rows[0].Rev != 2 {
		t.Fatal(rows)
	}
}

type brokenSpace struct {
	space.Repository
	method string
	err    error
}

func (r brokenSpace) List(c context.Context) ([]space.Space, error) {
	if r.method == "list" {
		return nil, r.err
	}
	return r.Repository.List(c)
}
func (r brokenSpace) Get(c context.Context, id string) (space.Space, error) {
	if r.method == "get" {
		return space.Space{}, r.err
	}
	return r.Repository.Get(c, id)
}
func (r brokenSpace) Update(c context.Context, rev int64, m space.Space) error {
	if r.method == "update" {
		return r.err
	}
	return r.Repository.Update(c, rev, m)
}

type brokenCount struct{ note.Repository }

func (r brokenCount) CountBySpaces(context.Context, []string) (int, error) {
	return 0, errors.New("count failed")
}
func TestSpaceFailureRollback(t *testing.T) {
	for _, method := range []string{"list", "get", "update", "count"} {
		t.Run(method, func(t *testing.T) {
			f := setup()
			m, e := f.NS.Create(f.Ctx, actor.UI(), space.Create{Name: "X"})
			check(t, e)
			err := errors.New("failed")
			counter := space.NoteCounter(f.Mem)
			if method == "count" {
				counter = brokenCount{f.Mem}
			}
			s := space.NewService(brokenSpace{f.Spaces, method, err}, counter, f.Audit)
			switch method {
			case "list":
				_, e = space.ResolveName(f.Ctx, brokenSpace{f.Spaces, method, err}, "X")
				if !errors.Is(e, err) {
					t.Fatal(e)
				}
				_, e = s.Delete(f.Ctx, actor.UI(), m.ID, 0)
				if e == nil {
					t.Fatal("delete succeeded")
				}
				_, e = s.Reorder(f.Ctx, actor.UI(), nil, []string{m.ID})
				if e == nil {
					t.Fatal("reorder succeeded")
				}
			case "get":
				_, e = s.Update(f.Ctx, actor.UI(), m.ID, 1, space.Patch{})
			case "update":
				_, e = s.Update(f.Ctx, actor.UI(), m.ID, 1, space.Patch{})
			case "count":
				_, e = s.Delete(f.Ctx, actor.UI(), m.ID, 0)
			}
			if e == nil {
				t.Fatal("failure not propagated")
			}
			got, e := f.NS.Get(f.Ctx, m.ID)
			check(t, e)
			if got.Rev != 1 {
				t.Fatal(got)
			}
		})
	}
}

func TestSpaceDeleteExpectedRev(t *testing.T) {
	a := actor.UI()
	for _, tc := range []struct {
		name string
		rev  int64
		want string
	}{{"zero skips", 0, ""}, {"match", 1, ""}, {"stale", 99, fault.CodeConflict}} {
		t.Run(tc.name, func(t *testing.T) {
			f := setup()
			m, e := f.NS.Create(f.Ctx, a, space.Create{Name: "Work"})
			check(t, e)
			_, e = f.NS.Delete(f.Ctx, a, m.ID, tc.rev)
			if tc.want == "" {
				check(t, e)
				return
			}
			code(t, e, tc.want)
			got, e := f.NS.Get(f.Ctx, m.ID)
			check(t, e)
			if got.Rev != 1 {
				t.Fatal(got)
			}
		})
	}
}

func TestConcurrentSpaceDeleteWriters(t *testing.T) {
	f := setup()
	a := actor.UI()
	m, e := f.NS.Create(f.Ctx, a, space.Create{Name: "Race"})
	check(t, e)
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		name := "UI"
		_, err := f.NS.Update(f.Ctx, a, m.ID, 1, space.Patch{Name: &name})
		errs <- err
	}()
	go func() {
		defer wg.Done()
		_, err := f.NS.Delete(f.Ctx, a, m.ID, 1)
		errs <- err
	}()
	wg.Wait()
	close(errs)
	ok, lost := 0, 0
	for err := range errs {
		if err == nil {
			ok++
			continue
		}
		if fault.IsCode(err, fault.CodeConflict) || fault.IsCode(err, fault.CodeNotFound) {
			lost++
			continue
		}
		t.Fatal(err)
	}
	if ok != 1 || lost != 1 {
		t.Fatalf("ok=%d lost=%d", ok, lost)
	}
}
