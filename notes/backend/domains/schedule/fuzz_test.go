package schedule

import (
	"testing"
	"time"
)

// One target intentionally covers every frequency/zone: the mandated -fuzz=.
// command can select it unambiguously. Seed each zone around both DST seasons.
func FuzzRule(f *testing.F) {
	for zone := uint8(0); zone < 7; zone++ {
		for freq := uint8(0); freq < 7; freq++ {
			f.Add(freq, zone, uint8(2), uint8(6), uint8(2), uint8(30), uint8(0), int64(1))
			f.Add(freq, zone, uint8(9), uint8(30), uint8(1), uint8(30), uint8(1), int64(1))
			f.Add(freq, zone, uint8(8), uint8(25), uint8(2), uint8(30), uint8(0), int64(1))
			f.Add(freq, zone, uint8(3), uint8(3), uint8(2), uint8(30), uint8(0), int64(1))
		}
	}
	f.Fuzz(func(t *testing.T, frequency, zone, month, day, hour, minute, flags uint8, every int64) {
		zones := [7]string{"UTC", "Pacific/Auckland", "Asia/Kolkata", "America/Sao_Paulo", "Europe/London", "America/New_York", "Australia/Lord_Howe"}
		freqs := [7]Freq{"", FreqMinutely, FreqHourly, FreqDaily, FreqWeekly, FreqMonthly, FreqYearly}
		loc := location(t, zones[int(zone)%len(zones)])
		anchor := time.Date(2026, time.Month(month%12+1), int(day%31+1), int(hour%24), int(minute%60), 0, 0, loc)
		r := Rule{Anchor: anchor.UTC(), TZ: loc, Freq: freqs[int(frequency)%len(freqs)], Every: int(every)}
		if flags&2 != 0 {
			r.AllDay = true
		}
		if r.Freq == FreqWeekly {
			r.WeekdayMask = flags & 127
		}
		if flags&4 != 0 {
			r.End = End{Type: EndCount, Count: int(flags%25) + 1}
		} else if flags&8 != 0 {
			until := anchor.AddDate(0, 0, 60)
			r.End = End{Type: EndUntil, Until: &until}
		}
		if flags&16 != 0 {
			r.TZ = nil
		}
		if flags&32 != 0 {
			r.Freq = "invalid"
		}
		from := anchor.AddDate(0, 0, int(day%60))
		to := from.AddDate(0, 0, 40)
		items, err := r.At(from, to, 128)
		if r.Validate() != nil {
			if err == nil {
				t.Fatal("invalid rule accepted")
			}
			return
		}
		if err != nil {
			t.Fatal(err)
		}
		prev := from.Add(-time.Nanosecond)
		for _, item := range items {
			if !item.After(prev) || item.Before(from) || !item.Before(to) {
				t.Fatalf("unordered/out of range: %v %v", prev, item)
			}
			next, ok := r.Next(prev)
			if !ok || !next.Equal(item) {
				t.Fatalf("Next(%v)=%v,%v want %v; rule %+v", prev, next, ok, item, r)
			}
			prev = item
		}
	})
}
