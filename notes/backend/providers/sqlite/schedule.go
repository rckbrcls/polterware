package sqlite

import (
	"context"
	"database/sql"

	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
)

const scheduleCols = `note_id, active, fire_at, tz, all_day, freq, every, weekday_mask, end_type, until_at, occurrence_count, focus_enabled, focus_work_min, focus_short_break_min, focus_long_break_min, focus_cycles, focus_auto_continue, updated_at`

func (r Schedules) Get(ctx context.Context, noteID string) (schedule.Schedule, error) {
	s, err := scanSchedule(r.q(ctx, false).QueryRowContext(ctx, `SELECT `+scheduleCols+` FROM schedules WHERE note_id=?`, noteID))
	if err != nil {
		return schedule.Schedule{}, mapSQL(err, "schedule", noteID)
	}
	return s, nil
}

func (r Schedules) Upsert(ctx context.Context, s schedule.Schedule) error {
	return r.Within(ctx, func(ctx context.Context) error {
		if s.Every < 1 {
			s.Every = 1
		}
		freq := any(nil)
		if s.Freq != "" {
			freq = string(s.Freq)
		}
		endType := string(s.EndType)
		if endType == "" {
			endType = string(schedule.EndNever)
		}
		_, err := r.q(ctx, true).ExecContext(ctx, `
			INSERT INTO schedules(note_id, active, fire_at, tz, all_day, freq, every, weekday_mask, end_type, until_at, occurrence_count, focus_enabled, focus_work_min, focus_short_break_min, focus_long_break_min, focus_cycles, focus_auto_continue, updated_at)
			VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
			ON CONFLICT(note_id) DO UPDATE SET
				active=excluded.active, fire_at=excluded.fire_at, tz=excluded.tz, all_day=excluded.all_day,
				freq=excluded.freq, every=excluded.every, weekday_mask=excluded.weekday_mask, end_type=excluded.end_type,
				until_at=excluded.until_at, occurrence_count=excluded.occurrence_count, focus_enabled=excluded.focus_enabled,
				focus_work_min=excluded.focus_work_min, focus_short_break_min=excluded.focus_short_break_min,
				focus_long_break_min=excluded.focus_long_break_min, focus_cycles=excluded.focus_cycles,
				focus_auto_continue=excluded.focus_auto_continue, updated_at=excluded.updated_at`,
			s.NoteID, boolInt(s.Active), formatTime(s.FireAt), s.TZ, boolInt(s.AllDay), freq, s.Every, int(s.WeekdayMask),
			endType, nullTime(s.UntilAt), nullInt(s.OccurrenceCount), boolInt(s.FocusEnabled),
			nullInt(s.FocusWorkMin), nullInt(s.FocusShortBreakMin), nullInt(s.FocusLongBreakMin), nullInt(s.FocusCycles),
			boolInt(s.FocusAutoContinue), formatTime(s.UpdatedAt))
		return err
	})
}

func (r Schedules) Delete(ctx context.Context, noteID string) error {
	return r.Within(ctx, func(ctx context.Context) error {
		res, err := r.q(ctx, true).ExecContext(ctx, `DELETE FROM schedules WHERE note_id=?`, noteID)
		if err != nil {
			return err
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			return fault.NotFound("schedule", noteID)
		}
		return nil
	})
}

func (r Schedules) ListActive(ctx context.Context) ([]schedule.Schedule, error) {
	rows, err := r.q(ctx, false).QueryContext(ctx, `SELECT `+scheduleCols+` FROM schedules WHERE active=1 ORDER BY fire_at, note_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []schedule.Schedule{}
	for rows.Next() {
		s, err := scanSchedule(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func scanSchedule(row interface{ Scan(...any) error }) (schedule.Schedule, error) {
	var s schedule.Schedule
	var active, allDay, focusOn, auto int
	var freq, until sql.NullString
	var fireAt, updated string
	var occ, work, shortB, longB, cycles sql.NullInt64
	var mask int
	if err := row.Scan(&s.NoteID, &active, &fireAt, &s.TZ, &allDay, &freq, &s.Every, &mask, &s.EndType, &until,
		&occ, &focusOn, &work, &shortB, &longB, &cycles, &auto, &updated); err != nil {
		return schedule.Schedule{}, err
	}
	s.Active = active != 0
	s.FireAt = mustTime(fireAt)
	s.AllDay = allDay != 0
	if freq.Valid {
		s.Freq = schedule.Freq(freq.String)
	}
	s.WeekdayMask = uint8(mask)
	s.EndType = schedule.EndType(s.EndType)
	t, err := scanTime(until)
	if err != nil {
		return schedule.Schedule{}, err
	}
	s.UntilAt = t
	s.OccurrenceCount = scanInt(occ)
	s.FocusEnabled = focusOn != 0
	s.FocusWorkMin = scanInt(work)
	s.FocusShortBreakMin = scanInt(shortB)
	s.FocusLongBreakMin = scanInt(longB)
	s.FocusCycles = scanInt(cycles)
	s.FocusAutoContinue = auto != 0
	s.UpdatedAt = mustTime(updated)
	return s, nil
}
