package focus_test

import (
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/focus"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"testing"
	"time"
)

func TestFocusDefaults(t *testing.T) {
	f := setup()
	d, e := f.FS.GetDefaults(f.Ctx)
	check(t, e)
	if d != focus.DefaultDefaults() {
		t.Fatal(d)
	}
	for _, tc := range []struct {
		name   string
		modify func(*focus.Defaults)
	}{{"work low", func(d *focus.Defaults) { d.WorkMin = 0 }}, {"work high", func(d *focus.Defaults) { d.WorkMin = 61 }}, {"short low", func(d *focus.Defaults) { d.ShortBreakMin = 0 }}, {"short high", func(d *focus.Defaults) { d.ShortBreakMin = 61 }}, {"long low", func(d *focus.Defaults) { d.LongBreakMin = 0 }}, {"long high", func(d *focus.Defaults) { d.LongBreakMin = 61 }}, {"cycles low", func(d *focus.Defaults) { d.Cycles = 0 }}, {"cycles high", func(d *focus.Defaults) { d.Cycles = 13 }}} {
		t.Run(tc.name, func(t *testing.T) {
			bad := d
			tc.modify(&bad)
			_, e := f.FS.SetDefaults(f.Ctx, actor.UI(), bad)
			code(t, e, fault.CodeInvalid)
		})
	}
	for _, value := range []focus.Defaults{{WorkMin: 1, ShortBreakMin: 1, LongBreakMin: 1, Cycles: 1}, {WorkMin: 60, ShortBreakMin: 60, LongBreakMin: 60, Cycles: 12, AutoContinue: true, Sounds: true, Notifications: true}} {
		got, e := f.FS.SetDefaults(f.Ctx, actor.CLI(), value)
		check(t, e)
		if got != value {
			t.Fatal(got)
		}
		got, e = f.FS.GetDefaults(f.Ctx)
		check(t, e)
		if got != value {
			t.Fatal(got)
		}
	}
	for _, raw := range []string{"null", "\"bad\"", "0"} {
		check(t, f.Settings.Set(f.Ctx, "focus.work", raw))
		_, e = f.FS.GetDefaults(f.Ctx)
		if e == nil {
			t.Fatal(raw)
		}
	}
}
func TestFocusSessions(t *testing.T) {
	f := setup()
	a := actor.UI()
	now := f.Audit.Clock.Now()
	good := focus.Session{Phase: focus.PhaseWork, PlannedS: 1500, ElapsedS: 1200, State: focus.StateStopped, StartedAt: now.Add(-25 * time.Minute), EndedAt: now}
	m, e := f.MS.Create(f.Ctx, a, note.Create{Title: "Focus"})
	check(t, e)
	good.NoteID = &m.ID
	for _, phase := range []string{focus.PhaseWork, focus.PhaseShortBreak, focus.PhaseLongBreak} {
		s := good
		s.Phase = phase
		got, e := f.FS.RecordSession(f.Ctx, a, s)
		check(t, e)
		if got.ID == "" || got.StartedAt.Location() != time.UTC {
			t.Fatal(got)
		}
	}
	quick := good
	quick.NoteID = nil
	quick.State = focus.StateCompleted
	quick.ElapsedS = quick.PlannedS
	_, e = f.FS.RecordSession(f.Ctx, a, quick)
	check(t, e)
	rows, e := f.FS.ListSessions(f.Ctx, now.Add(-time.Hour), now)
	check(t, e)
	if len(rows) != 4 {
		t.Fatal(rows)
	}
	_, e = f.FS.ListSessions(f.Ctx, now, now)
	code(t, e, fault.CodeInvalid)
	for _, tc := range []struct {
		name   string
		modify func(*focus.Session)
		code   string
	}{{"phase", func(s *focus.Session) { s.Phase = "bad" }, fault.CodeInvalid}, {"state", func(s *focus.Session) { s.State = "bad" }, fault.CodeInvalid}, {"planned low", func(s *focus.Session) { s.PlannedS = 59 }, fault.CodeInvalid}, {"planned high", func(s *focus.Session) { s.PlannedS = 3601 }, fault.CodeInvalid}, {"elapsed negative", func(s *focus.Session) { s.ElapsedS = -1 }, fault.CodeInvalid}, {"elapsed high", func(s *focus.Session) { s.ElapsedS = 1501 }, fault.CodeInvalid}, {"zero start", func(s *focus.Session) { s.StartedAt = time.Time{} }, fault.CodeInvalid}, {"end before", func(s *focus.Session) { s.EndedAt = s.StartedAt.Add(-time.Second) }, fault.CodeInvalid}, {"future end", func(s *focus.Session) { s.EndedAt = now.Add(time.Hour) }, fault.CodeInvalid}, {"impossible elapsed", func(s *focus.Session) { s.StartedAt = now.Add(-time.Minute) }, fault.CodeInvalid}, {"missing note", func(s *focus.Session) { s.NoteID = ptr("missing") }, fault.CodeNotFound}} {
		t.Run(tc.name, func(t *testing.T) {
			in := good
			tc.modify(&in)
			_, e := f.FS.RecordSession(f.Ctx, a, in)
			code(t, e, tc.code)
		})
	}
}
