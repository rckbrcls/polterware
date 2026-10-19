package sqlite

import (
	"context"
	"database/sql"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/focus"
)

func (r Focus) InsertSession(ctx context.Context, s focus.Session) error {
	return r.Within(ctx, func(ctx context.Context) error {
		_, err := r.q(ctx, true).ExecContext(ctx, `
			INSERT INTO focus_sessions(id, note_id, phase, planned_s, elapsed_s, state, started_at, ended_at)
			VALUES (?,?,?,?,?,?,?,?)`,
			s.ID, nullString(s.NoteID), s.Phase, s.PlannedS, s.ElapsedS, s.State,
			formatTime(s.StartedAt), formatTime(s.EndedAt))
		return mapSQL(err, "focus", s.ID)
	})
}

func (r Focus) ListSessions(ctx context.Context, from, to time.Time) ([]focus.Session, error) {
	rows, err := r.q(ctx, false).QueryContext(ctx, `
		SELECT id, note_id, phase, planned_s, elapsed_s, state, started_at, ended_at
		FROM focus_sessions WHERE started_at >= ? AND started_at <= ?
		ORDER BY started_at, id`, formatTime(from), formatTime(to))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []focus.Session{}
	for rows.Next() {
		s, err := scanFocus(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func scanFocus(row interface{ Scan(...any) error }) (focus.Session, error) {
	var s focus.Session
	var noteID sql.NullString
	var started, ended string
	if err := row.Scan(&s.ID, &noteID, &s.Phase, &s.PlannedS, &s.ElapsedS, &s.State, &started, &ended); err != nil {
		return focus.Session{}, err
	}
	s.NoteID = scanString(noteID)
	s.StartedAt = mustTime(started)
	s.EndedAt = mustTime(ended)
	return s, nil
}
