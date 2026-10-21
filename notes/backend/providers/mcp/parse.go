package mcp

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/place"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
)

type nullable[T any] struct {
	Set   bool
	Null  bool
	Value T
}

func (n *nullable[T]) UnmarshalJSON(raw []byte) error {
	n.Set = true
	if string(raw) == "null" {
		n.Null = true
		return nil
	}
	return json.Unmarshal(raw, &n.Value)
}

func parseDue(raw string) (*time.Time, bool, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, false, nil
	}
	if len(raw) == 10 && raw[4] == '-' && raw[7] == '-' {
		day, err := time.ParseInLocation("2006-01-02", raw, time.UTC)
		if err != nil {
			return nil, false, fault.Invalid(fault.Violation{Field: "due", Reason: "must be ISO-8601 or YYYY-MM-DD"})
		}
		return &day, true, nil
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339} {
		if at, err := time.Parse(layout, raw); err == nil {
			utc := at.UTC()
			return &utc, false, nil
		}
	}
	return nil, false, fault.Invalid(fault.Violation{Field: "due", Reason: "must be ISO-8601 or YYYY-MM-DD"})
}

func parseInstant(raw, field string) (*time.Time, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02"} {
		if at, err := time.Parse(layout, raw); err == nil {
			utc := at.UTC()
			return &utc, nil
		}
	}
	return nil, fault.Invalid(fault.Violation{Field: field, Reason: "must be ISO-8601"})
}

func parseChecklist(raw []json.RawMessage) ([]note.CheckItemInput, error) {
	out := make([]note.CheckItemInput, 0, len(raw))
	for i, item := range raw {
		var title string
		if json.Unmarshal(item, &title) == nil {
			out = append(out, note.CheckItemInput{Title: title, SortOrder: i})
			continue
		}
		var obj struct {
			Title  string `json:"title"`
			Detail string `json:"detail"`
			ID     string `json:"id"`
			Done   bool   `json:"done"`
		}
		if err := json.Unmarshal(item, &obj); err != nil {
			return nil, fault.Invalid(fault.Violation{Field: "checklist", Reason: "string or {title, detail?}"})
		}
		out = append(out, note.CheckItemInput{ID: obj.ID, Title: obj.Title, Detail: obj.Detail, Done: obj.Done, SortOrder: i})
	}
	return out, nil
}

type scheduleInput struct {
	At     string `json:"at"`
	TZ     string `json:"tz"`
	Repeat *struct {
		Freq     string   `json:"freq"`
		Every    int      `json:"every"`
		Weekdays []string `json:"weekdays"`
		Until    string   `json:"until"`
		Count    int      `json:"count"`
	} `json:"repeat"`
	Focus *struct {
		WorkMin       int  `json:"workMin"`
		ShortBreakMin int  `json:"shortBreakMin"`
		LongBreakMin  int  `json:"longBreakMin"`
		Cycles        int  `json:"cycles"`
		AutoContinue  bool `json:"autoContinue"`
	} `json:"focus"`
}

func parseSchedule(raw json.RawMessage, noteID string) (schedule.Schedule, schedule.Rule, error) {
	var in scheduleInput
	if err := json.Unmarshal(raw, &in); err != nil {
		return schedule.Schedule{}, schedule.Rule{}, fault.Invalid(fault.Violation{Field: "schedule", Reason: "invalid object"})
	}
	if strings.TrimSpace(in.At) == "" {
		return schedule.Schedule{}, schedule.Rule{}, fault.Invalid(fault.Violation{Field: "schedule.at", Reason: "required"})
	}
	zoneName := in.TZ
	if zoneName == "" {
		zoneName = "UTC"
	}
	loc, err := time.LoadLocation(zoneName)
	if err != nil {
		return schedule.Schedule{}, schedule.Rule{}, fault.Invalid(fault.Violation{Field: "schedule.tz", Reason: "unknown IANA zone"})
	}
	allDay := false
	var fire time.Time
	if len(in.At) == 10 {
		day, err := time.ParseInLocation("2006-01-02", in.At, loc)
		if err != nil {
			return schedule.Schedule{}, schedule.Rule{}, fault.Invalid(fault.Violation{Field: "schedule.at", Reason: "must be ISO-8601 or YYYY-MM-DD"})
		}
		fire, allDay = day, true
	} else {
		parsed, err := time.ParseInLocation(time.RFC3339Nano, in.At, loc)
		if err != nil {
			parsed, err = time.Parse(time.RFC3339Nano, in.At)
		}
		if err != nil {
			parsed, err = time.Parse(time.RFC3339, in.At)
		}
		if err != nil {
			return schedule.Schedule{}, schedule.Rule{}, fault.Invalid(fault.Violation{Field: "schedule.at", Reason: "must be ISO-8601 or YYYY-MM-DD"})
		}
		fire = parsed.In(loc)
	}
	row := schedule.Schedule{
		NoteID: noteID, Active: true, FireAt: fire.UTC().Truncate(time.Millisecond), TZ: loc.String(),
		AllDay: allDay, Every: 1, EndType: schedule.EndNever,
	}
	rule := schedule.Rule{Anchor: fire, TZ: loc, AllDay: allDay, Every: 1}
	if in.Repeat != nil {
		row.Freq = schedule.Freq(in.Repeat.Freq)
		rule.Freq = row.Freq
		if in.Repeat.Every > 0 {
			row.Every, rule.Every = in.Repeat.Every, in.Repeat.Every
		}
		mask, err := weekdayMask(in.Repeat.Weekdays)
		if err != nil {
			return schedule.Schedule{}, schedule.Rule{}, err
		}
		row.WeekdayMask, rule.WeekdayMask = mask, mask
		if in.Repeat.Until != "" && in.Repeat.Count > 0 {
			return schedule.Schedule{}, schedule.Rule{}, fault.Invalid(fault.Violation{Field: "schedule.repeat", Reason: "until and count cannot both be set"})
		}
		if in.Repeat.Until != "" {
			until, err := parseInstant(in.Repeat.Until, "schedule.repeat.until")
			if err != nil || until == nil {
				return schedule.Schedule{}, schedule.Rule{}, err
			}
			row.EndType, row.UntilAt = schedule.EndUntil, until
			rule.End = schedule.End{Type: schedule.EndUntil, Until: until}
		} else if in.Repeat.Count > 0 {
			count := in.Repeat.Count
			row.EndType, row.OccurrenceCount = schedule.EndCount, &count
			rule.End = schedule.End{Type: schedule.EndCount, Count: count}
		}
	}
	if in.Focus != nil {
		if in.Focus.WorkMin < 1 || in.Focus.WorkMin > 60 || in.Focus.ShortBreakMin < 1 || in.Focus.ShortBreakMin > 60 || in.Focus.LongBreakMin < 1 || in.Focus.LongBreakMin > 60 || in.Focus.Cycles < 1 || in.Focus.Cycles > 12 {
			return schedule.Schedule{}, schedule.Rule{}, fault.Invalid(fault.Violation{Field: "schedule.focus", Reason: "invalid focus recipe"})
		}
		row.FocusEnabled = true
		row.FocusWorkMin = intPtr(in.Focus.WorkMin)
		row.FocusShortBreakMin = intPtr(in.Focus.ShortBreakMin)
		row.FocusLongBreakMin = intPtr(in.Focus.LongBreakMin)
		row.FocusCycles = intPtr(in.Focus.Cycles)
		row.FocusAutoContinue = in.Focus.AutoContinue
	}
	if err := rule.Validate(); err != nil {
		return schedule.Schedule{}, schedule.Rule{}, err
	}
	return row, rule, nil
}

func weekdayMask(days []string) (uint8, error) {
	var mask uint8
	index := map[string]uint8{"sun": schedule.WeekdaySunday, "mon": schedule.WeekdayMonday, "tue": schedule.WeekdayTuesday, "wed": schedule.WeekdayWednesday, "thu": schedule.WeekdayThursday, "fri": schedule.WeekdayFriday, "sat": schedule.WeekdaySaturday}
	for _, day := range days {
		bit, ok := index[strings.ToLower(strings.TrimSpace(day))]
		if !ok {
			return 0, fault.Invalid(fault.Violation{Field: "schedule.repeat.weekdays", Reason: "use sun,mon,tue,wed,thu,fri,sat"})
		}
		mask |= bit
	}
	return mask, nil
}

type placeInput struct {
	Name    *string `json:"name"`
	Lat     float64 `json:"lat"`
	Lng     float64 `json:"lng"`
	RadiusM float64 `json:"radiusM"`
	Event   string  `json:"event"`
}

func parsePlace(raw json.RawMessage, noteID string) (place.Place, error) {
	var in placeInput
	if err := json.Unmarshal(raw, &in); err != nil {
		return place.Place{}, fault.Invalid(fault.Violation{Field: "place", Reason: "invalid object"})
	}
	p := place.Place{NoteID: noteID, Name: in.Name, Lat: in.Lat, Lng: in.Lng, RadiusM: in.RadiusM, Event: in.Event, Active: true}
	if p.RadiusM == 0 {
		p.RadiusM = place.DefaultRadiusM
	}
	if p.Lat < -90 || p.Lat > 90 || p.Lng < -180 || p.Lng > 180 || p.RadiusM < place.MinRadiusM || p.RadiusM > place.MaxRadiusM || (p.Event != "" && p.Event != place.EventEnter && p.Event != place.EventExit) {
		return place.Place{}, fault.Invalid(fault.Violation{Field: "place", Reason: "invalid coordinates, radius, or event"})
	}
	return p, nil
}

func intPtr(n int) *int {
	if n == 0 {
		return nil
	}
	v := n
	return &v
}

func clipSnippet(text string) string {
	text = strings.Join(strings.Fields(text), " ")
	if utf8.RuneCountInString(text) <= snippetRunes {
		return text
	}
	runes := []rune(text)
	return string(runes[:snippetRunes-1]) + "…"
}

func formatDue(at *time.Time, allDay bool) string {
	if at == nil {
		return ""
	}
	if allDay {
		return at.UTC().Format("2006-01-02")
	}
	return at.UTC().Format(time.RFC3339)
}

func nextOccurrences(times []time.Time) []string {
	out := make([]string, 0, len(times))
	for _, at := range times {
		out = append(out, at.UTC().Format(time.RFC3339))
	}
	return out
}

func scheduleLabel(rule schedule.Rule) string {
	text := schedule.Describe(rule, "en")
	if text == "" || text == "Invalid schedule" {
		return ""
	}
	return text
}

func limitOf(n int) (int, error) {
	if n == 0 {
		return DefaultLimit, nil
	}
	if n < 1 || n > MaxLimit {
		return 0, fmt.Errorf("limit must be between 1 and %d", MaxLimit)
	}
	return n, nil
}
