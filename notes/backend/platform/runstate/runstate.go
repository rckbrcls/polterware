// Package runstate owns private local core discovery and lock files.
package runstate

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"syscall"
	"time"
)

type Core struct {
	PID       int       `json:"pid"`
	Endpoint  string    `json:"endpoint"`
	Token     string    `json:"token"`
	DBPath    string    `json:"dbPath"`
	Build     string    `json:"build"`
	StartedAt time.Time `json:"startedAt"`
}

// CanonicalDBPath resolves aliases even before the database or its parents exist.
func CanonicalDBPath(dbPath string) (string, error) {
	abs, err := filepath.Abs(dbPath)
	if err != nil {
		return "", fmt.Errorf("resolve database path: %w", err)
	}
	return canonicalPath(abs, 0)
}

func canonicalPath(path string, depth int) (string, error) {
	if depth > 255 {
		return "", fmt.Errorf("resolve database path: too many symlinks or path components")
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err == nil {
		return resolved, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("resolve database path: %w", err)
	}
	// EvalSymlinks fails on a dangling link; resolve its target before appending
	// missing components, so creation cannot change the lock's identity.
	info, statErr := os.Lstat(path)
	if statErr == nil && info.Mode()&os.ModeSymlink != 0 {
		target, err := os.Readlink(path)
		if err != nil {
			return "", fmt.Errorf("read database symlink: %w", err)
		}
		if !filepath.IsAbs(target) {
			target = filepath.Join(filepath.Dir(path), target)
		}
		return canonicalPath(target, depth+1)
	}
	if statErr != nil && !errors.Is(statErr, os.ErrNotExist) {
		return "", fmt.Errorf("inspect database path: %w", statErr)
	}
	parent, err := canonicalPath(filepath.Dir(path), depth+1)
	if err != nil {
		return "", err
	}
	return filepath.Join(parent, filepath.Base(path)), nil
}

func Dir(dbPath string) string {
	if canonical, err := CanonicalDBPath(dbPath); err == nil {
		dbPath = canonical
	}
	return filepath.Join(filepath.Dir(dbPath), "run")
}
func CorePath(dbPath string) string  { return filepath.Join(Dir(dbPath), "core.json") }
func LockPath(dbPath string) string  { return filepath.Join(Dir(dbPath), "core.lock") }
func LogPath(dbPath string) string   { return filepath.Join(Dir(dbPath), "core.log") }
func TokenPath(dbPath string) string { return filepath.Join(Dir(dbPath), "mcp-token") }

// LockedError signals that a live core already owns the run directory.
type LockedError struct{}

func (LockedError) Error() string { return "another pwnotes core owns this database" }

func EnsureDir(dbPath string) error {
	canonical, err := CanonicalDBPath(dbPath)
	if err != nil {
		return err
	}
	dbPath = canonical
	if err := os.MkdirAll(Dir(dbPath), 0o700); err != nil {
		return fmt.Errorf("create run directory: %w", err)
	}
	return os.Chmod(Dir(dbPath), 0o700)
}

func LockCore(dbPath string) (*os.File, error) {
	canonical, err := CanonicalDBPath(dbPath)
	if err != nil {
		return nil, err
	}
	dbPath = canonical
	if err := EnsureDir(dbPath); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(LockPath(dbPath), os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open core lock: %w", err)
	}
	if err := f.Chmod(0o600); err != nil {
		_ = f.Close()
		return nil, fmt.Errorf("protect core lock: %w", err)
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		_ = f.Close()
		if errors.Is(err, syscall.EWOULDBLOCK) {
			return nil, LockedError{}
		}
		return nil, fmt.Errorf("lock core: %w", err)
	}
	return f, nil
}

// WriteFile replaces a private file atomically and syncs it before publication.
func WriteFile(path string, body []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("create file directory: %w", err)
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".core-*")
	if err != nil {
		return fmt.Errorf("create private file: %w", err)
	}
	defer os.Remove(f.Name())
	defer f.Close()
	if err := f.Chmod(0o600); err != nil {
		return fmt.Errorf("protect private file: %w", err)
	}
	if _, err := f.Write(body); err != nil {
		return fmt.Errorf("write private file: %w", err)
	}
	if err := f.Sync(); err != nil {
		return fmt.Errorf("sync private file: %w", err)
	}
	if err := f.Close(); err != nil {
		return fmt.Errorf("close private file: %w", err)
	}
	if err := os.Rename(f.Name(), path); err != nil {
		return fmt.Errorf("publish private file: %w", err)
	}
	return nil
}

func WriteJSON(path string, value any) error {
	body, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("encode run state: %w", err)
	}
	return WriteFile(path, append(body, '\n'))
}

func PIDAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	err := syscall.Kill(pid, 0)
	return err == nil || errors.Is(err, syscall.EPERM)
}

// ReadCore never removes stale state: readers must not race a new owner's publication.
func ReadCore(dbPath string) (Core, bool) {
	body, err := os.ReadFile(CorePath(dbPath))
	var state Core
	if err != nil || json.Unmarshal(body, &state) != nil || !PIDAlive(state.PID) || state.Token == "" || state.Endpoint == "" {
		return Core{}, false
	}
	requested, err := CanonicalDBPath(dbPath)
	if err != nil {
		return Core{}, false
	}
	published, err := CanonicalDBPath(state.DBPath)
	if err != nil || requested != published {
		return Core{}, false
	}
	return state, true
}

// RemoveCore must run while the caller still holds the core lock.
func RemoveCore(dbPath string, pid int) error {
	body, err := os.ReadFile(CorePath(dbPath))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read owned run state: %w", err)
	}
	var state Core
	if err := json.Unmarshal(body, &state); err != nil {
		return fmt.Errorf("decode owned run state: %w", err)
	}
	if state.PID != pid {
		return nil
	}
	if err := os.Remove(CorePath(dbPath)); err != nil {
		return fmt.Errorf("remove owned run state: %w", err)
	}
	return nil
}
