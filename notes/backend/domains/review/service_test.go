package review_test

import (
	"context"
	"errors"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/review"
	"testing"
	"time"
)

type reader struct {
	completions             []review.Completion
	spans                   []review.FocusSpan
	completionErr, focusErr error
}

func (r reader) Completions(context.Context, time.Time, time.Time) ([]review.Completion, error) {
	return r.completions, r.completionErr
}
func (r reader) FocusSpans(context.Context, time.Time, time.Time) ([]review.FocusSpan, error) {
	return r.spans, r.focusErr
}
func TestSwiftMoodThresholds(t *testing.T) {
	for _, tc := range []struct {
		n                 int
		streak, completed string
	}{{-1, "sad", "sad"}, {0, "sad", "sad"}, {1, "hopeful", "hopeful"}, {6, "hopeful", "hopeful"}, {7, "happy", "hopeful"}, {24, "happy", "hopeful"}, {25, "happy", "happy"}, {29, "happy", "happy"}, {30, "euphoric", "happy"}, {99, "euphoric", "happy"}, {100, "euphoric", "euphoric"}} {
		if got := review.StreakMood(tc.n); got != tc.streak {
			t.Fatalf("streak %d: %s", tc.n, got)
		}
		if got := review.CompletedMood(tc.n); got != tc.completed {
			t.Fatalf("completed %d: %s", tc.n, got)
		}
	}
}
func TestSwiftPeriodsAndStreak(t *testing.T) {
	loc, _ := time.LoadLocation("America/Sao_Paulo")
	from := time.Date(2026, 10, 1, 0, 0, 0, 0, loc)
	to := from.AddDate(0, 0, 3)
	r := reader{}
	for _, h := range []int{0, 5, 6, 11, 12, 17, 18, 21, 22, 23} {
		r.completions = append(r.completions, review.Completion{At: time.Date(2026, 10, 3, h, 0, 0, 0, loc)})
	}
	r.completions = append(r.completions, review.Completion{At: from.AddDate(0, 0, 1)}, review.Completion{At: from}, review.Completion{At: from.AddDate(0, 0, -1)}, review.Completion{At: to})
	r.spans = []review.FocusSpan{{StartedAt: from, ElapsedS: 30}, {StartedAt: from, ElapsedS: 90}, {StartedAt: from.AddDate(0, 0, -1), ElapsedS: 60}, {StartedAt: to, ElapsedS: 60}, {StartedAt: from, ElapsedS: -1}, {StartedAt: from.AddDate(-2, 0, 0), ElapsedS: 90}}
	got, e := review.NewService(r).Get(context.Background(), from, to, loc.String())
	if e != nil {
		t.Fatal(e)
	}
	if got.CompletedTotal != 12 || got.Streak != 4 || got.FocusMinutes != 2 || len(got.Days) != 3 {
		t.Fatal(got)
	}
	d := got.Days[2]
	if d.Morning != 2 || d.Afternoon != 2 || d.Evening != 2 || d.Night != 4 {
		t.Fatal(d)
	}
	if got.Contribution[0].Date != "2025-11-01" || got.Contribution[len(got.Contribution)-1].Date != "2026-10-03" {
		t.Fatal("wrong history window")
	}
	for _, tc := range []struct {
		name   string
		end    time.Time
		streak int
	}{{"yesterday", to.AddDate(0, 0, 1), 4}, {"expired", to.AddDate(0, 0, 2), 0}} {
		t.Run(tc.name, func(t *testing.T) {
			rr := r
			rr.completions = rr.completions[:len(rr.completions)-1]
			got, e := review.NewService(rr).Get(context.Background(), from, tc.end, loc.String())
			if e != nil {
				t.Fatal(e)
			}
			if got.Streak != tc.streak {
				t.Fatal(got.Streak)
			}
		})
	}
}
func TestReviewRangesZonesAndErrors(t *testing.T) {
	ctx := context.Background()
	from := time.Date(2026, 3, 7, 17, 0, 0, 0, time.UTC)
	to := from.AddDate(0, 0, 3)
	for _, zone := range []string{"UTC", "America/New_York", "Pacific/Auckland", "Asia/Kolkata"} {
		t.Run(zone, func(t *testing.T) {
			r := reader{completions: []review.Completion{{At: from.Add(-time.Hour)}, {At: from}, {At: to.Add(-time.Second)}}, spans: []review.FocusSpan{{StartedAt: from.Add(-time.Hour), ElapsedS: 60}, {StartedAt: from, ElapsedS: 60}}}
			got, e := review.NewService(r).Get(ctx, from, to, zone)
			if e != nil {
				t.Fatal(e)
			}
			if got.CompletedTotal != 2 || got.FocusMinutes != 1 {
				t.Fatal(got)
			}
			for i := 1; i < len(got.Contribution); i++ {
				if got.Contribution[i].Date <= got.Contribution[i-1].Date {
					t.Fatal("non-increasing civil days")
				}
			}
		})
	}
	s := review.NewService(reader{})
	for _, tc := range []struct {
		from, to time.Time
		zone     string
	}{{to, from, "UTC"}, {from, from, "UTC"}, {from, to, "invalid"}} {
		_, e := s.Get(ctx, tc.from, tc.to, tc.zone)
		if !fault.IsCode(e, fault.CodeInvalid) {
			t.Fatal(e)
		}
	}
	for _, r := range []reader{{completionErr: errors.New("completions failed")}, {focusErr: errors.New("focus failed")}} {
		_, e := review.NewService(r).Get(ctx, from, to, "UTC")
		if e == nil {
			t.Fatal("missing error")
		}
	}
	// A requested range before the contribution window still includes its focus totals.
	early := to.AddDate(-2, 0, 0)
	got, e := review.NewService(reader{spans: []review.FocusSpan{{StartedAt: early, ElapsedS: 120}}}).Get(ctx, early, to, "UTC")
	if e != nil || got.FocusMinutes != 2 {
		t.Fatal(got, e)
	}
}
