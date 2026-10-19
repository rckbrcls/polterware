package db

import (
	"context"
	"database/sql"
	"fmt"
	"golang.org/x/sys/unix"
	"os"
	"path/filepath"
	"time"

	"github.com/polterware/polterware/notes/backend/platform/changes"
)

const (
	busyTimeoutMS = 5000
	readerPool    = 4
	pragmas       = `PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;`
)

// Handle is one Polterware Notes database: a single writer connection and a small reader pool.
type Handle struct {
	writer      *sql.DB
	reader      *sql.DB
	path        string
	key         string
	AfterCommit AfterCommitFunc
}

func (h *Handle) Writer() *sql.DB { return h.writer }
func (h *Handle) Reader() *sql.DB { return h.reader }
func (h *Handle) Path() string    { return h.path }

func (h *Handle) Close() error {
	var first error
	if h.reader != nil {
		first = h.reader.Close()
	}
	if h.writer != nil {
		if err := h.writer.Close(); first == nil {
			first = err
		}
	}
	return first
}

// Open creates the parent directory, enables WAL on a file database, and
// returns one writer plus a read-only pool. ":memory:" shares a cache and
// does not use WAL.
func Open(path string) (*Handle, error) {
	if path == ":memory:" {
		return openMemory()
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("create db dir: %w", err)
	}
	// Existing shared directories are refused rather than chmodding an arbitrary
	// user-selected parent (for example /tmp or the home directory).
	dir, err := os.Stat(filepath.Dir(path))
	if err != nil {
		return nil, fmt.Errorf("inspect db dir: %w", err)
	}
	if dir.Mode().Perm()&0077 != 0 {
		// testing.TempDir and user-owned children may inherit 0755 underneath an
		// already private ancestor. Only tighten the leaf inside such a private tree.
		private := false
		for parent := filepath.Dir(filepath.Dir(path)); parent != filepath.Dir(parent); parent = filepath.Dir(parent) {
			info, err := os.Stat(parent)
			if err != nil {
				return nil, err
			}
			if info.Mode().Perm()&0077 == 0 {
				private = true
				break
			}
		}
		if !private {
			return nil, fmt.Errorf("database directory must be private (0700)")
		}
		if err := os.Chmod(filepath.Dir(path), 0700); err != nil {
			return nil, fmt.Errorf("protect db dir: %w", err)
		}
	}
	fd, err := unix.Open(path, unix.O_RDWR|unix.O_CREAT|unix.O_NOFOLLOW|unix.O_NONBLOCK|unix.O_CLOEXEC, 0600)
	if err != nil {
		return nil, fmt.Errorf("open private database: %w", err)
	}
	file := os.NewFile(uintptr(fd), path)
	var stat unix.Stat_t
	err = unix.Fstat(fd, &stat)
	if err == nil && (stat.Mode&unix.S_IFMT != unix.S_IFREG || stat.Nlink != 1) {
		err = fmt.Errorf("database must be a regular file without links")
	}
	if err == nil {
		err = file.Chmod(0600)
	}
	file.Close()
	if err != nil {
		return nil, fmt.Errorf("protect database: %w", err)
	}
	writerDSN := fmt.Sprintf("file:%s?_pragma=busy_timeout(%d)&_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)", path, busyTimeoutMS)
	writer, err := sql.Open(driverName, writerDSN)
	if err != nil {
		return nil, fmt.Errorf("open writer: %w", err)
	}
	writer.SetMaxOpenConns(1)
	writer.SetMaxIdleConns(1)
	writer.SetConnMaxLifetime(0)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := applyWriterPragmas(ctx, writer); err != nil {
		_ = writer.Close()
		return nil, err
	}
	readerDSN := fmt.Sprintf("file:%s?mode=ro&_pragma=busy_timeout(%d)&_pragma=foreign_keys(1)", path, busyTimeoutMS)
	reader, err := sql.Open("sqlite", readerDSN)
	if err != nil {
		_ = writer.Close()
		return nil, fmt.Errorf("open reader: %w", err)
	}
	reader.SetMaxOpenConns(readerPool)
	reader.SetMaxIdleConns(readerPool)
	if _, err := reader.ExecContext(ctx, `PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;`); err != nil {
		_ = reader.Close()
		_ = writer.Close()
		return nil, fmt.Errorf("reader pragmas: %w", err)
	}
	return &Handle{writer: writer, reader: reader, path: path, key: path}, nil
}

func openMemory() (*Handle, error) {
	unique := fmt.Sprintf("notes-mem-%d", time.Now().UnixNano())
	name := fmt.Sprintf("file:%s?mode=memory&cache=shared&_pragma=busy_timeout(%d)&_pragma=foreign_keys(1)", unique, busyTimeoutMS)
	writer, err := sql.Open(driverName, name)
	if err != nil {
		return nil, fmt.Errorf("open memory: %w", err)
	}
	writer.SetMaxOpenConns(1)
	writer.SetMaxIdleConns(1)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := writer.ExecContext(ctx, pragmas); err != nil {
		_ = writer.Close()
		return nil, fmt.Errorf("memory pragmas: %w", err)
	}
	return &Handle{writer: writer, reader: writer, path: ":memory:", key: unique}, nil
}

func applyWriterPragmas(ctx context.Context, db *sql.DB) error {
	if _, err := db.ExecContext(ctx, pragmas); err != nil {
		return fmt.Errorf("writer pragmas: %w", err)
	}
	var mode string
	if err := db.QueryRowContext(ctx, `PRAGMA journal_mode`).Scan(&mode); err != nil {
		return fmt.Errorf("journal_mode: %w", err)
	}
	if mode != "wal" {
		var set string
		if err := db.QueryRowContext(ctx, `PRAGMA journal_mode = WAL`).Scan(&set); err != nil {
			return fmt.Errorf("enable wal: %w", err)
		}
		if set != "wal" {
			return fmt.Errorf("journal_mode = %s, want wal", set)
		}
	}
	return nil
}

// BindBroadcaster publishes harvested entity changes after each successful commit.
func (h *Handle) BindBroadcaster(bus *changes.Broadcaster) {
	h.AfterCommit = func(batch []changes.Change) {
		if bus == nil || len(batch) == 0 {
			return
		}
		bus.Publish(batch)
	}
}
