package main

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode"
)

// parsedTime is a CLI instant. AllDay is true for civil dates (today, YYYY-MM-DD).
type parsedTime struct {
	At     time.Time
	AllDay bool
	Loc    *time.Location
	TZ     string
}

type repeatSpec struct {
	Freq  string
	Every int32
}

func cliLocation() *time.Location {
	tz := strings.TrimSpace(os.Getenv("TZ"))
	if tz == "" {
		if loc := time.Local; loc != nil && loc.String() != "" && loc.String() != "Local" {
			if _, err := time.LoadLocation(loc.String()); err == nil {
				return loc
			}
		}
		return time.UTC
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return time.UTC
	}
	return loc
}

func zoneName(loc *time.Location) string {
	if loc == nil {
		return "UTC"
	}
	name := loc.String()
	if name == "" || name == "Local" {
		return "UTC"
	}
	return name
}

func parseWhen(raw string, now time.Time, loc *time.Location) (parsedTime, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return parsedTime{}, usagef("empty date")
	}
	if loc == nil {
		loc = time.UTC
	}
	now = now.In(loc)
	out := parsedTime{Loc: loc, TZ: zoneName(loc)}
	switch strings.ToLower(raw) {
	case "today":
		out.At = startOfDay(now, loc)
		out.AllDay = true
		return out, nil
	case "tomorrow":
		out.At = startOfDay(now, loc).AddDate(0, 0, 1)
		out.AllDay = true
		return out, nil
	case "yesterday":
		out.At = startOfDay(now, loc).AddDate(0, 0, -1)
		out.AllDay = true
		return out, nil
	}
	if len(raw) == 10 && raw[4] == '-' && raw[7] == '-' {
		day, err := time.ParseInLocation("2006-01-02", raw, loc)
		if err != nil {
			return parsedTime{}, usagef("invalid date %q (use RFC 3339, YYYY-MM-DD, today, tomorrow, or +2h)", raw)
		}
		out.At = day
		out.AllDay = true
		return out, nil
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339} {
		if at, err := time.Parse(layout, raw); err == nil {
			out.At = at.In(loc)
			out.AllDay = false
			if at.Location() != time.UTC && at.Location().String() != "Local" {
				out.Loc = at.Location()
				out.TZ = zoneName(at.Location())
			}
			return out, nil
		}
	}
	if d, err := parseRelative(raw); err == nil {
		out.At = now.Add(d)
		out.AllDay = false
		return out, nil
	}
	return parsedTime{}, usagef("invalid date %q (use RFC 3339, YYYY-MM-DD, today, tomorrow, or +2h)", raw)
}

func parseRelative(raw string) (time.Duration, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return 0, fmt.Errorf("empty")
	}
	sign := time.Duration(1)
	if s[0] == '+' {
		s = s[1:]
	} else if s[0] == '-' {
		sign = -1
		s = s[1:]
	}
	if s == "" || !unicode.IsDigit(rune(s[0])) {
		return 0, fmt.Errorf("not relative")
	}
	i := 0
	for i < len(s) && unicode.IsDigit(rune(s[i])) {
		i++
	}
	n, err := strconv.Atoi(s[:i])
	if err != nil || i == len(s) {
		return 0, fmt.Errorf("not relative")
	}
	unit := strings.ToLower(s[i:])
	var d time.Duration
	switch unit {
	case "s", "sec", "secs", "second", "seconds":
		d = time.Duration(n) * time.Second
	case "m", "min", "mins", "minute", "minutes":
		d = time.Duration(n) * time.Minute
	case "h", "hr", "hrs", "hour", "hours":
		d = time.Duration(n) * time.Hour
	case "d", "day", "days":
		d = time.Duration(n) * 24 * time.Hour
	case "w", "week", "weeks":
		d = time.Duration(n) * 7 * 24 * time.Hour
	default:
		return 0, fmt.Errorf("unknown unit")
	}
	return sign * d, nil
}

func parseRepeat(raw string) (repeatSpec, error) {
	s := strings.ToLower(strings.TrimSpace(raw))
	if s == "" {
		return repeatSpec{}, usagef("empty --repeat")
	}
	switch s {
	case "daily", "weekly", "monthly", "yearly":
		return repeatSpec{Freq: s, Every: 1}, nil
	}
	parts := strings.Fields(s)
	if len(parts) == 2 && parts[0] == "every" {
		return repeatFromUnit(1, parts[1])
	}
	if len(parts) == 3 && parts[0] == "every" {
		n, err := strconv.Atoi(parts[1])
		if err != nil || n < 1 {
			return repeatSpec{}, usagef("invalid --repeat %q (every N must be >= 1)", raw)
		}
		return repeatFromUnit(n, parts[2])
	}
	return repeatSpec{}, usagef("invalid --repeat %q (use daily|weekly|monthly|yearly or every N <unit>)", raw)
}

func repeatFromUnit(n int, unit string) (repeatSpec, error) {
	unit = strings.ToLower(strings.TrimSuffix(unit, "s"))
	switch unit {
	case "day":
		return repeatSpec{Freq: "daily", Every: int32(n)}, nil
	case "week":
		return repeatSpec{Freq: "weekly", Every: int32(n)}, nil
	case "month":
		return repeatSpec{Freq: "monthly", Every: int32(n)}, nil
	case "year":
		return repeatSpec{Freq: "yearly", Every: int32(n)}, nil
	default:
		return repeatSpec{}, usagef("invalid repeat unit %q (use day, week, month, or year)", unit)
	}
}

func startOfDay(t time.Time, loc *time.Location) time.Time {
	t = t.In(loc)
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
}

func dayRange(t time.Time, loc *time.Location) (from, to time.Time) {
	from = startOfDay(t, loc)
	return from, from.AddDate(0, 0, 1)
}

func weekRange(t time.Time, loc *time.Location) (from, to time.Time) {
	t = t.In(loc)
	from = startOfDay(t, loc)
	// Monday-start week, matching calendar.weekStart default.
	wd := int(from.Weekday())
	if wd == 0 {
		wd = 7
	}
	from = from.AddDate(0, 0, -(wd - 1))
	return from, from.AddDate(0, 0, 7)
}

func parseRangeEnd(raw string, now time.Time, loc *time.Location, endExclusive bool) (time.Time, error) {
	p, err := parseWhen(raw, now, loc)
	if err != nil {
		return time.Time{}, err
	}
	if p.AllDay && endExclusive {
		return p.At.AddDate(0, 0, 1), nil
	}
	return p.At, nil
}
