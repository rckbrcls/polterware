package schedule

import (
	"fmt"
	"math"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/fault"
)

const MaxOccurrences = 10_000

func invalid(field, reason string) error {
	return fault.Invalid(fault.Violation{Field: field, Reason: reason})
}

// Validate checks the rule before any arithmetic. Empty End.Type means never.
func (r Rule) Validate() error {
	if r.Anchor.IsZero() || r.Anchor.Year() < 1 || r.Anchor.Year() > 9999 {
		return invalid("anchor", "must be an instant in years 1 through 9999")
	}
	if r.TZ == nil {
		return invalid("tz", "an explicit location is required")
	}
	if r.Every < 1 {
		return invalid("every", "must be at least 1")
	}
	switch r.Freq {
	case "", FreqDaily, FreqWeekly, FreqMonthly, FreqYearly:
	case FreqMinutely, FreqHourly:
		unit := time.Minute
		if r.Freq == FreqHourly {
			unit = time.Hour
		}
		if int64(r.Every) > math.MaxInt64/int64(unit) {
			return invalid("every", "elapsed interval overflows time.Duration")
		}
		if r.AllDay {
			return invalid("all_day", "sub-day recurrence cannot represent dates")
		}
	default:
		return invalid("freq", "unknown frequency")
	}
	if r.WeekdayMask > 127 || (r.WeekdayMask != 0 && r.Freq != FreqWeekly) {
		return invalid("weekday_mask", "must use bits 0 through 6 on a weekly rule")
	}
	switch r.End.Type {
	case "", EndNever:
		if r.End.Until != nil || r.End.Count != 0 {
			return invalid("end", "never cannot carry until or count")
		}
	case EndUntil:
		if r.End.Until == nil || r.End.Count != 0 || r.End.Until.Year() < 1 || r.End.Until.Year() > 9999 {
			return invalid("end", "until requires a valid instant and no count")
		}
	case EndCount:
		if r.End.Count < 1 || r.End.Until != nil {
			return invalid("end", "count must be positive and cannot carry until")
		}
	default:
		return invalid("end", "unknown end type")
	}
	return nil
}

// resolveWall uses both offsets around a transition. Go's time.Date alone does
// not promise which side of a gap/fold it chooses. Exact matches choose the
// earlier instant; a gap chooses the smallest forward wall-clock shift.
func resolveWall(wall time.Time, zone *time.Location) time.Time {
	y, m, d := wall.Date()
	h, min, sec := wall.Clock()
	guess := time.Date(y, m, d, h, min, sec, wall.Nanosecond(), zone)
	_, offset := guess.Zone()
	best := wall.Add(-time.Duration(offset) * time.Second)
	bestShift := int64(math.MaxInt64)
	for _, probe := range [3]time.Time{guess.Add(-48 * time.Hour), guess, guess.Add(48 * time.Hour)} {
		_, off := probe.Zone()
		candidate := wall.Add(-time.Duration(off) * time.Second)
		local := candidate.In(zone)
		ly, lm, ld := local.Date()
		lh, lmin, ls := local.Clock()
		shift := time.Date(ly, lm, ld, lh, lmin, ls, local.Nanosecond(), time.UTC).Unix() - wall.Unix()
		if shift >= 0 && (shift < bestShift || (shift == bestShift && candidate.Before(best))) {
			best, bestShift = candidate, shift
		}
	}
	return best.UTC()
}

type series struct {
	rule  Rule
	wall  time.Time // civil components encoded in UTC, not an occurrence instant
	start time.Time
	week  time.Time
	days  [7]int
	first [7]int
	n, nf int
	step  int64 // elapsed seconds
}

func prepare(r Rule) (series, error) {
	if err := r.Validate(); err != nil {
		return series{}, err
	}
	a := r.Anchor.In(r.TZ)
	y, m, d := a.Date()
	h, min, sec := a.Clock()
	nano := a.Nanosecond()
	if r.AllDay {
		h, min, sec, nano = 0, 0, 0, 0
	}
	s := series{rule: r, wall: time.Date(y, m, d, h, min, sec, nano, time.UTC), start: r.Anchor.UTC()}
	if r.AllDay {
		s.start = resolveWall(s.wall, r.TZ)
	}
	if r.Freq == FreqHourly || r.Freq == FreqMinutely {
		s.step = int64(r.Every) * 60
		if r.Freq == FreqHourly {
			s.step *= 60
		}
	}
	if r.WeekdayMask != 0 {
		anchorDay := (int(s.wall.Weekday()) + 6) % 7
		s.week = s.wall.AddDate(0, 0, -anchorDay)
		for day := 0; day < 7; day++ {
			if r.WeekdayMask&(1<<((day+1)%7)) == 0 {
				continue
			}
			s.days[s.n], s.n = day, s.n+1
			if day >= anchorDay {
				s.first[s.nf], s.nf = day, s.nf+1
			}
		}
	}
	return s, nil
}

// atIndex derives every wall date from the anchor. Multiplications are bounded
// by the representable calendar before they occur, including arbitrary inputs.
func (s series) atIndex(k int64) (time.Time, bool) {
	r := s.rule
	if k < 0 || (r.End.Type == EndCount && k >= int64(r.End.Count)) || (r.Freq == "" && k > 0) {
		return time.Time{}, false
	}
	var t time.Time
	if s.step != 0 {
		maxSeconds := int64(253402300799) - s.start.Unix()
		if k > maxSeconds/s.step {
			return time.Time{}, false
		}
		t = time.Unix(s.start.Unix()+k*s.step, int64(s.start.Nanosecond())).UTC()
	} else if r.Freq == "" {
		t = s.start
	} else {
		wall := s.wall
		if r.WeekdayMask != 0 {
			cycle, day := int64(0), 0
			if k < int64(s.nf) {
				day = s.first[k]
			} else {
				j := k - int64(s.nf)
				cycle, day = 1+j/int64(s.n), s.days[j%int64(s.n)]
			}
			if int64(r.Every) > 3_652_059/7 || cycle > 3_652_059/(7*int64(r.Every)) {
				if cycle != 0 {
					return time.Time{}, false
				}
			}
			wall = s.week.AddDate(0, 0, int(cycle)*r.Every*7+day)
		} else {
			maxUnits := int64(3_652_059)
			switch r.Freq {
			case FreqWeekly:
				maxUnits /= 7
			case FreqMonthly:
				maxUnits = 119_987
			case FreqYearly:
				maxUnits = 9_998
			}
			if k > maxUnits/int64(r.Every) {
				return time.Time{}, false
			}
			units := int(k) * r.Every
			switch r.Freq {
			case FreqDaily:
				wall = wall.AddDate(0, 0, units)
			case FreqWeekly:
				wall = wall.AddDate(0, 0, 7*units)
			case FreqMonthly, FreqYearly:
				y, m, day := wall.Date()
				if r.Freq == FreqMonthly {
					base := time.Date(y, m+time.Month(units), 1, 0, 0, 0, 0, time.UTC)
					y, m = base.Year(), base.Month()
				} else {
					y += units
				}
				last := time.Date(y, m+1, 0, 0, 0, 0, 0, time.UTC).Day()
				if day > last {
					day = last
				}
				wall = time.Date(y, m, day, wall.Hour(), wall.Minute(), wall.Second(), wall.Nanosecond(), time.UTC)
			}
		}
		if wall.Year() < 1 || wall.Year() > 9999 {
			return time.Time{}, false
		}
		t = resolveWall(wall, r.TZ)
	}
	if r.End.Type == EndUntil && t.After(*r.End.Until) {
		return time.Time{}, false
	}
	return t, true
}

// seek jumps to the requested delta rather than walking history or a horizon.
func (s series) seek(from time.Time) int64 {
	if !from.After(s.start) {
		return 0
	}
	if s.step != 0 {
		k := (from.Unix() - s.start.Unix()) / s.step
		if t, ok := s.atIndex(k); ok && t.Before(from) {
			k++
		}
		return k
	}
	a := from.In(s.rule.TZ)
	date := time.Date(a.Year(), a.Month(), a.Day(), 0, 0, 0, 0, time.UTC)
	anchorDate := time.Date(s.wall.Year(), s.wall.Month(), s.wall.Day(), 0, 0, 0, 0, time.UTC)
	days := (date.Unix() - anchorDate.Unix()) / 86400
	k := int64(0)
	switch s.rule.Freq {
	case FreqDaily:
		k = days / int64(s.rule.Every)
	case FreqWeekly:
		if s.n != 0 {
			weeks := (date.Unix() - time.Date(s.week.Year(), s.week.Month(), s.week.Day(), 0, 0, 0, 0, time.UTC).Unix()) / 86400 / 7 / int64(s.rule.Every)
			k = int64(s.nf) + (weeks-1)*int64(s.n)
		} else {
			k = days / 7 / int64(s.rule.Every)
		}
	case FreqMonthly:
		k = int64((a.Year()-s.wall.Year())*12+int(a.Month()-s.wall.Month())) / int64(s.rule.Every)
	case FreqYearly:
		k = int64(a.Year()-s.wall.Year()) / int64(s.rule.Every)
	}
	k = max(0, k-1) // DST/date-line adjustment; also finds weekdays within the week.
	for {
		t, ok := s.atIndex(k)
		if !ok || !t.Before(from) {
			return k
		}
		k++
	}
}

type cursor struct {
	s    series
	k    int64
	prev time.Time
}

func (c *cursor) next() (time.Time, bool) {
	for {
		t, ok := c.s.atIndex(c.k)
		if !ok {
			return time.Time{}, false
		}
		c.k++
		if !c.prev.IsZero() && !t.After(c.prev) {
			continue
		}
		c.prev = t
		return t, true
	}
}

// Next returns the first occurrence strictly after after. Invalid rules return
// false; callers needing an error should use Validate, At, or Preview.
func (r Rule) Next(after time.Time) (time.Time, bool) {
	s, err := prepare(r)
	if err != nil {
		return time.Time{}, false
	}
	c := cursor{s: s, k: s.seek(after), prev: after}
	return c.next()
}

func checkRange(from, to time.Time) error {
	if from.Year() < 1 || to.Year() > 9999 || to.Before(from) {
		return invalid("range", "must be an ordered range in years 1 through 9999")
	}
	return nil
}

func (r Rule) checkRange(from, to time.Time) error {
	if err := checkRange(from, to); err != nil {
		return err
	}
	if r.Freq != "" && (r.End.Type == "" || r.End.Type == EndNever) && to.After(from.AddDate(5, 0, 0)) {
		return invalid("range", "an infinite series may be queried for at most 5 years")
	}
	return nil
}

// At returns occurrences in [from,to). A positive limit requests a prefix;
// zero requests the full range, capped at MaxOccurrences with INVALID_ARGUMENT
// if exceeded. A limit equal to MaxOccurrences also detects overflow.
func (r Rule) At(from, to time.Time, limit int) ([]time.Time, error) {
	s, err := prepare(r)
	if err != nil {
		return nil, err
	}
	if err := r.checkRange(from, to); err != nil {
		return nil, err
	}
	if limit < 0 || limit > MaxOccurrences {
		return nil, invalid("limit", "must be between 0 and 10000")
	}
	if limit == 0 {
		limit = MaxOccurrences
	}
	c := cursor{s: s, k: s.seek(from)}
	items := make([]time.Time, 0, min(limit, 64))
	for {
		t, ok := c.next()
		if !ok || !t.Before(to) {
			break
		}
		if len(items) == limit {
			if limit == MaxOccurrences {
				return nil, invalid("range", "more than 10000 occurrences")
			}
			break
		}
		items = append(items, t)
	}
	return items, nil
}

// Between expands the complete range subject to the hard caps.
func (r Rule) Between(from, to time.Time) ([]time.Time, error) { return r.At(from, to, 0) }

func (r Rule) Count(from, to time.Time) (int, error) {
	items, err := r.At(from, to, 0)
	return len(items), err
}

// Rule converts a stored schedule without I/O. Zone loading belongs to callers.
func (s Schedule) Rule(zone *time.Location) (Rule, error) {
	count := 0
	if s.OccurrenceCount != nil {
		count = *s.OccurrenceCount
	}
	r := Rule{Anchor: s.FireAt, TZ: zone, AllDay: s.AllDay, Freq: s.Freq, Every: s.Every, WeekdayMask: s.WeekdayMask,
		End: End{Type: s.EndType, Until: s.UntilAt, Count: count}}
	if err := r.Validate(); err != nil {
		return Rule{}, fmt.Errorf("schedule %s: %w", s.NoteID, err)
	}
	return r, nil
}
