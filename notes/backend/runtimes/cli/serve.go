package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"github.com/polterware/polterware/notes/backend/compositions/core"
	"github.com/polterware/polterware/notes/backend/platform/coreclient"
	"github.com/polterware/polterware/notes/backend/platform/listen"
	"github.com/polterware/polterware/notes/backend/platform/runstate"
	"github.com/polterware/polterware/notes/backend/platform/token"
	"io"
	"log/slog"
	"os"
	"time"
)

func runServe(ctx context.Context, dbPath string, args []string, stderr io.Writer) error {
	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	fs.SetOutput(stderr)
	address := fs.String("listen", "127.0.0.1:0", "IPv4 loopback address")
	idle := fs.Duration("idle", 0, "exit after inactivity (0 keeps the core running)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 0 {
		return fmt.Errorf("unexpected serve arguments")
	}
	if *idle < 0 {
		return fmt.Errorf("idle must be nonnegative")
	}
	lock, err := runstate.LockCore(dbPath)
	var locked runstate.LockedError
	if errors.As(err, &locked) {
		if state, ok := runstate.ReadCore(dbPath); ok {
			fmt.Fprintf(stderr, "pwnotes core already running for this database (pid %d, %s)\n", state.PID, state.Endpoint)
		} else {
			fmt.Fprintln(stderr, "pwnotes core already running for this database")
		}
		return err
	}
	if err != nil {
		return err
	}
	defer lock.Close()
	log, err := runstate.OpenLog(dbPath)
	if err != nil {
		return err
	}
	defer log.Close()
	logger := slog.New(slog.NewJSONHandler(log, nil))
	stable, err := token.LoadOrMint(runstate.TokenPath(dbPath))
	if err != nil {
		return err
	}
	_ = stable // W1-MCP reads the stable token through its provider binding.
	session, err := token.Mint()
	if err != nil {
		return err
	}
	runtime, err := core.OpenRuntime(ctx, dbPath)
	if err != nil {
		return fmt.Errorf("open core providers: %w", err)
	}
	defer runtime.Close()
	ln, endpoint, err := listen.Open(*address)
	if err != nil {
		return err
	}
	defer ln.Close()
	exe, err := coreclient.Executable()
	if err != nil {
		return err
	}
	started := time.Now().UTC().Truncate(time.Millisecond)
	server, err := core.Start(ln, core.Config{Token: session, Build: coreclient.BuildID(exe), Version: version, DBPath: dbPath, StartedAt: started, Services: runtime.Services, MCP: runtime.MCP})
	if err != nil {
		return err
	}
	defer func() {
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdown); err != nil {
			logger.Error("core shutdown failed", "error", err)
		}
	}()
	if err := runstate.WriteJSON(runstate.CorePath(dbPath), runstate.Core{PID: os.Getpid(), Endpoint: endpoint, Token: session, DBPath: dbPath, Build: coreclient.BuildID(exe), StartedAt: started}); err != nil {
		return err
	}
	defer func() {
		if err := runstate.RemoveCore(dbPath, os.Getpid()); err != nil {
			logger.Error("remove core state failed", "error", err)
		}
	}()
	logger.Info("core listening", "endpoint", endpoint, "build", coreclient.BuildID(exe))
	fmt.Fprintf(stderr, "pwnotes core listening on %s with session-token authentication\n", endpoint)
	tick := time.NewTicker(100 * time.Millisecond)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			logger.Info("core stopping")
			return nil
		case err := <-server.Done():
			return err
		case <-tick.C:
			if *idle > 0 && server.Idle(*idle) {
				logger.Info("core idle; stopping")
				return nil
			}
		}
	}
}
