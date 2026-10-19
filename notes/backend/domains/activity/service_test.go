package activity_test

import (
	"context"
	"errors"
	"fmt"
	"github.com/polterware/polterware/notes/backend/domains/activity"
	af "github.com/polterware/polterware/notes/backend/domains/activity/fake"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"testing"
	"time"
)

type clock struct{}

func (clock) Now() time.Time { return time.Date(2026, 10, 4, 0, 0, 0, 0, time.UTC) }

type ids struct{ n int }

func (g *ids) New() string { g.n++; return fmt.Sprintf("%026d", g.n) }

type broken struct {
	activity.Repository
	err error
}

func (b broken) Append(context.Context, activity.Event) error { return b.err }
func TestAuditedTransactions(t *testing.T) {
	ctx := context.Background()
	store := af.NewStore()
	repo := af.New(store)
	a := activity.Audit{Repository: repo, Transactions: store, Clock: clock{}, IDs: &ids{}}
	for _, who := range []actor.Actor{actor.UI(), actor.CLI(), actor.System(), actor.MCP("test")} {
		err := a.Write(ctx, who, "note", "id", activity.OpUpdate, "Update note", func(ctx context.Context) error { return store.Put(ctx, "data", who.Raw, "changed") })
		if err != nil {
			t.Fatal(err)
		}
	}
	for _, who := range []actor.Actor{{Raw: ""}, {Raw: "mcp:"}, {Raw: "bad"}} {
		if err := a.Write(ctx, who, "note", "id", activity.OpUpdate, "Update", func(context.Context) error { t.Fatal("invalid actor entered mutation"); return nil }); !fault.IsCode(err, fault.CodeInvalid) {
			t.Fatal(err)
		}
	}
	fail := errors.New("failed")
	for _, audit := range []activity.Audit{a, {Repository: broken{repo, fail}, Transactions: store, Clock: clock{}, IDs: &ids{}}} {
		err := audit.Write(ctx, actor.UI(), "note", "id", activity.OpUpdate, "Update", func(ctx context.Context) error {
			if e := store.Put(ctx, "data", "rollback", "changed"); e != nil {
				return e
			}
			if audit.Repository == repo {
				return fail
			}
			return nil
		})
		if !errors.Is(err, fail) {
			t.Fatal(err)
		}
		_, ok, e := af.Read[string](ctx, store, "data", "rollback")
		if e != nil || ok {
			t.Fatal("failed transaction persisted", e)
		}
	}
	s := activity.NewService(repo)
	page, e := s.List(ctx, "", "", 1)
	if e != nil || len(page.Events) != 1 || page.NextCursor == "" {
		t.Fatal(page, e)
	}
	next, e := s.List(ctx, page.NextCursor, "", 1)
	if e != nil || next.Events[0].ID == page.Events[0].ID {
		t.Fatal(next, e)
	}
	page, e = s.List(ctx, "", "ui", 0)
	if e != nil || len(page.Events) != 1 {
		t.Fatal(page, e)
	}
	for _, limit := range []int{-1, 501} {
		_, e = s.List(ctx, "", "", limit)
		if !fault.IsCode(e, fault.CodeInvalid) {
			t.Fatal(e)
		}
	}
}
func TestNamesAndColors(t *testing.T) {
	for _, tc := range []struct {
		name  string
		color *string
		valid bool
	}{{"Name", nil, true}, {" ", nil, false}, {"LongLong", nil, false}, {"Name", str("#ABCdef"), true}, {"Name", str("red"), false}, {"Name", str("#G00000"), false}} {
		e := activity.ValidateName("name", tc.name, 5)
		if e == nil {
			e = activity.ValidateColor(tc.color)
		}
		if (e == nil) != tc.valid {
			t.Fatal(tc, e)
		}
	}
	names := map[string]string{"1": "Example", "2": "Another Example"}
	id, e := activity.Lookup("example", names)
	if e != nil || id != "1" {
		t.Fatal(id, e)
	}
	_, e = activity.Lookup("Exam", names)
	if !fault.IsCode(e, fault.CodeNotFound) {
		t.Fatal(e)
	}
}
func str(s string) *string { return &s }
