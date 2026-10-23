// Package attachments stores attachment metadata and copied files.
package attachments

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"golang.org/x/sys/unix"

	domain "github.com/polterware/polterware/notes/backend/domains/attachments"
)

// Store uses the core's SQLite connection and a private attachments directory.
type Store struct {
	db   *sql.DB
	root string
}

var ulidPattern = regexp.MustCompile(`^[0-9A-HJKMNP-TV-Z]{26}$`)

func New(db *sql.DB, dataDir string) (*Store, error) {
	root := filepath.Join(dataDir, "attachments")
	if err := os.MkdirAll(root, 0700); err != nil {
		return nil, fmt.Errorf("create attachment directory: %w", err)
	}
	s := &Store{db: db, root: root}
	dir, err := s.openRoot()
	if err != nil {
		return nil, fmt.Errorf("open attachment directory: %w", err)
	}
	dir.Close()
	return s, nil
}

func (s *Store) ImportFile(ctx context.Context, noteID, id, source string) (domain.ImportedFile, error) {
	if err := ctx.Err(); err != nil {
		return domain.ImportedFile{}, err
	}
	if !ulidPattern.MatchString(noteID) || !ulidPattern.MatchString(id) {
		return domain.ImportedFile{}, fmt.Errorf("note and attachment IDs must be ULIDs")
	}
	in, err := openSource(source)
	if err != nil {
		return domain.ImportedFile{}, err
	}
	defer in.Close()
	openedInfo, err := in.Stat()
	if err != nil {
		return domain.ImportedFile{}, fmt.Errorf("stat opened source: %w", err)
	}
	if !openedInfo.Mode().IsRegular() {
		return domain.ImportedFile{}, fmt.Errorf("attachment source must be a regular non-symlink file")
	}
	if openedInfo.Size() > domain.ImportLimit(ctx) {
		return domain.ImportedFile{}, fmt.Errorf("attachment exceeds hard size limit")
	}
	buf := make([]byte, 512)
	n, readErr := io.ReadFull(contextReader{ctx, in}, buf)
	if readErr != nil && !errors.Is(readErr, io.EOF) && !errors.Is(readErr, io.ErrUnexpectedEOF) {
		return domain.ImportedFile{}, readErr
	}
	buf = buf[:n]
	detected := http.DetectContentType(buf)
	if i := strings.IndexByte(detected, ';'); i >= 0 {
		detected = detected[:i]
	}
	// WebM is the supported audio recording container; net/http sniffs
	// all WebM containers as video/webm.
	switch detected {
	case "audio/wave", "audio/x-wav":
		detected = "audio/wav"
	case "video/webm":
		detected = "audio/webm"
	}
	limit := min(domain.ByteLimit(detected), domain.ImportLimit(ctx))
	ext := ".bin"
	switch detected {
	case "image/jpeg":
		ext = ".jpg"
	case "image/png":
		ext = ".png"
	case "image/gif":
		ext = ".gif"
	case "image/webp":
		ext = ".webp"
	case "audio/mpeg":
		ext = ".mp3"
	case "audio/wav":
		ext = ".wav"
	case "audio/webm":
		ext = ".webm"
	case "audio/mp4":
		ext = ".m4a"
	case "application/pdf":
		ext = ".pdf"
	case "text/plain":
		ext = ".txt"
	}
	if err := ctx.Err(); err != nil {
		return domain.ImportedFile{}, err
	}
	dir, err := s.openNote(noteID, true)
	if err != nil {
		return domain.ImportedFile{}, err
	}
	defer dir.Close()
	rel := filepath.Join(noteID, id+ext)
	tmp, tmpName, err := createTemp(dir)
	if err != nil {
		return domain.ImportedFile{}, err
	}
	defer tmp.Close()
	defer unix.Unlinkat(int(dir.Fd()), tmpName, 0)
	h := sha256.New()
	w := io.MultiWriter(tmp, h)
	if _, err = w.Write(buf); err != nil {
		tmp.Close()
		return domain.ImportedFile{}, err
	}
	written, err := io.Copy(w, io.LimitReader(contextReader{ctx, in}, limit+1-int64(n)))
	if err != nil {
		tmp.Close()
		return domain.ImportedFile{}, err
	}
	size := int64(n) + written
	if size > limit {
		tmp.Close()
		return domain.ImportedFile{}, fmt.Errorf("attachment exceeds kind size limit")
	}
	if err = ctx.Err(); err != nil {
		return domain.ImportedFile{}, err
	}
	if err = tmp.Sync(); err != nil {
		tmp.Close()
		return domain.ImportedFile{}, err
	}
	if err = tmp.Close(); err != nil {
		return domain.ImportedFile{}, err
	}
	if err = unix.Renameat(int(dir.Fd()), tmpName, int(dir.Fd()), id+ext); err != nil {
		return domain.ImportedFile{}, err
	}
	return domain.ImportedFile{RelPath: rel, SizeBytes: size, SHA256: fmt.Sprintf("%x", h.Sum(nil)), Mime: detected}, nil
}

// contextReader checks cancellation throughout bounded copies.
type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r contextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(p)
}

func (s *Store) AbsolutePath(rel string) (string, error) {
	noteID, name, err := splitPath(rel)
	if err != nil {
		return "", err
	}
	dir, err := s.openNote(noteID, false)
	if err != nil {
		return "", err
	}
	defer dir.Close()
	var st unix.Stat_t
	if err = unix.Fstatat(int(dir.Fd()), name, &st, unix.AT_SYMLINK_NOFOLLOW); err != nil {
		return "", err
	}
	if st.Mode&unix.S_IFMT != unix.S_IFREG {
		return "", fmt.Errorf("attachment is not a regular file")
	}
	return filepath.Join(s.root, rel), nil
}

func (s *Store) RemoveFile(ctx context.Context, rel string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	noteID, name, err := splitPath(rel)
	if err != nil {
		return err
	}
	dir, err := s.openNote(noteID, false)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	defer dir.Close()
	// unlinkat removes the entry itself, never a symlink target.
	err = unix.Unlinkat(int(dir.Fd()), name, 0)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}
func (s *Store) List(ctx context.Context, noteID string) ([]domain.Attachment, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,note_id,kind,name,mime,size_bytes,sha256,rel_path,url,title,sort_order,created_at FROM attachments WHERE note_id=? ORDER BY sort_order,created_at`, noteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Attachment{}
	for rows.Next() {
		a, e := scan(rows)
		if e != nil {
			return nil, e
		}
		out = append(out, a)
	}
	return out, rows.Err()
}
func (s *Store) Get(ctx context.Context, id string) (domain.Attachment, error) {
	a, e := scan(s.db.QueryRowContext(ctx, `SELECT id,note_id,kind,name,mime,size_bytes,sha256,rel_path,url,title,sort_order,created_at FROM attachments WHERE id=?`, id))
	if errors.Is(e, sql.ErrNoRows) {
		return a, fmt.Errorf("attachment not found: %s", id)
	}
	return a, e
}

type scanner interface{ Scan(...any) error }

func scan(r scanner) (a domain.Attachment, err error) {
	var name, mime, hash, rel, url, title sql.NullString
	var size sql.NullInt64
	err = r.Scan(&a.ID, &a.NoteID, &a.Kind, &name, &mime, &size, &hash, &rel, &url, &title, &a.SortOrder, &a.CreatedAt)
	if err != nil {
		return
	}
	if name.Valid {
		a.Name = &name.String
	}
	if mime.Valid {
		a.Mime = &mime.String
	}
	if size.Valid {
		a.SizeBytes = &size.Int64
	}
	if hash.Valid {
		a.SHA256 = &hash.String
	}
	if rel.Valid {
		a.RelPath = &rel.String
	}
	if url.Valid {
		a.URL = &url.String
	}
	if title.Valid {
		a.Title = &title.String
	}
	return
}
func (s *Store) Insert(ctx context.Context, a domain.Attachment) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO attachments(id,note_id,kind,name,mime,size_bytes,sha256,rel_path,url,title,sort_order,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, a.ID, a.NoteID, a.Kind, a.Name, a.Mime, a.SizeBytes, a.SHA256, a.RelPath, a.URL, a.Title, a.SortOrder, a.CreatedAt.UTC().Format("2006-01-02T15:04:05.000Z"))
	return err
}
func (s *Store) Delete(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM attachments WHERE id=?`, id)
	return err
}
func (s *Store) Reorder(ctx context.Context, noteID string, ids []string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for i, id := range ids {
		r, e := tx.ExecContext(ctx, `UPDATE attachments SET sort_order=? WHERE id=? AND note_id=?`, i, id, noteID)
		if e != nil {
			return e
		}
		n, e := r.RowsAffected()
		if e != nil {
			return e
		}
		if n != 1 {
			return fmt.Errorf("attachment %q does not belong to note", id)
		}
	}
	return tx.Commit()
}

// SweepOrphans removes files without rows and rows whose files disappeared.
func (s *Store) SweepOrphans(ctx context.Context) (int, error) {
	return s.SweepOrphansWith(ctx, s.Delete)
}

// SweepOrphansWith keeps metadata deletion in the core's transaction/audit path.
func (s *Store) SweepOrphansWith(ctx context.Context, removeMissing func(context.Context, string) error) (int, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,rel_path FROM attachments WHERE rel_path IS NOT NULL`)
	if err != nil {
		return 0, err
	}
	known := map[string]string{}
	for rows.Next() {
		var id, rel string
		if err = rows.Scan(&id, &rel); err != nil {
			rows.Close()
			return 0, err
		}
		known[rel] = id
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return 0, err
	}
	rows.Close()
	removed := 0
	root, err := s.openRoot()
	if err != nil {
		return 0, err
	}
	defer root.Close()
	dirs, err := root.ReadDir(-1)
	if err != nil {
		return 0, err
	}
	for _, entry := range dirs {
		if err = ctx.Err(); err != nil {
			return removed, err
		}
		if !entry.IsDir() {
			if err = unix.Unlinkat(int(root.Fd()), entry.Name(), 0); err != nil {
				return removed, err
			}
			removed++
			continue
		}
		dir, e := openDirectory(root, entry.Name())
		if e != nil {
			return removed, e
		}
		entries, e := dir.ReadDir(-1)
		if e != nil {
			dir.Close()
			return removed, e
		}
		for _, file := range entries {
			rel := filepath.Join(entry.Name(), file.Name())
			var info unix.Stat_t
			e := unix.Fstatat(int(dir.Fd()), file.Name(), &info, unix.AT_SYMLINK_NOFOLLOW)
			if e != nil {
				dir.Close()
				return removed, e
			}
			_, exists := known[rel]
			if !exists || info.Mode&unix.S_IFMT != unix.S_IFREG {
				if e = unix.Unlinkat(int(dir.Fd()), file.Name(), 0); e != nil {
					dir.Close()
					return removed, e
				}
				removed++
			} else {
				delete(known, rel)
			}
		}
		dir.Close()
	}
	for _, id := range known {
		if err = ctx.Err(); err != nil {
			return removed, err
		}
		if err = removeMissing(ctx, id); err != nil {
			return removed, err
		}
		removed++
	}
	return removed, nil
}

var _ domain.Store = (*Store)(nil)
