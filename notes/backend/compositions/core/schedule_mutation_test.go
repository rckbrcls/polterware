package core

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/place"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
	"github.com/polterware/polterware/notes/backend/domains/tx"
	"github.com/polterware/polterware/notes/backend/platform/ids"
	"github.com/polterware/polterware/notes/backend/providers/sqlite"
)

type fixedMutationClock struct{ at time.Time }

func (c fixedMutationClock) Now() time.Time { return c.at }

func mutationFixture(t *testing.T) (*sqlite.Store, activity.Audit, note.Service) {
	t.Helper()
	s := searchStore(t)
	WireSearch(s)
	audit := activity.Audit{Repository: s.Activity(), Transactions: s, Clock: fixedMutationClock{time.Date(2026, 10, 4, 12, 0, 0, 0, time.UTC)}, IDs: ids.Generator{}}
	mem := note.NewService(s.Notes(), s.Spaces(), s.Tags(), s.Schedules(), schedule.Engine{Clock: audit.Clock}, audit)
	return s, audit, mem
}

func mutationSchedule(s *sqlite.Store, audit activity.Audit) scheduleRuntime {
	return scheduleRuntime{clock: audit.Clock, audit: audit, notes: s.Notes(), schedules: s.Schedules()}
}

func testSchedule(id string) schedule.Schedule {
	return schedule.Schedule{NoteID: id, Active: true, FireAt: time.Date(2026, 10, 5, 9, 0, 0, 0, time.UTC), TZ: "UTC", Every: 1, EndType: schedule.EndNever}
}

func TestScheduleAndPlaceMutationsInvalidateNoteRevision(t *testing.T) {
	for _, name := range []string{"schedule-set", "schedule-clear", "focus-recipe", "place-set", "place-clear"} {
		t.Run(name, func(t *testing.T) {
			s, audit, mem := mutationFixture(t)
			m := seedSearchNote(t, s)
			sched := mutationSchedule(s, audit)
			places := placeService{repo: s.Places(), notes: s.Notes(), clock: audit.Clock, audit: audit}
			if name == "schedule-clear" || name == "focus-recipe" {
				if _, err := sched.Set(t.Context(), actor.UI(), testSchedule(m.ID)); err != nil {
					t.Fatal(err)
				}
			}
			if name == "place-clear" {
				if _, err := places.Set(t.Context(), place.Place{NoteID: m.ID, Lat: 1, Lng: 2}, 0); err != nil {
					t.Fatal(err)
				}
			}
			before, err := s.Notes().Get(t.Context(), m.ID)
			if err != nil {
				t.Fatal(err)
			}
			switch name {
			case "schedule-set":
				_, err = sched.Set(t.Context(), actor.UI(), testSchedule(m.ID))
			case "schedule-clear":
				err = sched.Clear(t.Context(), actor.UI(), m.ID)
			case "focus-recipe":
				_, err = sched.SetFocusRecipe(t.Context(), actor.UI(), m.ID, schedule.FocusRecipe{Enabled: true, WorkMin: 25, ShortBreakMin: 5, LongBreakMin: 15, Cycles: 4})
			case "place-set":
				_, err = places.Set(t.Context(), place.Place{NoteID: m.ID, Lat: 1, Lng: 2}, 0)
			case "place-clear":
				err = places.Clear(t.Context(), m.ID, 0)
			}
			if err != nil {
				t.Fatal(err)
			}
			after, err := s.Notes().Get(t.Context(), m.ID)
			if err != nil || after.Rev != before.Rev+1 || !after.UpdatedAt.Equal(audit.Clock.Now()) {
				t.Fatalf("revision: before=%+v after=%+v err=%v", before, after, err)
			}
			title := "stale write"
			if _, err := mem.Update(t.Context(), actor.UI(), m.ID, before.Rev, note.Patch{Title: &title}); !fault.IsCode(err, fault.CodeConflict) {
				t.Fatalf("stale expectedRev accepted: %v", err)
			}
		})
	}
}

type pausedMutation struct {
	tx.Manager
	ready, release chan struct{}
}

func (p pausedMutation) Within(ctx context.Context, fn func(context.Context) error) error {
	close(p.ready)
	select {
	case <-p.release:
		return p.Manager.Within(ctx, fn)
	case <-ctx.Done():
		return ctx.Err()
	}
}

func TestFocusRecipeReadsScheduleInsideTransaction(t *testing.T) {
	s, audit, _ := mutationFixture(t)
	m := seedSearchNote(t, s)
	sched := mutationSchedule(s, audit)
	if _, err := sched.Set(t.Context(), actor.UI(), testSchedule(m.ID)); err != nil {
		t.Fatal(err)
	}
	paused := pausedMutation{s, make(chan struct{}), make(chan struct{})}
	recipe := sched
	recipe.audit.Transactions = paused
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() {
		_, err := recipe.SetFocusRecipe(ctx, actor.UI(), m.ID, schedule.FocusRecipe{Enabled: true, WorkMin: 25, ShortBreakMin: 5, LongBreakMin: 15, Cycles: 4})
		done <- err
	}()
	select {
	case <-paused.ready:
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	newSchedule := testSchedule(m.ID)
	newSchedule.FireAt = newSchedule.FireAt.Add(2 * time.Hour)
	if _, err := sched.Set(ctx, actor.UI(), newSchedule); err != nil {
		close(paused.release)
		t.Fatal(err)
	}
	close(paused.release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	got, err := s.Schedules().Get(ctx, m.ID)
	if err != nil || !got.FireAt.Equal(newSchedule.FireAt) || !got.FocusEnabled {
		t.Fatalf("recipe restored stale schedule: %+v, %v", got, err)
	}
}

type rejectedActivity struct{ activity.Repository }

func (rejectedActivity) Append(context.Context, activity.Event) error {
	return errors.New("audit rejected")
}

func TestScheduleAndPlaceRevisionRollbackWithAudit(t *testing.T) {
	s, audit, _ := mutationFixture(t)
	m := seedSearchNote(t, s)
	audit.Repository = rejectedActivity{audit.Repository}
	sched := mutationSchedule(s, audit)
	if _, err := sched.Set(t.Context(), actor.UI(), testSchedule(m.ID)); err == nil {
		t.Fatal("missing audit failure")
	}
	places := placeService{repo: s.Places(), notes: s.Notes(), clock: audit.Clock, audit: audit}
	if _, err := places.Set(t.Context(), place.Place{NoteID: m.ID}, 0); err == nil {
		t.Fatal("missing audit failure")
	}
	got, err := s.Notes().Get(t.Context(), m.ID)
	if err != nil || got.Rev != m.Rev {
		t.Fatalf("revision escaped rollback: %+v %v", got, err)
	}
	if _, err := s.Schedules().Get(t.Context(), m.ID); !fault.IsCode(err, fault.CodeNotFound) {
		t.Fatal(err)
	}
	if _, err := s.Places().Get(t.Context(), m.ID); !fault.IsCode(err, fault.CodeNotFound) {
		t.Fatal(err)
	}
}
