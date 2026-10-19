package tag_test

import (
	"context"
	"errors"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/tag"
	"strings"
	"testing"
)

func TestTagRules(t *testing.T) {
	f := setup()
	a := actor.MCP("test")
	one, e := f.TS.Create(f.Ctx, a, " One ", ptr("#abcdef"))
	check(t, e)
	two, e := f.TS.Create(f.Ctx, a, "Two", nil)
	check(t, e)
	for _, tc := range []struct {
		name  string
		color *string
		code  string
	}{{"", nil, fault.CodeInvalid}, {strings.Repeat("a", 61), nil, fault.CodeInvalid}, {"one", nil, fault.CodeExists}, {"Bad", ptr("#GGGGGG"), fault.CodeInvalid}, {"Bad", ptr("red"), fault.CodeInvalid}} {
		_, e := f.TS.Create(f.Ctx, a, tc.name, tc.color)
		code(t, e, tc.code)
	}
	for _, p := range []tag.Patch{{Name: ptr("")}, {Color: ptr("red")}, {Color: ptr("#abcdef"), ClearColor: true}} {
		_, e := f.TS.Update(f.Ctx, a, one.ID, 1, p)
		code(t, e, fault.CodeInvalid)
	}
	_, e = f.TS.Update(f.Ctx, a, one.ID, 1, tag.Patch{Name: ptr("two")})
	code(t, e, fault.CodeExists)
	_, e = f.TS.Update(f.Ctx, a, one.ID, 9, tag.Patch{})
	code(t, e, fault.CodeConflict)
	_, e = f.TS.Update(f.Ctx, a, "missing", 0, tag.Patch{})
	code(t, e, fault.CodeNotFound)
	one, e = f.TS.Update(f.Ctx, a, one.ID, 1, tag.Patch{Name: ptr("ONE"), Color: ptr("#000000")})
	check(t, e)
	one, e = f.TS.Update(f.Ctx, a, one.ID, 2, tag.Patch{ClearColor: true})
	check(t, e)
	if one.Rev != 3 || one.Color != nil {
		t.Fatal(one)
	}
	rows, e := f.TS.List(f.Ctx)
	check(t, e)
	if len(rows) != 2 {
		t.Fatal(rows)
	}
	got, e := tag.ResolveName(f.Ctx, f.Tags, "one")
	check(t, e)
	if got.ID != one.ID {
		t.Fatal(got)
	}
	_, e = tag.ResolveName(f.Ctx, f.Tags, "on")
	code(t, e, fault.CodeNotFound)
	m, e := f.MS.Create(f.Ctx, a, note.Create{Title: "Tagged", TagIDs: []string{one.ID, two.ID}})
	check(t, e)
	_, e = f.TS.Merge(f.Ctx, a, one.ID, one.ID)
	code(t, e, fault.CodeInvalid)
	_, e = f.TS.Merge(f.Ctx, a, one.ID, "missing")
	code(t, e, fault.CodeNotFound)
	merged, e := f.TS.Merge(f.Ctx, a, one.ID, two.ID)
	check(t, e)
	if merged.MovedNoteCount != 1 || merged.Target.Rev != 2 {
		t.Fatal(merged)
	}
	ids, e := f.Mem.ListTagIDs(f.Ctx, m.ID)
	check(t, e)
	if len(ids) != 1 || ids[0] != two.ID {
		t.Fatal(ids)
	}
	check(t, f.TS.Delete(f.Ctx, a, two.ID))
	ids, e = f.Mem.ListTagIDs(f.Ctx, m.ID)
	check(t, e)
	if len(ids) != 0 {
		t.Fatal(ids)
	}
	code(t, f.TS.Delete(f.Ctx, a, "missing"), fault.CodeNotFound)
}

type brokenTag struct {
	tag.Repository
	method string
	err    error
}

func (r brokenTag) List(c context.Context) ([]tag.Tag, error) {
	if r.method == "list" {
		return nil, r.err
	}
	return r.Repository.List(c)
}
func (r brokenTag) GetByName(c context.Context, name string) (tag.Tag, error) {
	if r.method == "name" {
		return tag.Tag{}, r.err
	}
	return r.Repository.GetByName(c, name)
}
func (r brokenTag) Update(c context.Context, rev int64, v tag.Tag) error {
	if r.method == "update" {
		return r.err
	}
	return r.Repository.Update(c, rev, v)
}
func (r brokenTag) Retarget(c context.Context, from, to string) (int, error) {
	if r.method == "retarget" {
		return 0, r.err
	}
	return r.Repository.Retarget(c, from, to)
}
func (r brokenTag) Delete(c context.Context, id string) error {
	if r.method == "delete" {
		return r.err
	}
	return r.Repository.Delete(c, id)
}
func TestTagFailureRollback(t *testing.T) {
	for _, method := range []string{"list", "name", "update", "retarget", "delete"} {
		t.Run(method, func(t *testing.T) {
			f := setup()
			one, e := f.TS.Create(f.Ctx, actor.UI(), "One", nil)
			check(t, e)
			two, e := f.TS.Create(f.Ctx, actor.UI(), "Two", nil)
			check(t, e)
			err := errors.New("failed")
			r := brokenTag{f.Tags, method, err}
			s := tag.NewService(r, f.Audit)
			switch method {
			case "list":
				_, e = tag.ResolveName(f.Ctx, r, "One")
			case "name":
				_, e = s.Create(f.Ctx, actor.UI(), "Three", nil)
			default:
				_, e = s.Merge(f.Ctx, actor.UI(), one.ID, two.ID)
			}
			if !errors.Is(e, err) {
				t.Fatal(e)
			}
			got, e := f.Tags.Get(f.Ctx, two.ID)
			check(t, e)
			if got.Rev != 1 {
				t.Fatal(got)
			}
		})
	}
}
