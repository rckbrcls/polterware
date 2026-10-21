package sqlite

import (
	"context"
	"database/sql"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/tag"
)

const tagCols = `t.id, t.name, t.color, t.created_at, t.updated_at, t.rev, (SELECT COUNT(*) FROM note_tags mt WHERE mt.tag_id = t.id)`

func (r Tags) List(ctx context.Context) ([]tag.Tag, error) {
	rows, err := r.q(ctx, false).QueryContext(ctx, `SELECT `+tagCols+` FROM tags t ORDER BY t.name COLLATE NOCASE`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []tag.Tag{}
	for rows.Next() {
		item, err := scanTag(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r Tags) Get(ctx context.Context, id string) (tag.Tag, error) {
	item, err := scanTag(r.q(ctx, false).QueryRowContext(ctx, `SELECT `+tagCols+` FROM tags t WHERE t.id=?`, id))
	if err != nil {
		return tag.Tag{}, mapSQL(err, "tag", id)
	}
	return item, nil
}

func (r Tags) GetByName(ctx context.Context, name string) (tag.Tag, error) {
	item, err := scanTag(r.q(ctx, false).QueryRowContext(ctx, `SELECT `+tagCols+` FROM tags t WHERE t.name = ? COLLATE NOCASE`, name))
	if err != nil {
		return tag.Tag{}, mapSQL(err, "tag", name)
	}
	return item, nil
}

func (r Tags) Insert(ctx context.Context, t tag.Tag) error {
	return r.Within(ctx, func(ctx context.Context) error {
		_, err := r.q(ctx, true).ExecContext(ctx, `
			INSERT INTO tags(id, name, color, created_at, updated_at, rev) VALUES (?,?,?,?,?,?)`,
			t.ID, t.Name, nullString(t.Color), formatTime(t.CreatedAt), formatTime(t.UpdatedAt), t.Rev)
		return mapSQL(err, "tag", t.ID)
	})
}

func (r Tags) Update(ctx context.Context, expectedRev int64, t tag.Tag) error {
	return r.Within(ctx, func(ctx context.Context) error {
		current, err := r.Get(ctx, t.ID)
		if err != nil {
			return err
		}
		if expectedRev != 0 && current.Rev != expectedRev {
			return updateConflict("tag", t.ID, current.Rev, current)
		}
		res, err := r.q(ctx, true).ExecContext(ctx, `
			UPDATE tags SET name=?, color=?, updated_at=?, rev=? WHERE id=?`,
			t.Name, nullString(t.Color), formatTime(t.UpdatedAt), t.Rev, t.ID)
		if err != nil {
			return err
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			return fault.NotFound("tag", t.ID)
		}
		return r.reindexTagged(ctx, t.ID)
	})
}

func (r Tags) Delete(ctx context.Context, id string) error {
	return r.Within(ctx, func(ctx context.Context) error {
		ids, err := r.noteIDs(ctx, id)
		if err != nil {
			return err
		}
		if _, err := r.Get(ctx, id); err != nil {
			return err
		}
		if _, err := r.q(ctx, true).ExecContext(ctx, `DELETE FROM tags WHERE id=?`, id); err != nil {
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

func (r Tags) Retarget(ctx context.Context, fromID, toID string) (int, error) {
	var moved int
	err := r.Within(ctx, func(ctx context.Context) error {
		ids, err := r.noteIDs(ctx, fromID)
		if err != nil {
			return err
		}
		if _, err := r.q(ctx, true).ExecContext(ctx, `
			INSERT OR IGNORE INTO note_tags(note_id, tag_id)
			SELECT note_id, ? FROM note_tags WHERE tag_id=?`, toID, fromID); err != nil {
			return err
		}
		res, err := r.q(ctx, true).ExecContext(ctx, `DELETE FROM note_tags WHERE tag_id=?`, fromID)
		if err != nil {
			return err
		}
		n, _ := res.RowsAffected()
		moved = int(n)
		at := formatTime(time.Now().UTC())
		for _, noteID := range ids {
			if _, err := r.q(ctx, true).ExecContext(ctx, `UPDATE notes SET rev=rev+1, updated_at=? WHERE id=?`, at, noteID); err != nil {
				return err
			}
			if err := r.syncIndex(ctx, noteID, false); err != nil {
				return err
			}
		}
		return nil
	})
	return moved, err
}

func (r Tags) Names(ctx context.Context) ([]string, error) {
	rows, err := r.q(ctx, false).QueryContext(ctx, `SELECT name FROM tags ORDER BY name COLLATE NOCASE`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		out = append(out, name)
	}
	return out, rows.Err()
}

func (r Tags) noteIDs(ctx context.Context, tagID string) ([]string, error) {
	rows, err := r.q(ctx, false).QueryContext(ctx, `SELECT note_id FROM note_tags WHERE tag_id=?`, tagID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (r Tags) reindexTagged(ctx context.Context, tagID string) error {
	ids, err := r.noteIDs(ctx, tagID)
	if err != nil {
		return err
	}
	for _, id := range ids {
		if err := r.syncIndex(ctx, id, false); err != nil {
			return err
		}
	}
	return nil
}

func scanTag(row interface{ Scan(...any) error }) (tag.Tag, error) {
	var t tag.Tag
	var color sql.NullString
	var created, updated string
	if err := row.Scan(&t.ID, &t.Name, &color, &created, &updated, &t.Rev, &t.UsageCount); err != nil {
		return tag.Tag{}, err
	}
	t.Color = scanString(color)
	t.CreatedAt = mustTime(created)
	t.UpdatedAt = mustTime(updated)
	return t, nil
}
