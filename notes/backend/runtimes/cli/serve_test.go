package main

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/polterware/polterware/notes/backend/platform/runstate"
)

func waitCore(t *testing.T, db string) runstate.Core {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if state, ok := runstate.ReadCore(db); ok {
			return state
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("core.json was not published")
	return runstate.Core{}
}

func TestServeWritesCoreJSONAndSecondInstanceLocks(t *testing.T) {
	db := filepath.Join(t.TempDir(), "data", "notes.db")
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	errc := make(chan error, 1)
	go func() { errc <- runServe(ctx, db, nil, ioDiscard()) }()
	state := waitCore(t, db)
	if state.Endpoint == "" || state.Token == "" || state.PID != os.Getpid() && !runstate.PIDAlive(state.PID) {
		t.Fatalf("core.json: %+v", state)
	}
	info, err := os.Stat(runstate.CorePath(db))
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("core.json mode: %v %v", info, err)
	}
	var stderr bytes.Buffer
	err = runServe(t.Context(), db, nil, &stderr)
	var locked runstate.LockedError
	if !errors.As(err, &locked) {
		t.Fatalf("second serve: %v", err)
	}
	if !bytes.Contains(stderr.Bytes(), []byte("already running")) {
		t.Fatalf("lock message: %s", stderr.Bytes())
	}
	if code := run(t.Context(), []string{"-db", db, "serve"}, ioDiscard(), ioDiscard()); code != 3 {
		t.Fatalf("second instance exit %d", code)
	}
	cancel()
	select {
	case err := <-errc:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("serve did not stop")
	}
}

func TestDistNotesSecondInstanceExits3(t *testing.T) {
	root := findRepoRoot(t)
	exe := filepath.Join(root, "dist", "pwnotes")
	if _, err := os.Stat(exe); err != nil {
		t.Skip("dist/pwnotes is built by pnpm build:notes-core")
	}
	db := filepath.Join(t.TempDir(), "notes.db")
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	first := exec.CommandContext(ctx, exe, "-db", db, "serve")
	first.Stderr = ioDiscard()
	if err := first.Start(); err != nil {
		t.Fatal(err)
	}
	waitCore(t, db)
	second := exec.Command(exe, "-db", db, "serve")
	out, err := second.CombinedOutput()
	if err == nil {
		t.Fatalf("second instance succeeded: %s", out)
	}
	exit, ok := err.(*exec.ExitError)
	if !ok || exit.ExitCode() != 3 {
		t.Fatalf("exit=%v out=%s", err, out)
	}
	if !bytes.Contains(out, []byte("already running")) {
		t.Fatalf("message: %s", out)
	}
}

func findRepoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("repository root not found")
		}
		dir = parent
	}
}

type discard struct{}

func ioDiscard() *discard { return &discard{} }

func (*discard) Write(p []byte) (int, error) { return len(p), nil }
