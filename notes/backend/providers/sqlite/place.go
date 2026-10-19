package sqlite

import (
	"context"
	"database/sql"

	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/place"
)

const placeCols = `note_id, name, lat, lng, radius_m, event, active, updated_at`

func (r Places) Get(ctx context.Context, noteID string) (place.Place, error) {
	p, err := scanPlace(r.q(ctx, false).QueryRowContext(ctx, `SELECT `+placeCols+` FROM places WHERE note_id=?`, noteID))
	if err != nil {
		return place.Place{}, mapSQL(err, "place", noteID)
	}
	return p, nil
}

func (r Places) Upsert(ctx context.Context, p place.Place) error {
	return r.Within(ctx, func(ctx context.Context) error {
		event := p.Event
		if event == "" {
			event = place.EventEnter
		}
		radius := p.RadiusM
		if radius == 0 {
			radius = place.DefaultRadiusM
		}
		_, err := r.q(ctx, true).ExecContext(ctx, `
			INSERT INTO places(note_id, name, lat, lng, radius_m, event, active, updated_at)
			VALUES (?,?,?,?,?,?,?,?)
			ON CONFLICT(note_id) DO UPDATE SET
				name=excluded.name, lat=excluded.lat, lng=excluded.lng, radius_m=excluded.radius_m,
				event=excluded.event, active=excluded.active, updated_at=excluded.updated_at`,
			p.NoteID, nullString(p.Name), p.Lat, p.Lng, radius, event, boolInt(p.Active), formatTime(p.UpdatedAt))
		return err
	})
}

func (r Places) Delete(ctx context.Context, noteID string) error {
	return r.Within(ctx, func(ctx context.Context) error {
		res, err := r.q(ctx, true).ExecContext(ctx, `DELETE FROM places WHERE note_id=?`, noteID)
		if err != nil {
			return err
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			return fault.NotFound("place", noteID)
		}
		return nil
	})
}

func (r Places) ListInBounds(ctx context.Context, b place.Bounds) ([]place.Place, error) {
	query := `SELECT ` + placeCols + ` FROM places WHERE lat BETWEEN ? AND ? AND `
	args := []any{b.South, b.North}
	if b.West <= b.East {
		query += `lng BETWEEN ? AND ?`
		args = append(args, b.West, b.East)
	} else {
		query += `(lng >= ? OR lng <= ?)`
		args = append(args, b.West, b.East)
	}
	query += ` ORDER BY note_id`
	rows, err := r.q(ctx, false).QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []place.Place{}
	for rows.Next() {
		p, err := scanPlace(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func scanPlace(row interface{ Scan(...any) error }) (place.Place, error) {
	var p place.Place
	var name sql.NullString
	var active int
	var updated string
	if err := row.Scan(&p.NoteID, &name, &p.Lat, &p.Lng, &p.RadiusM, &p.Event, &active, &updated); err != nil {
		return place.Place{}, err
	}
	p.Name = scanString(name)
	p.Active = active != 0
	p.UpdatedAt = mustTime(updated)
	return p, nil
}
