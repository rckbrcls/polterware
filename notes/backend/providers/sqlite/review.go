package sqlite

import (
	"context"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/review"
)

func (r Review) Completions(ctx context.Context, from, to time.Time) ([]review.Completion, error) {
	rows, err := r.q(ctx, false).QueryContext(ctx, `
		SELECT note_id, completed_at FROM completions
		WHERE completed_at >= ? AND completed_at < ?
		ORDER BY completed_at, note_id`, formatTime(from), formatTime(to))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []review.Completion{}
	for rows.Next() {
		var c review.Completion
		var at string
		if err := rows.Scan(&c.NoteID, &at); err != nil {
			return nil, err
		}
		c.At = mustTime(at)
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r Review) FocusSpans(ctx context.Context, from, to time.Time) ([]review.FocusSpan, error) {
	rows, err := r.q(ctx, false).QueryContext(ctx, `
		SELECT started_at, elapsed_s FROM focus_sessions
		WHERE started_at >= ? AND started_at < ?
		ORDER BY started_at`, formatTime(from), formatTime(to))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []review.FocusSpan{}
	for rows.Next() {
		var s review.FocusSpan
		var started string
		if err := rows.Scan(&started, &s.ElapsedS); err != nil {
			return nil, err
		}
		s.StartedAt = mustTime(started)
		out = append(out, s)
	}
	return out, rows.Err()
}
