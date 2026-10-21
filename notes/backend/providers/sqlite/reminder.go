package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/reminder"
)

const heartbeatKey = "_internal.reminder.heartbeat"

type heartbeatPayload struct {
	At            string `json:"at"`
	Authorization string `json:"authorization"`
	Armed         int    `json:"armed"`
}

func (r Reminders) ListDue(ctx context.Context, from, to time.Time) ([]reminder.OneOff, error) {
	rows, err := r.q(ctx, false).QueryContext(ctx, `
		SELECT id, kind, note_id, fire_at, title, body, created_at
		FROM reminder_oneoffs WHERE fire_at >= ? AND fire_at <= ?
		ORDER BY fire_at, id`, formatTime(from), formatTime(to))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []reminder.OneOff{}
	for rows.Next() {
		o, err := scanOneOff(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

func (r Reminders) Insert(ctx context.Context, o reminder.OneOff) error {
	return r.Within(ctx, func(ctx context.Context) error {
		_, err := r.q(ctx, true).ExecContext(ctx, `
			INSERT INTO reminder_oneoffs(id, kind, note_id, fire_at, title, body, created_at)
			VALUES (?,?,?,?,?,?,?)`,
			o.ID, o.Kind, nullString(o.NoteID), formatTime(o.FireAt), o.Title, o.Body, formatTime(o.CreatedAt))
		return mapSQL(err, "reminder", o.ID)
	})
}

func (r Reminders) Delete(ctx context.Context, id string) error {
	return r.Within(ctx, func(ctx context.Context) error {
		res, err := r.q(ctx, true).ExecContext(ctx, `DELETE FROM reminder_oneoffs WHERE id=?`, id)
		if err != nil {
			return err
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			return fault.NotFound("reminder", id)
		}
		return nil
	})
}

func (r Reminders) Prune(ctx context.Context, before time.Time) error {
	return r.Within(ctx, func(ctx context.Context) error {
		_, err := r.q(ctx, true).ExecContext(ctx, `DELETE FROM reminder_oneoffs WHERE fire_at < ?`, formatTime(before))
		return err
	})
}

func (r Reminders) SetHeartbeat(ctx context.Context, at time.Time, authorization string, armed int) error {
	r.hbMu.Lock()
	r.hb.at = at
	r.hb.authorization = authorization
	r.hb.armed = armed
	r.hb.ok = true
	r.hbMu.Unlock()
	raw, err := json.Marshal(heartbeatPayload{At: formatTime(at), Authorization: authorization, Armed: armed})
	if err != nil {
		return err
	}
	return r.Settings().Set(ctx, heartbeatKey, string(raw))
}

func (r Reminders) LastSeen(ctx context.Context) (time.Time, string, int, bool, error) {
	r.hbMu.Lock()
	if r.hb.ok {
		at, auth, armed := r.hb.at, r.hb.authorization, r.hb.armed
		r.hbMu.Unlock()
		return at, auth, armed, true, nil
	}
	r.hbMu.Unlock()
	raw, ok, err := r.Settings().Get(ctx, heartbeatKey)
	if err != nil || !ok {
		return time.Time{}, "", 0, false, err
	}
	var p heartbeatPayload
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return time.Time{}, "", 0, false, err
	}
	return mustTime(p.At), p.Authorization, p.Armed, true, nil
}

func scanOneOff(row interface{ Scan(...any) error }) (reminder.OneOff, error) {
	var o reminder.OneOff
	var noteID, body sql.NullString
	var fireAt, created string
	if err := row.Scan(&o.ID, &o.Kind, &noteID, &fireAt, &o.Title, &body, &created); err != nil {
		return reminder.OneOff{}, err
	}
	o.NoteID = scanString(noteID)
	if body.Valid {
		o.Body = body.String
	}
	o.FireAt = mustTime(fireAt)
	o.CreatedAt = mustTime(created)
	return o, nil
}
