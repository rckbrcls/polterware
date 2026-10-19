package fake_test

import (
	"context"
	"errors"
	"fmt"
	"github.com/polterware/polterware/notes/backend/domains/activity"
	af "github.com/polterware/polterware/notes/backend/domains/activity/fake"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"sync"
	"testing"
)

func TestStoreRollbackIsolationCancellationAndRace(t *testing.T) {
	ctx := context.Background()
	s := af.NewStore()
	input := []string{"original"}
	if e := s.Put(ctx, "rows", "one", input); e != nil {
		t.Fatal(e)
	}
	input[0] = "mutated"
	read, ok, e := af.Read[[]string](ctx, s, "rows", "one")
	if e != nil || !ok || read[0] != "original" {
		t.Fatal(read, e)
	}
	read[0] = "mutated read"
	read, _, _ = af.Read[[]string](ctx, s, "rows", "one")
	if read[0] != "original" {
		t.Fatal(read)
	}
	fail := errors.New("rollback")
	e = s.Within(ctx, func(ctx context.Context) error {
		if e := s.Put(ctx, "rows", "one", []string{"changed"}); e != nil {
			return e
		}
		return s.Within(ctx, func(ctx context.Context) error {
			if e := s.Put(ctx, "rows", "two", []string{"new"}); e != nil {
				return e
			}
			return fail
		})
	})
	if !errors.Is(e, fail) {
		t.Fatal(e)
	}
	all, e := af.All[[]string](ctx, s, "rows")
	if e != nil || len(all) != 1 || all[0][0] != "original" {
		t.Fatal(all, e)
	}
	cancelCtx, cancel := context.WithCancel(ctx)
	e = s.Within(cancelCtx, func(ctx context.Context) error {
		if e := s.Put(ctx, "rows", "two", []string{"new"}); e != nil {
			return e
		}
		cancel()
		return nil
	})
	if !errors.Is(e, context.Canceled) {
		t.Fatal(e)
	}
	if _, _, e = af.Read[string](cancelCtx, s, "rows", "one"); !errors.Is(e, context.Canceled) {
		t.Fatal(e)
	}
	if e = s.Put(ctx, "rows", "bad", func() {}); e == nil {
		t.Fatal("unsupported value accepted")
	}
	if _, _, e = af.Read[int](ctx, s, "rows", "one"); e == nil {
		t.Fatal("wrong type accepted")
	}
	if _, e = af.All[int](ctx, s, "rows"); e == nil {
		t.Fatal("wrong list type accepted")
	}
	if _, e = af.Map[int](ctx, s, "rows"); e == nil {
		t.Fatal("wrong map type accepted")
	}
	if e = s.Remove(ctx, "rows", "one"); e != nil {
		t.Fatal(e)
	}
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if e := s.Within(ctx, func(ctx context.Context) error { return s.Put(ctx, "race", fmt.Sprint(i), i) }); e != nil {
				t.Error(e)
			}
			if _, e := af.All[int](ctx, s, "race"); e != nil {
				t.Error(e)
			}
		}(i)
	}
	wg.Wait()
	m, e := af.Map[int](ctx, s, "race")
	if e != nil || len(m) != 20 {
		t.Fatal(m, e)
	}
	// The zero store and independent stores do not share transaction contexts.
	zero := &af.Store{}
	e = s.Within(ctx, func(ctx context.Context) error {
		return zero.Within(ctx, func(ctx context.Context) error { return zero.Put(ctx, "other", "id", 1) })
	})
	if e != nil {
		t.Fatal(e)
	}
}
func TestActivityRepositoryContract(t *testing.T) {
	ctx := context.Background()
	r := af.New(af.NewStore())
	v := activity.Event{ID: "id", Actor: "ui"}
	if e := r.Append(ctx, v); e != nil {
		t.Fatal(e)
	}
	if e := r.Append(ctx, v); !fault.IsCode(e, fault.CodeExists) {
		t.Fatal(e)
	}
	for _, cursor := range []string{"!invalid", "e30invalid"} {
		_, e := r.List(ctx, cursor, "", 10)
		if !fault.IsCode(e, fault.CodeInvalid) {
			t.Fatal(e)
		}
	}
	for _, limit := range []int{-1, 501} {
		_, e := r.List(ctx, "", "", limit)
		if !fault.IsCode(e, fault.CodeInvalid) {
			t.Fatal(e)
		}
	}
	p, e := r.List(ctx, "", "", 0)
	if e != nil || len(p.Events) != 1 {
		t.Fatal(p, e)
	}
	v.ID = "second"
	if e = r.Append(ctx, v); e != nil {
		t.Fatal(e)
	}
	p, e = r.List(ctx, "", "", 1)
	if e != nil || p.NextCursor == "" {
		t.Fatal(p, e)
	}
	next, e := r.List(ctx, p.NextCursor, "ui", 1)
	if e != nil || next.Events[0].ID == p.Events[0].ID {
		t.Fatal(next, e)
	}
	c, cancel := context.WithCancel(ctx)
	cancel()
	if e = r.Append(c, v); !errors.Is(e, context.Canceled) {
		t.Fatal(e)
	}
	if _, e = r.List(c, "", "", 1); !errors.Is(e, context.Canceled) {
		t.Fatal(e)
	}
}
