package review

import (
	"context"
	"fmt"
	"github.com/polterware/polterware/notes/backend/domains/activity"
	"time"
)

type service struct{ reader Reader }

func NewService(r Reader) Service { return &service{r} }
func StreakMood(n int) string {
	if n >= StreakEuphoricMin {
		return MoodEuphoric
	}
	if n >= StreakHappyMin {
		return MoodHappy
	}
	if n >= StreakHopefulMin {
		return MoodHopeful
	}
	return MoodSad
}
func CompletedMood(n int) string {
	if n >= CompletedEuphoricMin {
		return MoodEuphoric
	}
	if n >= CompletedHappyMin {
		return MoodHappy
	}
	if n >= CompletedHopefulMin {
		return MoodHopeful
	}
	return MoodSad
}
func startDay(t time.Time, loc *time.Location) time.Time {
	t = t.In(loc)
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
}
func (s *service) Get(ctx context.Context, from, to time.Time, tz string) (Report, error) {
	r := Report{From: from.UTC(), To: to.UTC(), TZ: tz}
	if !from.Before(to) {
		return r, activity.Invalid("range", "from must precede to")
	}
	loc, e := time.LoadLocation(tz)
	if e != nil {
		return r, activity.Invalid("tz", "unknown IANA zone")
	}
	endDay := startDay(to.Add(-time.Nanosecond), loc)
	history := time.Date(endDay.Year(), endDay.Month(), 1, 0, 0, 0, 0, loc).AddDate(0, -11, 0)
	// Read all historical completions for streaks that can exceed the display window.
	completions, e := s.reader.Completions(ctx, time.Time{}, to.UTC())
	if e != nil {
		return r, fmt.Errorf("read review completions: %w", e)
	}
	focusFrom := history
	if from.Before(focusFrom) {
		focusFrom = from
	}
	spans, e := s.reader.FocusSpans(ctx, focusFrom.UTC(), to.UTC())
	if e != nil {
		return r, fmt.Errorf("read review focus: %w", e)
	}
	days := map[string]Day{}
	active := map[string]bool{}
	for _, c := range completions {
		if !c.At.Before(to) {
			continue
		}
		local := c.At.In(loc)
		key := local.Format("2006-01-02")
		active[key] = true
		d := days[key]
		d.Date = key
		d.Completed++
		switch h := local.Hour(); {
		case h >= 6 && h < 12:
			d.Morning++
		case h >= 12 && h < 18:
			d.Afternoon++
		case h >= 18 && h < 22:
			d.Evening++
		default:
			d.Night++
		}
		days[key] = d
		if !c.At.Before(from) {
			r.CompletedTotal++
		}
	}
	seconds := map[string]int{}
	for _, f := range spans {
		if f.ElapsedS < 0 || f.StartedAt.Before(focusFrom) || !f.StartedAt.Before(to) {
			continue
		}
		key := f.StartedAt.In(loc).Format("2006-01-02")
		seconds[key] += f.ElapsedS
		if !f.StartedAt.Before(from) {
			r.FocusMinutes += f.ElapsedS
		}
	}
	r.FocusMinutes /= 60
	for key, n := range seconds {
		d := days[key]
		d.Date = key
		d.FocusMinutes = n / 60
		days[key] = d
	}
	for date := history; !date.After(endDay); date = date.AddDate(0, 0, 1) {
		key := date.Format("2006-01-02")
		d := days[key]
		d.Date = key
		r.Contribution = append(r.Contribution, d)
	}
	// Requested totals use the half-open interval, including partial civil days.
	rangeDays := map[string]Day{}
	for _, c := range completions {
		if c.At.Before(from) || !c.At.Before(to) {
			continue
		}
		key := c.At.In(loc).Format("2006-01-02")
		d := rangeDays[key]
		d.Date = key
		d.Completed++
		switch h := c.At.In(loc).Hour(); {
		case h >= 6 && h < 12:
			d.Morning++
		case h >= 12 && h < 18:
			d.Afternoon++
		case h >= 18 && h < 22:
			d.Evening++
		default:
			d.Night++
		}
		rangeDays[key] = d
	}
	rangeSeconds := map[string]int{}
	for _, f := range spans {
		if !f.StartedAt.Before(from) && f.StartedAt.Before(to) && f.ElapsedS >= 0 {
			rangeSeconds[f.StartedAt.In(loc).Format("2006-01-02")] += f.ElapsedS
		}
	}
	for date := startDay(from, loc); !date.After(endDay); date = date.AddDate(0, 0, 1) {
		key := date.Format("2006-01-02")
		d := rangeDays[key]
		d.Date = key
		d.FocusMinutes = rangeSeconds[key] / 60
		r.Days = append(r.Days, d)
	}
	day := endDay
	if !active[day.Format("2006-01-02")] {
		day = day.AddDate(0, 0, -1)
	}
	for active[day.Format("2006-01-02")] {
		r.Streak++
		day = day.AddDate(0, 0, -1)
	}
	r.StreakMood = StreakMood(r.Streak)
	r.CompletedMood = CompletedMood(r.CompletedTotal)
	return r, nil
}
