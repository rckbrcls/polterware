package sqlite

import (
	"context"
	"database/sql"

	"github.com/polterware/polterware/notes/backend/domains/attachments"
	"github.com/polterware/polterware/notes/backend/domains/fault"
)

const attachCols = `id, note_id, kind, name, mime, size_bytes, sha256, rel_path, url, title, sort_order, created_at`

func (r Attachments) List(ctx context.Context, noteID string) ([]attachments.Attachment, error) {
	rows, err := r.q(ctx, false).QueryContext(ctx, `SELECT `+attachCols+` FROM attachments WHERE note_id=? ORDER BY sort_order, id`, noteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []attachments.Attachment{}
	for rows.Next() {
		a, err := scanAttachment(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r Attachments) Get(ctx context.Context, id string) (attachments.Attachment, error) {
	a, err := scanAttachment(r.q(ctx, false).QueryRowContext(ctx, `SELECT `+attachCols+` FROM attachments WHERE id=?`, id))
	if err != nil {
		return attachments.Attachment{}, mapSQL(err, "attachment", id)
	}
	return a, nil
}

func (r Attachments) Insert(ctx context.Context, a attachments.Attachment) error {
	return r.Within(ctx, func(ctx context.Context) error {
		_, err := r.q(ctx, true).ExecContext(ctx, `
			INSERT INTO attachments(id, note_id, kind, name, mime, size_bytes, sha256, rel_path, url, title, sort_order, created_at)
			VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
			a.ID, a.NoteID, a.Kind, nullString(a.Name), nullString(a.Mime), nullInt64(a.SizeBytes),
			nullString(a.SHA256), nullString(a.RelPath), nullString(a.URL), nullString(a.Title),
			a.SortOrder, formatTime(a.CreatedAt))
		return mapSQL(err, "attachment", a.ID)
	})
}

func (r Attachments) Delete(ctx context.Context, id string) error {
	return r.Within(ctx, func(ctx context.Context) error {
		res, err := r.q(ctx, true).ExecContext(ctx, `DELETE FROM attachments WHERE id=?`, id)
		if err != nil {
			return err
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			return fault.NotFound("attachment", id)
		}
		return nil
	})
}

func (r Attachments) Reorder(ctx context.Context, noteID string, orderedIDs []string) error {
	return r.Within(ctx, func(ctx context.Context) error {
		for i, id := range orderedIDs {
			if _, err := r.q(ctx, true).ExecContext(ctx, `UPDATE attachments SET sort_order=? WHERE id=? AND note_id=?`, i, id, noteID); err != nil {
				return err
			}
		}
		return nil
	})
}

func (Attachments) ImportFile(context.Context, string, string, string) (attachments.ImportedFile, error) {
	return attachments.ImportedFile{}, fault.Unavailable("attachment files are owned by the attachments provider")
}

func (Attachments) AbsolutePath(string) (string, error) {
	return "", fault.Unavailable("attachment files are owned by the attachments provider")
}

func (Attachments) RemoveFile(context.Context, string) error {
	return fault.Unavailable("attachment files are owned by the attachments provider")
}

func scanAttachment(row interface{ Scan(...any) error }) (attachments.Attachment, error) {
	var a attachments.Attachment
	var name, mime, sha, rel, url, title sql.NullString
	var size sql.NullInt64
	var created string
	if err := row.Scan(&a.ID, &a.NoteID, &a.Kind, &name, &mime, &size, &sha, &rel, &url, &title, &a.SortOrder, &created); err != nil {
		return attachments.Attachment{}, err
	}
	a.Name = scanString(name)
	a.Mime = scanString(mime)
	a.SizeBytes = scanInt64(size)
	a.SHA256 = scanString(sha)
	a.RelPath = scanString(rel)
	a.URL = scanString(url)
	a.Title = scanString(title)
	a.CreatedAt = mustTime(created)
	return a, nil
}
