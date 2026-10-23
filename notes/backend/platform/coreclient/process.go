package coreclient

import (
	"connectrpc.com/connect"
	"context"
	"errors"
	"fmt"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
	"github.com/polterware/polterware/notes/backend/platform/runstate"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

func Executable() (string, error) {
	path := os.Getenv("PWNOTES_CORE_BIN")
	if path == "" {
		var err error
		path, err = os.Executable()
		if err != nil {
			return "", fmt.Errorf("resolve pwnotes executable: %w", err)
		}
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", fmt.Errorf("resolve core binary: %w", err)
	}
	return filepath.Abs(resolved)
}

// BuildID matches Electron's <mtime seconds>-<bytes> handshake.
func BuildID(exe string) string {
	info, err := os.Stat(exe)
	if err != nil {
		return ""
	}
	return fmt.Sprintf("%d-%d", info.ModTime().Unix(), info.Size())
}
func NewerBuild(a, b string) bool {
	ahead, _, _ := strings.Cut(a, "-")
	behind, _, _ := strings.Cut(b, "-")
	at, ae := strconv.ParseInt(ahead, 10, 64)
	bt, be := strconv.ParseInt(behind, 10, 64)
	return ae == nil && be == nil && at > bt
}

// Find reads discovery state and verifies the authenticated health handshake.
func Find(ctx context.Context, dbPath string) (runstate.Core, error) {
	path, err := filepath.Abs(dbPath)
	if err != nil {
		return runstate.Core{}, err
	}
	state, ok := runstate.ReadCore(path)
	if !ok {
		return runstate.Core{}, fmt.Errorf("core is not running for %s", path)
	}
	if err := Check(ctx, state); err != nil {
		return runstate.Core{}, err
	}
	return state, nil
}
func Check(ctx context.Context, state runstate.Core) error {
	clients, err := New(state, "cli")
	if err != nil {
		return err
	}
	probe, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	health, err := clients.Health.Check(probe, connect.NewRequest(&v1.CheckRequest{}))
	if err != nil {
		return fmt.Errorf("core health: %w", err)
	}
	if health.Msg.DbPath != state.DBPath || health.Msg.Build != state.Build {
		return fmt.Errorf("core discovery does not match the health handshake")
	}
	return nil
}
func Ensure(ctx context.Context, dbPath string) (runstate.Core, error) {
	if endpoint := os.Getenv("PWNOTES_CORE_ENDPOINT"); endpoint != "" {
		state := runstate.Core{Endpoint: endpoint, Token: os.Getenv("PWNOTES_CORE_TOKEN")}
		clients, err := New(state, "cli")
		if err != nil {
			return runstate.Core{}, err
		}
		health, err := clients.Health.Check(ctx, connect.NewRequest(&v1.CheckRequest{}))
		if err != nil {
			return runstate.Core{}, fmt.Errorf("override core health: %w", err)
		}
		state.DBPath, state.Build, state.StartedAt = health.Msg.DbPath, health.Msg.Build, health.Msg.StartedAt.AsTime()
		return state, nil
	}
	exe, err := Executable()
	if err != nil {
		return runstate.Core{}, err
	}
	path, err := filepath.Abs(dbPath)
	if err != nil {
		return runstate.Core{}, err
	}
	if state, ok := runstate.ReadCore(path); ok {
		if err := Check(ctx, state); err != nil {
			return runstate.Core{}, fmt.Errorf("existing core is not responding; see %s: %w", runstate.LogPath(path), err)
		}
		if !NewerBuild(BuildID(exe), state.Build) {
			return state, nil
		}
		if err := Stop(ctx, state); err != nil {
			return runstate.Core{}, fmt.Errorf("replace older core: %w", err)
		}
	}
	return Start(ctx, exe, path)
}
func Start(ctx context.Context, exe, dbPath string) (runstate.Core, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	path, err := filepath.Abs(dbPath)
	if err != nil {
		return runstate.Core{}, err
	}
	if state, err := Find(ctx, path); err == nil {
		return state, nil
	}
	if err := runstate.EnsureDir(path); err != nil {
		return runstate.Core{}, err
	}
	// The daemon rotates its own log under its exclusive core lock.
	cmd := exec.Command(exe, "-db", path, "serve", "--listen", "127.0.0.1:0")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := cmd.Start(); err != nil {
		return runstate.Core{}, fmt.Errorf("start core: %w", err)
	}
	exited := make(chan error, 1)
	go func() { exited <- cmd.Wait() }()
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()
	var exitErr error
	for {
		if state, err := Find(ctx, path); err == nil {
			return state, nil
		}
		select {
		case <-ctx.Done():
			_ = cmd.Process.Signal(syscall.SIGTERM)
			return runstate.Core{}, fmt.Errorf("wait for core; see %s: %w", runstate.LogPath(path), ctx.Err())
		case err := <-exited:
			exitErr = err
			exited = nil
			var processErr *exec.ExitError
			if !errors.As(exitErr, &processErr) || processErr.ExitCode() != 3 {
				return runstate.Core{}, fmt.Errorf("core exited before listening (%v); see %s", exitErr, runstate.LogPath(path))
			}
		case <-ticker.C:
		}
	}
}

// Stop only signals an authenticated core described by the matching private state.
func Stop(ctx context.Context, state runstate.Core) error {
	if state.PID <= 0 {
		return fmt.Errorf("cannot stop an endpoint override")
	}
	if err := Check(ctx, state); err != nil {
		return err
	}
	if err := syscall.Kill(state.PID, syscall.SIGTERM); err != nil && !errors.Is(err, syscall.ESRCH) {
		return fmt.Errorf("stop core: %w", err)
	}
	wait, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()
	for {
		current, ok := runstate.ReadCore(state.DBPath)
		if !ok || current.PID != state.PID {
			return nil
		}
		select {
		case <-wait.Done():
			return fmt.Errorf("wait for core shutdown: %w", wait.Err())
		case <-ticker.C:
		}
	}
}
