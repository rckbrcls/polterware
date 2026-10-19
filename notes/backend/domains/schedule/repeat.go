package schedule

import (
	"strconv"
	"time"
)

func optInt(v int) *int { return &v }

func copyRepeat(c DateComponents) *DateComponents {
	cp := c
	return &cp
}

func appleWeekday(day time.Weekday) int { return int(day) + 1 }

func openEndedEveryOne(r Rule) bool {
	return r.Every == 1 && (r.End.Type == "" || r.End.Type == EndNever)
}

// nativeRepeats returns OS calendar matchers for open-ended interval-1 rules the
// OS can express: minutely, hourly, daily, and weekly. Monthly/yearly, bounded
// series, and every>1 stay concrete one-shots. Weekday masks emit one matcher
// per selected day (Sunday=1).
func nativeRepeats(r Rule, hour, minute int) []DateComponents {
	if !openEndedEveryOne(r) {
		return nil
	}
	tz := r.TZ.String()
	local := r.Anchor.In(r.TZ)
	h, m, s := local.Clock()
	if r.AllDay {
		h, m, s = hour, minute, 0
	}
	switch r.Freq {
	case FreqMinutely:
		return []DateComponents{{TZ: tz, Second: optInt(s)}}
	case FreqHourly:
		return []DateComponents{{TZ: tz, Minute: optInt(m)}}
	case FreqDaily:
		return []DateComponents{{TZ: tz, Hour: optInt(h), Minute: optInt(m)}}
	case FreqWeekly:
		if r.WeekdayMask == 0 {
			return []DateComponents{{TZ: tz, Weekday: optInt(appleWeekday(local.Weekday())), Hour: optInt(h), Minute: optInt(m)}}
		}
		out := make([]DateComponents, 0, 7)
		for bit := 0; bit < 7; bit++ {
			if r.WeekdayMask&(1<<bit) == 0 {
				continue
			}
			out = append(out, DateComponents{TZ: tz, Weekday: optInt(bit + 1), Hour: optInt(h), Minute: optInt(m)})
		}
		return out
	default:
		return nil
	}
}

func repeatID(noteID string, weekdaySlot bool, appleWD int) string {
	if weekdaySlot {
		return "rem:" + noteID + ":wd" + strconv.Itoa(appleWD)
	}
	return "rem:" + noteID + ":repeat"
}

func nextWeekdayFire(now time.Time, rule Rule, rep DateComponents) (time.Time, time.Time, bool) {
	if rep.Weekday == nil {
		return time.Time{}, time.Time{}, false
	}
	hour, minute := 0, 0
	if rep.Hour != nil {
		hour = *rep.Hour
	}
	if rep.Minute != nil {
		minute = *rep.Minute
	}
	local := now.In(rule.TZ)
	for i := 0; i < 8; i++ {
		day := local.AddDate(0, 0, i)
		if appleWeekday(day.Weekday()) != *rep.Weekday {
			continue
		}
		y, m, d := day.Date()
		wall := time.Date(y, m, d, hour, minute, 0, 0, time.UTC)
		if rule.AllDay {
			wall = time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
		}
		at := resolveWall(wall, rule.TZ)
		fire := fireTime(at, rule, hour, minute)
		if !fire.Before(now) {
			return at, fire, true
		}
	}
	return time.Time{}, time.Time{}, false
}
