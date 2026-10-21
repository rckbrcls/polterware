package runstate

import (
	"fmt"
	"os"
	"sync"
)

// LogWriter rotates at 5 MB, retaining three private archives.
type LogWriter struct {
	mu    sync.Mutex
	path  string
	file  *os.File
	size  int64
	limit int64
}

func OpenLog(dbPath string) (*LogWriter, error) {
	if err := EnsureDir(dbPath); err != nil {
		return nil, err
	}
	w := &LogWriter{path: LogPath(dbPath), limit: 5 << 20}
	if err := w.open(); err != nil {
		return nil, err
	}
	return w, nil
}
func (w *LogWriter) open() error {
	f, err := os.OpenFile(w.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("open core log: %w", err)
	}
	if err := f.Chmod(0o600); err != nil {
		_ = f.Close()
		return err
	}
	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return err
	}
	w.file, w.size = f, info.Size()
	return nil
}
func (w *LogWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.file == nil {
		return 0, os.ErrClosed
	}
	if w.size > 0 && w.size+int64(len(p)) > w.limit {
		if err := w.file.Close(); err != nil {
			return 0, err
		}
		w.file = nil
		if err := os.Remove(w.path + ".3"); err != nil && !os.IsNotExist(err) {
			return 0, err
		}
		for i := 2; i >= 0; i-- {
			src := w.path
			if i > 0 {
				src = fmt.Sprintf("%s.%d", w.path, i)
			}
			if err := os.Rename(src, fmt.Sprintf("%s.%d", w.path, i+1)); err != nil && !os.IsNotExist(err) {
				return 0, err
			}
		}
		if err := w.open(); err != nil {
			return 0, err
		}
	}
	n, err := w.file.Write(p)
	w.size += int64(n)
	return n, err
}
func (w *LogWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.file == nil {
		return nil
	}
	err := w.file.Close()
	w.file = nil
	return err
}
