package runstate

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestLockAndPrivateFiles(t *testing.T) {
	db := filepath.Join(t.TempDir(), "notes.db")
	lock, err := LockCore(db)
	if err != nil {
		t.Fatal(err)
	}
	_, err = LockCore(db)
	var locked LockedError
	if !errors.As(err, &locked) {
		t.Fatalf("second lock: %v", err)
	}
	state := Core{PID: os.Getpid(), DBPath: db, Endpoint: "http://127.0.0.1:1234", Token: "secret", Build: "1-1"}
	if err := WriteJSON(CorePath(db), state); err != nil {
		t.Fatal(err)
	}
	if got, ok := ReadCore(db); !ok || got != state {
		t.Fatalf("read state: %+v %v", got, ok)
	}
	for _, path := range []string{CorePath(db), LockPath(db)} {
		info, err := os.Stat(path)
		if err != nil || info.Mode().Perm() != 0o600 {
			t.Fatalf("private %s: %v %v", path, info, err)
		}
	}
	if err := RemoveCore(db, os.Getpid()+1); err != nil {
		t.Fatal(err)
	}
	if _, ok := ReadCore(db); !ok {
		t.Fatal("different owner removed state")
	}
	if err := RemoveCore(db, os.Getpid()); err != nil {
		t.Fatal(err)
	}
	if err := lock.Close(); err != nil {
		t.Fatal(err)
	}
	lock, err = LockCore(db)
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Close()
}

func TestConcurrentPublicationAndReaders(t *testing.T) {
	db := filepath.Join(t.TempDir(), "notes.db")
	state := Core{PID: os.Getpid(), DBPath: db, Endpoint: "http://127.0.0.1:1234", Token: "secret"}
	if err := WriteJSON(CorePath(db), state); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 40; j++ {
				if err := WriteJSON(CorePath(db), state); err != nil {
					t.Error(err)
				}
				if got, ok := ReadCore(db); !ok || got.PID != state.PID {
					t.Errorf("torn publication: %+v %t", got, ok)
				}
			}
		}()
	}
	wg.Wait()
	// Malformed/stale readers must not delete a concurrently published state.
	if err := os.WriteFile(CorePath(db), []byte("{"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, ok := ReadCore(db); ok {
		t.Fatal("malformed state accepted")
	}
	if _, err := os.Stat(CorePath(db)); err != nil {
		t.Fatal("read removed state", err)
	}
}
func TestLogRotationAndConcurrentClose(t *testing.T) {
	db := filepath.Join(t.TempDir(), "notes.db")
	w, err := OpenLog(db)
	if err != nil {
		t.Fatal(err)
	}
	w.limit = 64
	for i := 0; i < 10; i++ {
		if _, err := fmt.Fprintln(w, "a log entry that occupies enough bytes to rotate"); err != nil {
			t.Fatal(err)
		}
	}
	for _, suffix := range []string{"", ".1", ".2", ".3"} {
		info, err := os.Stat(LogPath(db) + suffix)
		if err != nil || info.Mode().Perm() != 0o600 {
			t.Fatalf("log archive %s: %v", suffix, err)
		}
	}
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := w.Write([]byte("entry\n"))
			if err != nil && !errors.Is(err, os.ErrClosed) {
				t.Error(err)
			}
		}()
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	wg.Wait()
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestSymlinkDatabaseSharesLockAndDiscovery(t *testing.T) {
	for _, missing := range []bool{false, true} {
		t.Run(map[bool]string{false: "existing", true: "not-created"}[missing], func(t *testing.T) {
			dir := t.TempDir()
			canonicalDir, err := filepath.EvalSymlinks(dir)
			if err != nil {
				t.Fatal(err)
			}
			db := filepath.Join(canonicalDir, "data", "notes.db")
			if !missing {
				if err := os.MkdirAll(filepath.Dir(db), 0o700); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(db, nil, 0o600); err != nil {
					t.Fatal(err)
				}
			}
			aliasDir := filepath.Join(canonicalDir, "alias")
			if err := os.MkdirAll(aliasDir, 0o700); err != nil {
				t.Fatal(err)
			}
			alias := filepath.Join(aliasDir, "linked.db")
			// Relative, potentially dangling link in a different directory.
			if err := os.Symlink(filepath.Join("..", "data", "notes.db"), alias); err != nil {
				t.Fatal(err)
			}
			got, err := CanonicalDBPath(alias)
			if err != nil || got != db {
				t.Fatalf("canonical=%q want=%q err=%v", got, db, err)
			}
			lock, err := LockCore(alias)
			if err != nil {
				t.Fatal(err)
			}
			defer lock.Close()
			other, err := LockCore(db)
			if other != nil {
				other.Close()
			}
			var locked LockedError
			if !errors.As(err, &locked) {
				t.Fatalf("alias bypassed core lock: %v", err)
			}
			if err := os.WriteFile(db, nil, 0o600); err != nil {
				t.Fatal(err)
			}
			state := Core{PID: os.Getpid(), DBPath: alias, Endpoint: "http://127.0.0.1:1234", Token: "secret"}
			if err := WriteJSON(CorePath(alias), state); err != nil {
				t.Fatal(err)
			}
			for _, path := range []string{alias, db} {
				if got, ok := ReadCore(path); !ok || got != state {
					t.Fatalf("discovery via %s: %+v %v", path, got, ok)
				}
				if TokenPath(path) != TokenPath(db) || LockPath(path) != LockPath(db) || LogPath(path) != LogPath(db) {
					t.Fatal("run files have different identities")
				}
			}
			if err := RemoveCore(db, os.Getpid()); err != nil {
				t.Fatal(err)
			}
			if _, ok := ReadCore(alias); ok {
				t.Fatal("alias retained removed discovery")
			}
		})
	}
}

func TestCanonicalDatabaseWithMissingParentsAndDirectoryAlias(t *testing.T) {
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	alias := filepath.Join(dir, "alias")
	if err := os.Symlink("data", alias); err != nil {
		t.Fatal(err)
	}
	db := filepath.Join(alias, "nested", "notes.db")
	want := filepath.Join(dir, "data", "nested", "notes.db")
	got, err := CanonicalDBPath(db)
	if err != nil || got != want {
		t.Fatalf("canonical=%q want=%q err=%v", got, want, err)
	}
	lock, err := LockCore(db)
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Close()
	other, err := LockCore(want)
	if other != nil {
		other.Close()
	}
	var locked LockedError
	if !errors.As(err, &locked) {
		t.Fatalf("missing parents bypassed lock: %v", err)
	}
}

func TestCoreLockRejectsSymlinkLoop(t *testing.T) {
	alias := filepath.Join(t.TempDir(), "loop.db")
	if err := os.Symlink("loop.db", alias); err != nil {
		t.Fatal(err)
	}
	lock, err := LockCore(alias)
	if lock != nil {
		lock.Close()
	}
	if err == nil {
		t.Fatal("invalid database identity accepted")
	}
}
