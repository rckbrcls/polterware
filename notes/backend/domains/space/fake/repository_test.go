package fake_test

import (
	"context"
	"errors"
	"github.com/polterware/polterware/notes/backend/domains/activity/fake/testkit"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/space"
	"testing"
)

func TestSpaceRepositoryContract(t *testing.T) {
	f := testkit.Setup()
	ctx := f.Ctx
	parent := space.Space{ID: "parent", Name: "Parent", Rev: 1}
	child := space.Space{ID: "child", ParentID: &parent.ID, Name: "Child", Rev: 1}
	for _, m := range []space.Space{parent, child} {
		if e := f.Spaces.Insert(ctx, m); e != nil {
			t.Fatal(e)
		}
	}
	if e := f.Spaces.Insert(ctx, parent); !fault.IsCode(e, fault.CodeExists) {
		t.Fatal(e)
	}
	missing := "missing"
	bad := space.Space{ID: "bad", ParentID: &missing}
	if e := f.Spaces.Insert(ctx, bad); !fault.IsCode(e, fault.CodeNotFound) {
		t.Fatal(e)
	}
	if _, e := f.Spaces.Get(ctx, "missing"); !fault.IsCode(e, fault.CodeNotFound) {
		t.Fatal(e)
	}
	if e := f.Spaces.Update(ctx, 2, parent); !fault.IsCode(e, fault.CodeConflict) {
		t.Fatal(e)
	}
	parent.Rev = 2
	if e := f.Spaces.Update(ctx, 1, parent); e != nil {
		t.Fatal(e)
	}
	child.ParentID = &missing
	if e := f.Spaces.Update(ctx, 0, child); !fault.IsCode(e, fault.CodeNotFound) {
		t.Fatal(e)
	}
	rows, e := f.Spaces.List(ctx)
	if e != nil || len(rows) != 2 {
		t.Fatal(rows, e)
	}
	if e = f.Mem.Insert(ctx, note.Note{ID: "survivor", SpaceID: &parent.ID}); e != nil {
		t.Fatal(e)
	}
	if e = f.Spaces.Delete(ctx, 0, parent.ID); e != nil {
		t.Fatal(e)
	}
	rows, e = f.Spaces.List(ctx)
	if e != nil || len(rows) != 0 {
		t.Fatal(rows, e)
	}
	m, e := f.Mem.Get(ctx, "survivor")
	if e != nil || m.SpaceID != nil {
		t.Fatal(m, e)
	}
	if e = f.Spaces.Delete(ctx, 0, "missing"); !fault.IsCode(e, fault.CodeNotFound) {
		t.Fatal(e)
	}
	c, cancel := context.WithCancel(ctx)
	cancel()
	for _, call := range []func() error{func() error { _, e := f.Spaces.Get(c, "id"); return e }, func() error { _, e := f.Spaces.List(c); return e }, func() error { return f.Spaces.Insert(c, parent) }, func() error { return f.Spaces.Update(c, 1, parent) }, func() error { return f.Spaces.Delete(c, 0, "id") }} {
		if e := call(); !errors.Is(e, context.Canceled) {
			t.Fatal(e)
		}
	}
}
