package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	localcore "github.com/polterware/polterware/backend/compositions/local-core"
	"github.com/polterware/polterware/backend/platform/coreclient"
	"github.com/polterware/polterware/backend/platform/runstate"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// defaultIdle is how long the core waits without requests or open change
// streams before it exits. Zero keeps the core running until it is stopped
// (Decision 0007); --idle or POLTERWARE_CORE_IDLE opt in to idle exit.
const defaultIdle time.Duration = 0

// runServe runs the core: the only process that opens the store. The Desktop,
// CLI, TUI, and MCP bridge attach to it through core.json.
func runServe(dbPath string, args []string) error {
	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	listenAddress := fs.String("listen", "127.0.0.1:0", "loopback listen address")
	sessionToken := fs.String("token", os.Getenv("POLTERWARE_SESSION_TOKEN"), "session bearer token (default: minted)")
	idle := fs.Duration("idle", idleFromEnv(), "exit after this long without clients (0, the default, keeps running)")
	if err := fs.Parse(args); err != nil {
		return err
	}

	lock, err := runstate.LockCore(dbPath)
	if errors.Is(err, runstate.ErrCoreLocked) {
		if existing, ok := runstate.ReadCore(dbPath); ok {
			fmt.Fprintf(os.Stderr, "polterware core already running for this database (pid %d, %s)\n", existing.PID, existing.Endpoint)
		} else {
			fmt.Fprintln(os.Stderr, "polterware core already running for this database")
		}
		os.Exit(3)
	}
	if err != nil {
		return fmt.Errorf("core lock: %w", err)
	}
	defer lock.Close()

	store, err := storepkg.New(dbPath)
	if err != nil {
		return fmt.Errorf("db open: %w", err)
	}
	defer store.Close()

	token := *sessionToken
	if token == "" {
		if token, err = localcore.MintToken(); err != nil {
			return fmt.Errorf("token: %w", err)
		}
	}
	ln, endpoint, err := localcore.Listen(*listenAddress)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	fmt.Fprintf(os.Stderr, "polterware core listening on %s with session-token authentication\n", endpoint)

	core := localcore.NewCore(store, token)
	core.DBDir = filepath.Dir(dbPath)
	if exe, err := coreclient.Executable(); err == nil {
		core.Build = coreclient.BuildID(exe)
	}
	hs := localcore.ServeConnect(ln, core)
	go core.RunAgentsSync(core.Done(), agentsSyncDelay, os.Stderr)

	if err := runstate.WriteJSON(runstate.CorePath(dbPath), runstate.Core{
		PID:       os.Getpid(),
		Endpoint:  endpoint,
		Token:     token,
		DBPath:    dbPath,
		Build:     core.Build,
		StartedAt: time.Now().UTC(),
	}); err != nil {
		fmt.Fprintf(os.Stderr, "run state: %v\n", err)
	}
	defer runstate.RemoveCore(dbPath, os.Getpid())

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM, syscall.SIGHUP)
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
wait:
	for {
		select {
		case <-sig:
			break wait
		case <-core.Done():
			break wait
		case <-ticker.C:
			if *idle > 0 && core.Idle(*idle) {
				fmt.Fprintf(os.Stderr, "polterware core idle for %s; exiting\n", *idle)
				break wait
			}
		}
	}
	core.Stop()
	core.MCP.CloseAll()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = hs.Shutdown(ctx)
	return nil
}

// agentsSyncDelay lets a burst of writes land before AGENTS.md is rewritten.
const agentsSyncDelay = 2 * time.Second

func idleFromEnv() time.Duration {
	if value := os.Getenv("POLTERWARE_CORE_IDLE"); value != "" {
		if d, err := time.ParseDuration(value); err == nil {
			return d
		}
	}
	return defaultIdle
}
