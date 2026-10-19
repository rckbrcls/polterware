package sqlite

import (
	"context"
	"database/sql"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/space"
)

const spaceCols = `id, parent_id, name, color, icon, sort_order, created_at, updated_at, rev`

func (r Spaces) List(ctx context.Context) ([]space.Space, error) {
	rows, err := r.q(ctx, false).QueryContext(ctx, `SELECT `+spaceCols+` FROM spaces ORDER BY parent_id, sort_order, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []space.Space{}
	for rows.Next() {
		m, err := scanSpace(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r Spaces) Get(ctx context.Context, id string) (space.Space, error) {
	m, err := scanSpace(r.q(ctx, false).QueryRowContext(ctx, `SELECT `+spaceCols+` FROM spaces WHERE id=?`, id))
	if err != nil {
		return space.Space{}, mapSQL(err, "space", id)
	}
	return m, nil
}

func (r Spaces) Insert(ctx context.Context, m space.Space) error {
	return r.Within(ctx, func(ctx context.Context) error {
		_, err := r.q(ctx, true).ExecContext(ctx, `
			INSERT INTO spaces(id, parent_id, name, color, icon, sort_order, created_at, updated_at, rev)
			VALUES (?,?,?,?,?,?,?,?,?)`,
			m.ID, nullString(m.ParentID), m.Name, nullString(m.Color), nullString(m.Icon),
			m.SortOrder, formatTime(m.CreatedAt), formatTime(m.UpdatedAt), m.Rev)
		return mapSQL(err, "space", m.ID)
	})
}

func (r Spaces) Update(ctx context.Context, expectedRev int64, m space.Space) error {
	return r.Within(ctx, func(ctx context.Context) error {
		current, err := r.Get(ctx, m.ID)
		if err != nil {
			return err
		}
		if expectedRev != 0 && current.Rev != expectedRev {
			return updateConflict("space", m.ID, current.Rev, current)
		}
		res, err := r.q(ctx, true).ExecContext(ctx, `
			UPDATE spaces SET parent_id=?, name=?, color=?, icon=?, sort_order=?, updated_at=?, rev=?
			WHERE id=?`,
			nullString(m.ParentID), m.Name, nullString(m.Color), nullString(m.Icon),
			m.SortOrder, formatTime(m.UpdatedAt), m.Rev, m.ID)
		if err != nil {
			return err
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			return fault.NotFound("space", m.ID)
		}
		return r.reindexSpaceNotes(ctx, m.ID)
	})
}

func (r Spaces) Delete(ctx context.Context, expectedRev int64, id string) error {
	return r.Within(ctx, func(ctx context.Context) error {
		current, err := r.Get(ctx, id)
		if err != nil {
			return err
		}
		if expectedRev != 0 && current.Rev != expectedRev {
			return updateConflict("space", id, current.Rev, current)
		}
		ids, err := r.spaceNoteIDs(ctx, id)
		if err != nil {
			return err
		}
		at := formatTime(time.Now().UTC())
		for _, noteID := range ids {
			// Move explicitly so the FK cannot silently preserve an old revision.
			if _, err := r.q(ctx, true).ExecContext(ctx, `UPDATE notes SET space_id=NULL, rev=rev+1, updated_at=? WHERE id=?`, at, noteID); err != nil {
				return err
			}
		}
		if _, err := r.q(ctx, true).ExecContext(ctx, `DELETE FROM spaces WHERE id=?`, id); err != nil {
			return err
		}
		for _, noteID := range ids {
			if err := r.syncIndex(ctx, noteID, false); err != nil {
				return err
			}
		}
		return nil
	})
}

func scanSpace(row interface{ Scan(...any) error }) (space.Space, error) {
	var m space.Space
	var parent, color, icon sql.NullString
	var created, updated string
	if err := row.Scan(&m.ID, &parent, &m.Name, &color, &icon, &m.SortOrder, &created, &updated, &m.Rev); err != nil {
		return space.Space{}, err
	}
	m.ParentID = scanString(parent)
	m.Color = scanString(color)
	m.Icon = scanString(icon)
	m.CreatedAt = mustTime(created)
	m.UpdatedAt = mustTime(updated)
	return m, nil
}
