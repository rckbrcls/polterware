package sqlite

import (
	"context"
	"fmt"
	"github.com/polterware/polterware/notes/backend/platform/privatedest"
	"io"
	"os"
	"path/filepath"
)

func (s *Store) Backup(ctx context.Context, destPath string) (int64, error) {
	// VACUUM creates its own file. Keep it in a private staging directory, then
	// publish through a 0600 descriptor without opening the caller's destination.
	stage, err := os.MkdirTemp(filepath.Dir(s.h.Path()), ".notes-backup-*")
	if err != nil {
		return 0, err
	}
	defer os.RemoveAll(stage)
	staged := filepath.Join(stage, "backup.db")
	if _, err := s.h.Writer().ExecContext(ctx, `VACUUM INTO ?`, staged); err != nil {
		return 0, fmt.Errorf("vacuum into private staging: %w", err)
	}
	source, err := os.Open(staged)
	if err != nil {
		return 0, err
	}
	defer source.Close()
	return privatedest.Write(ctx, destPath, func(file *os.File) error {
		_, err := io.Copy(file, contextBackupReader{ctx, source})
		return err
	})
}

type contextBackupReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r contextBackupReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(p)
}
