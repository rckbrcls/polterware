package schedule

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"testing"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/fault"
)

func instant(t testing.TB, value string) time.Time {
	t.Helper()
	at, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		t.Fatal(err)
	}
	return at
}

func location(t testing.TB, name string) *time.Location {
	t.Helper()
	zone, err := time.LoadLocation(name)
	if err != nil {
		t.Fatal(err)
	}
	return zone
}

func daily(t testing.TB) Rule {
	return Rule{Anchor: instant(t, "2026-10-01T09:00:00Z"), TZ: time.UTC, Freq: FreqDaily, Every: 1}
}

type vector struct {
	ID   int
	Name string
	Rule struct {
		Anchor      string
		TZ          string
		AllDay      bool
		Freq        Freq
		Every       int
		WeekdayMask uint8
		End         struct {
			Type  EndType
			Count int
			Until string
		}
	}
	Query struct {
		Kind  string
		N     int
		After string
	}
	NotificationTime string
	Expect           []string
}

func (v vector) rule(t testing.TB) Rule {
	r := Rule{Anchor: instant(t, v.Rule.Anchor), TZ: location(t, v.Rule.TZ), AllDay: v.Rule.AllDay, Freq: v.Rule.Freq,
		Every: v.Rule.Every, WeekdayMask: v.Rule.WeekdayMask, End: End{Type: v.Rule.End.Type, Count: v.Rule.End.Count}}
	if v.Rule.End.Until != "" {
		at := instant(t, v.Rule.End.Until)
		r.End.Until = &at
	}
	return r
}

func vectors(t *testing.T, path string, count int) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct{ Cases []vector }
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	if len(fixture.Cases) != count {
		t.Fatalf("got %d cases, want %d", len(fixture.Cases), count)
	}
	for _, v := range fixture.Cases {
		t.Run(fmt.Sprintf("%02d_%s", v.ID, v.Name), func(t *testing.T) {
			r := v.rule(t)
			var got []time.Time
			if v.Query.Kind == "next" {
				if at, ok := r.Next(instant(t, v.Query.After)); ok {
					got = append(got, at)
				}
			} else {
				got, _, err = Preview(r, v.Query.N)
				if err != nil {
					t.Fatal(err)
				}
				if v.NotificationTime != "" {
					h, m, err := allDayClock(v.NotificationTime)
					if err != nil {
						t.Fatal(err)
					}
					for i := range got {
						got[i] = fireTime(got[i], r, h, m)
					}
				}
			}
			if len(got) != len(v.Expect) {
				t.Fatalf("got %v, want %v", got, v.Expect)
			}
			for i, want := range v.Expect {
				if !got[i].Equal(instant(t, want)) {
					t.Fatalf("[%d] got %s, want %s", i, got[i], want)
				}
				if got[i].Location() != time.UTC {
					t.Fatal("output must be UTC")
				}
			}
		})
	}
}

func TestRecurrenceVectors(t *testing.T) { vectors(t, "testdata/recurrence_vectors.json", 14) }
func TestSwiftGolden(t *testing.T)       { vectors(t, "testdata/swift_golden.json", 6) }

func TestValidation(t *testing.T) {
	tests := []struct {
		name   string
		change func(*Rule)
	}{
		{"zero anchor", func(r *Rule) { r.Anchor = time.Time{} }},
		{"nil zone", func(r *Rule) { r.TZ = nil }},
		{"zero every", func(r *Rule) { r.Every = 0 }},
		{"negative every", func(r *Rule) { r.Every = -1 }},
		{"unknown frequency", func(r *Rule) { r.Freq = "secondly" }},
		{"mask not weekly", func(r *Rule) { r.WeekdayMask = WeekdayMonday }},
		{"invalid mask", func(r *Rule) { r.Freq = FreqWeekly; r.WeekdayMask = 128 }},
		{"zero count", func(r *Rule) { r.End = End{Type: EndCount} }},
		{"missing until", func(r *Rule) { r.End = End{Type: EndUntil} }},
		{"unknown end", func(r *Rule) { r.End.Type = "forever" }},
		{"unused end", func(r *Rule) { r.End.Count = 4 }},
		{"overflow", func(r *Rule) { r.Freq = FreqHourly; r.Every = math.MaxInt }},
		{"subday all day", func(r *Rule) { r.Freq = FreqMinutely; r.AllDay = true }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := daily(t)
			tc.change(&r)
			if err := r.Validate(); !fault.IsCode(err, fault.CodeInvalid) {
				t.Fatalf("got %v", err)
			}
			if _, ok := r.Next(r.Anchor); ok {
				t.Fatal("invalid rule produced Next")
			}
			if _, err := r.At(r.Anchor, r.Anchor.Add(time.Hour), 10); !fault.IsCode(err, fault.CodeInvalid) {
				t.Fatalf("got %v", err)
			}
		})
	}
}

func TestRangeAndEnd(t *testing.T) {
	r := daily(t)
	from, to := r.Anchor, r.Anchor.AddDate(0, 0, 3)
	got, err := r.At(from, to, 0)
	if err != nil || len(got) != 3 {
		t.Fatalf("half-open: %v %v", got, err)
	}
	count, err := r.Count(from, to)
	if err != nil || count != 3 {
		t.Fatalf("count %d %v", count, err)
	}
	r.End = End{Type: EndCount, Count: 2}
	got, err = r.At(from.AddDate(0, 0, 1), to, 0)
	if err != nil || len(got) != 1 {
		t.Fatalf("count includes skipped history: %v %v", got, err)
	}
	if _, ok := r.Next(from.AddDate(0, 0, 1)); ok {
		t.Fatal("count must end")
	}
	r.End = End{Type: EndUntil, Until: &to}
	got, err = r.At(from, to.Add(time.Nanosecond), 0)
	if err != nil || len(got) != 4 {
		t.Fatalf("inclusive until: %v %v", got, err)
	}
	if _, ok := r.Next(to); ok {
		t.Fatal("until must end")
	}
	for _, tc := range []struct {
		from, to time.Time
		limit    int
	}{
		{to, from, 1}, {from, to, -1}, {from, to, MaxOccurrences + 1},
	} {
		if _, err := r.At(tc.from, tc.to, tc.limit); !fault.IsCode(err, fault.CodeInvalid) {
			t.Fatalf("got %v", err)
		}
	}
	r.End = End{}
	if _, err := r.Between(from, from.AddDate(5, 0, 1)); !fault.IsCode(err, fault.CodeInvalid) {
		t.Fatal("five year cap", err)
	}
	r.Freq = FreqMinutely
	if _, err := r.Between(from, from.Add(10001*time.Minute)); !fault.IsCode(err, fault.CodeInvalid) {
		t.Fatal("hard occurrence cap", err)
	}
	got, err = r.At(from, from.Add(10001*time.Minute), 12)
	if err != nil || len(got) != 12 {
		t.Fatalf("lazy prefix %d %v", len(got), err)
	}
	got, err = r.Between(from, from.Add(10000*time.Minute))
	if err != nil || len(got) != 10000 {
		t.Fatalf("exact cap %d %v", len(got), err)
	}
}

func TestWeeklySeek(t *testing.T) {
	for _, anchor := range []string{"2026-10-05T08:00:00Z", "2026-10-07T08:00:00Z", "2026-10-09T08:00:00Z"} {
		for every := 1; every <= 3; every++ {
			r := daily(t)
			r.Anchor = instant(t, anchor)
			r.Freq = FreqWeekly
			r.Every = every
			r.WeekdayMask = WeekdayMonday | WeekdayWednesday
			all, _, err := Preview(r, 30)
			if err != nil {
				t.Fatal(err)
			}
			for _, at := range all {
				next, ok := r.Next(at.Add(-time.Nanosecond))
				if !ok || !next.Equal(at) {
					t.Fatalf("anchor %s every %d next %v want %v", anchor, every, next, at)
				}
			}
			r.End = End{Type: EndCount, Count: 3}
			if _, ok := r.Next(all[2]); ok {
				t.Fatal("weekday count overrun")
			}
		}
	}
}

func TestWallTransitions(t *testing.T) {
	for _, tc := range []struct {
		zone, anchor string
		want         []string
	}{
		{"Europe/London", "2026-03-28T01:30:00Z", []string{"2026-03-29T01:30:00Z", "2026-03-30T00:30:00Z"}},
		{"Europe/London", "2026-10-24T00:30:00Z", []string{"2026-10-25T00:30:00Z", "2026-10-26T01:30:00Z"}},
		{"Pacific/Auckland", "2026-09-25T14:30:00Z", []string{"2026-09-26T14:30:00Z", "2026-09-27T13:30:00Z"}},
		{"Australia/Lord_Howe", "2026-10-02T15:45:00Z", []string{"2026-10-03T15:45:00Z", "2026-10-04T15:15:00Z"}},
	} {
		t.Run(tc.zone+tc.anchor, func(t *testing.T) {
			r := daily(t)
			r.Anchor = instant(t, tc.anchor)
			r.TZ = location(t, tc.zone)
			after := r.Anchor
			for _, want := range tc.want {
				at, ok := r.Next(after)
				if !ok || !at.Equal(instant(t, want)) {
					t.Fatalf("got %v want %s", at, want)
				}
				after = at
			}
		})
	}
}

func TestLargeIntervalsAndLateSeek(t *testing.T) {
	for _, freq := range []Freq{FreqDaily, FreqWeekly, FreqMonthly, FreqYearly} {
		r := daily(t)
		r.Freq = freq
		r.Every = math.MaxInt
		got, _, err := Preview(r, 2)
		if err != nil || len(got) != 1 {
			t.Fatalf("%s: %v %v", freq, got, err)
		}
		r.WeekdayMask = 0
		if freq == FreqWeekly {
			r.WeekdayMask = WeekdayMonday | WeekdayWednesday
			_, _, err = Preview(r, 5)
			if err != nil {
				t.Fatal(err)
			}
		}
	}
	r := daily(t)
	r.Anchor = instant(t, "1900-01-01T00:00:00Z")
	r.Freq = FreqMinutely
	from := instant(t, "2026-10-04T11:00:00.001Z")
	at, ok := r.Next(from)
	if !ok || !at.Equal(instant(t, "2026-10-04T11:01:00Z")) {
		t.Fatalf("late seek: %v", at)
	}
}

func BenchmarkAtHourlyYear(b *testing.B) {
	r := daily(b)
	r.Freq = FreqHourly
	to := r.Anchor.AddDate(1, 0, 0)
	b.ReportAllocs()
	for b.Loop() {
		if _, err := r.At(r.Anchor, to, 0); err != nil {
			b.Fatal(err)
		}
	}
}
