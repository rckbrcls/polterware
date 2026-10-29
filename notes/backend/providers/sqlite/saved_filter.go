package sqlite

import (
	"context"

	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/savedfilter"
)

const savedFilterCols = `id, surface, name, payload_json, position, created_at, updated_at`

func (r SavedFilters) List(ctx context.Context, surface string) ([]savedfilter.SavedFilter, error) {
	rows, err := r.q(ctx, false).QueryContext(ctx, `SELECT `+savedFilterCols+` FROM saved_filters WHERE surface=? ORDER BY position, name`, surface)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []savedfilter.SavedFilter{}
	for rows.Next() {
		item, err := scanSavedFilter(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r SavedFilters) Save(ctx context.Context, f savedfilter.SavedFilter) (out savedfilter.SavedFilter, err error) {
	err = r.Within(ctx, func(ctx context.Context) error {
		_, err := r.q(ctx, true).ExecContext(ctx, `
			INSERT INTO saved_filters(id, surface, name, payload_json, position, created_at, updated_at)
			VALUES (?,?,?,?,(SELECT COALESCE(MAX(position)+1, 0) FROM saved_filters WHERE surface=?),?,?)
			ON CONFLICT(surface, name) DO UPDATE SET payload_json=excluded.payload_json, updated_at=excluded.updated_at`,
			f.ID, f.Surface, f.Name, f.PayloadJSON, f.Surface, formatTime(f.CreatedAt), formatTime(f.UpdatedAt))
		if err != nil {
			return mapSQL(err, "saved_filter", f.ID)
		}
		out, err = scanSavedFilter(r.q(ctx, true).QueryRowContext(ctx,
			`SELECT `+savedFilterCols+` FROM saved_filters WHERE surface=? AND name=?`, f.Surface, f.Name))
		return mapSQL(err, "saved_filter", f.Name)
	})
	return
}

func (r SavedFilters) Delete(ctx context.Context, id string) error {
	return r.Within(ctx, func(ctx context.Context) error {
		res, err := r.q(ctx, true).ExecContext(ctx, `DELETE FROM saved_filters WHERE id=?`, id)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return fault.NotFound("saved_filter", id)
		}
		return nil
	})
}

func scanSavedFilter(row interface{ Scan(...any) error }) (savedfilter.SavedFilter, error) {
	var f savedfilter.SavedFilter
	var created, updated string
	if err := row.Scan(&f.ID, &f.Surface, &f.Name, &f.PayloadJSON, &f.Position, &created, &updated); err != nil {
		return savedfilter.SavedFilter{}, err
	}
	f.CreatedAt = mustTime(created)
	f.UpdatedAt = mustTime(updated)
	return f, nil
}
