package fake_test

import (
	"context"
	"errors"
	"github.com/polterware/polterware/notes/backend/domains/activity/fake/testkit"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/tag"
	"testing"
)

func TestTagRepositoryContract(t *testing.T) {
	f := testkit.Setup()
	ctx := f.Ctx
	one := tag.Tag{ID: "one", Name: "One", Rev: 1}
	two := tag.Tag{ID: "two", Name: "Two", Rev: 1}
	for _, v := range []tag.Tag{one, two} {
		if e := f.Tags.Insert(ctx, v); e != nil {
			t.Fatal(e)
		}
	}
	for _, v := range []tag.Tag{one, {ID: "other", Name: "ONE"}} {
		if e := f.Tags.Insert(ctx, v); !fault.IsCode(e, fault.CodeExists) {
			t.Fatal(e)
		}
	}
	got, e := f.Tags.GetByName(ctx, "oNe")
	if e != nil || got.ID != one.ID {
		t.Fatal(got, e)
	}
	if _, e = f.Tags.GetByName(ctx, "missing"); !fault.IsCode(e, fault.CodeNotFound) {
		t.Fatal(e)
	}
	if e = f.Tags.Update(ctx, 2, one); !fault.IsCode(e, fault.CodeConflict) {
		t.Fatal(e)
	}
	bad := one
	bad.Name = "two"
	if e = f.Tags.Update(ctx, 1, bad); !fault.IsCode(e, fault.CodeExists) {
		t.Fatal(e)
	}
	one.Rev = 2
	if e = f.Tags.Update(ctx, 1, one); e != nil {
		t.Fatal(e)
	}
	for _, id := range []string{"a", "b"} {
		if e = f.Mem.Insert(ctx, note.Note{ID: id}); e != nil {
			t.Fatal(e)
		}
		if e = f.Mem.SetTagIDs(ctx, id, []string{one.ID, two.ID}); e != nil {
			t.Fatal(e)
		}
	}
	got, e = f.Tags.Get(ctx, one.ID)
	if e != nil || got.UsageCount != 2 {
		t.Fatal(got, e)
	}
	names, e := f.Tags.Names(ctx)
	if e != nil || len(names) != 2 {
		t.Fatal(names, e)
	}
	n, e := f.Tags.Retarget(ctx, one.ID, two.ID)
	if e != nil || n != 2 {
		t.Fatal(n, e)
	}
	for _, args := range [][2]string{{"missing", two.ID}, {one.ID, "missing"}} {
		if _, e = f.Tags.Retarget(ctx, args[0], args[1]); !fault.IsCode(e, fault.CodeNotFound) {
			t.Fatal(e)
		}
	}
	if e = f.Tags.Delete(ctx, one.ID); e != nil {
		t.Fatal(e)
	}
	if e = f.Tags.Delete(ctx, two.ID); e != nil {
		t.Fatal(e)
	}
	ids, e := f.Mem.ListTagIDs(ctx, "a")
	if e != nil || len(ids) != 0 {
		t.Fatal(ids, e)
	}
	if e = f.Tags.Delete(ctx, "missing"); !fault.IsCode(e, fault.CodeNotFound) {
		t.Fatal(e)
	}
	c, cancel := context.WithCancel(ctx)
	cancel()
	for _, call := range []func() error{func() error { _, e := f.Tags.List(c); return e }, func() error { _, e := f.Tags.Get(c, "id"); return e }, func() error { _, e := f.Tags.GetByName(c, "name"); return e }, func() error { _, e := f.Tags.Names(c); return e }, func() error { return f.Tags.Insert(c, one) }, func() error { return f.Tags.Update(c, 1, one) }, func() error { return f.Tags.Delete(c, "id") }, func() error { _, e := f.Tags.Retarget(c, one.ID, two.ID); return e }} {
		if e := call(); !errors.Is(e, context.Canceled) {
			t.Fatal(e)
		}
	}
}
