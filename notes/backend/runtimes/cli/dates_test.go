package main

import (
	"testing"
	"time"
)

func TestParseWhen(t *testing.T) {
	loc := time.UTC
	now := time.Date(2026, 10, 4, 15, 30, 0, 0, loc)
	for _, tc := range []struct {
		in     string
		want   time.Time
		allDay bool
	}{
		{"today", time.Date(2026, 10, 4, 0, 0, 0, 0, loc), true},
		{"tomorrow", time.Date(2026, 10, 5, 0, 0, 0, 0, loc), true},
		{"yesterday", time.Date(2026, 10, 3, 0, 0, 0, 0, loc), true},
		{"2026-10-10", time.Date(2026, 10, 10, 0, 0, 0, 0, loc), true},
		{"2026-10-04T18:00:00Z", time.Date(2026, 10, 4, 18, 0, 0, 0, loc), false},
		{"+2h", time.Date(2026, 10, 4, 17, 30, 0, 0, loc), false},
		{"-30m", time.Date(2026, 10, 4, 15, 0, 0, 0, loc), false},
		{"+1d", time.Date(2026, 10, 5, 15, 30, 0, 0, loc), false},
	} {
		got, err := parseWhen(tc.in, now, loc)
		if err != nil {
			t.Fatalf("%s: %v", tc.in, err)
		}
		if !got.At.Equal(tc.want) || got.AllDay != tc.allDay {
			t.Fatalf("%s: got %v allDay=%t want %v allDay=%t", tc.in, got.At, got.AllDay, tc.want, tc.allDay)
		}
	}
	if _, err := parseWhen("nope", now, loc); err == nil {
		t.Fatal("expected invalid date")
	}
}

func TestParseRepeat(t *testing.T) {
	for _, tc := range []struct {
		in    string
		freq  string
		every int32
	}{
		{"daily", "daily", 1},
		{"weekly", "weekly", 1},
		{"monthly", "monthly", 1},
		{"yearly", "yearly", 1},
		{"every 2 days", "daily", 2},
		{"every 3 weeks", "weekly", 3},
		{"every month", "monthly", 1},
		{"every 1 year", "yearly", 1},
	} {
		got, err := parseRepeat(tc.in)
		if err != nil {
			t.Fatalf("%s: %v", tc.in, err)
		}
		if got.Freq != tc.freq || got.Every != tc.every {
			t.Fatalf("%s: %+v", tc.in, got)
		}
	}
	if _, err := parseRepeat("hourly"); err == nil {
		t.Fatal("hourly is not a CLI repeat form")
	}
}

func TestNoColorDisablesColor(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	if useColor() {
		t.Fatal("NO_COLOR must disable color")
	}
	t.Setenv("NO_COLOR", "")
	t.Setenv("TERM", "dumb")
	if useColor() {
		t.Fatal("TERM=dumb must disable color")
	}
}

func TestWeekRangeMondayStart(t *testing.T) {
	loc := time.UTC
	// Sunday 4 Oct 2026 -> week starting Monday 28 Sep
	from, to := weekRange(time.Date(2026, 10, 4, 12, 0, 0, 0, loc), loc)
	if !from.Equal(time.Date(2026, 9, 28, 0, 0, 0, 0, loc)) || !to.Equal(time.Date(2026, 10, 5, 0, 0, 0, 0, loc)) {
		t.Fatalf("week %v %v", from, to)
	}
}
