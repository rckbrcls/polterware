package schedule

import (
	"fmt"
	"strings"
)

// Describe currently uses English for every locale, matching v1 product copy.
// Unknown locales fall back to English instead of producing an empty summary.
func Describe(r Rule, locale string) string {
	if r.Validate() != nil {
		return "Invalid schedule"
	}
	if r.Freq == "" {
		return "Once on " + r.Anchor.In(r.TZ).Format("Jan 2, 2006")
	}
	unit := ""
	switch r.Freq {
	case FreqMinutely:
		unit = "minute"
	case FreqHourly:
		unit = "hour"
	case FreqDaily:
		unit = "day"
	case FreqWeekly:
		unit = "week"
	case FreqMonthly:
		unit = "month"
	case FreqYearly:
		unit = "year"
	}
	text := "Every " + unit
	if r.Every != 1 {
		text = fmt.Sprintf("Every %d %ss", r.Every, unit)
	}
	if r.WeekdayMask != 0 {
		names := [7]string{"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"}
		days := make([]string, 0, 7)
		for _, day := range [7]int{1, 2, 3, 4, 5, 6, 0} {
			if r.WeekdayMask&(1<<day) != 0 {
				days = append(days, names[day])
			}
		}
		text += " on " + strings.Join(days, ", ")
	}
	if r.AllDay {
		text += " (all day)"
	}
	switch r.End.Type {
	case EndUntil:
		text += " until " + r.End.Until.In(r.TZ).Format("Jan 2, 2006 15:04 MST")
	case EndCount:
		text += fmt.Sprintf(" for %d occurrences", r.End.Count)
	}
	return text
}

func (r Rule) Describe(locale string) string { return Describe(r, locale) }
