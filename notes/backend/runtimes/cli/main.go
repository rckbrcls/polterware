package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
)

const version = "0.0.0-dev"

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM, syscall.SIGHUP)
	defer stop()
	os.Exit(run(ctx, os.Args[1:], os.Stdout, os.Stderr))
}

func run(ctx context.Context, args []string, out, stderr io.Writer) int {
	fs := flag.NewFlagSet("pwnotes", flag.ContinueOnError)
	fs.SetOutput(stderr)
	defaultPath, err := defaultDB()
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	db := fs.String("db", defaultPath, "SQLite database path")
	fs.Usage = func() {
		fmt.Fprintln(stderr, "Usage: pwnotes [-db path] <command> [options]")
		fmt.Fprintln(stderr, "Commands: serve mcp status doctor add list show done rm space tag search today agenda review export backup completion")
		fmt.Fprintln(stderr, "mcp config <claude|cursor|claude-desktop> prints client snippets")
		fs.PrintDefaults()
	}
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 2
	}
	args = fs.Args()
	if len(args) == 0 {
		fmt.Fprintf(out, "pwnotes %s\n", version)
		return 0
	}
	path, err := filepath.Abs(*db)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	switch args[0] {
	case "serve":
		err = runServe(ctx, path, args[1:], stderr)
	case "mcp":
		if len(args) > 1 && args[1] == "config" {
			err = runMCPConfig(ctx, path, args[2:], out, stderr)
		} else {
			err = runMCP(ctx, path, args[1:], os.Stdin, out, stderr)
		}
	case "status":
		err = runStatus(ctx, path, args[1:], out, stderr)
	case "doctor":
		err = runDoctor(ctx, path, args[1:], out, stderr)
	case "add":
		err = runAdd(ctx, path, args[1:], out, stderr)
	case "list":
		err = runList(ctx, path, args[1:], out, stderr)
	case "show":
		err = runShow(ctx, path, args[1:], out, stderr)
	case "done":
		err = runDone(ctx, path, args[1:], out, stderr)
	case "rm":
		err = runRm(ctx, path, args[1:], out, stderr)
	case "space":
		err = runSpace(ctx, path, args[1:], out, stderr)
	case "tag":
		err = runTag(ctx, path, args[1:], out, stderr)
	case "search":
		err = runSearch(ctx, path, args[1:], out, stderr)
	case "today":
		err = runToday(ctx, path, args[1:], out, stderr)
	case "agenda":
		err = runAgenda(ctx, path, args[1:], out, stderr)
	case "review":
		err = runReview(ctx, path, args[1:], out, stderr)
	case "export":
		err = runExport(ctx, path, args[1:], out, stderr)
	case "backup":
		err = runBackup(ctx, path, args[1:], out, stderr)
	case "completion":
		err = runCompletion(args[1:], out, stderr)
	default:
		fmt.Fprintf(stderr, "pwnotes %s: unknown command %q\n", version, args[0])
		return ExitUsage
	}
	if err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return ExitOK
		}
		code := exitCodeOf(err)
		if msg := err.Error(); msg != "" {
			fmt.Fprintf(stderr, "pwnotes: %s\n", msg)
		}
		return code
	}
	return ExitOK
}
func defaultDB() (string, error) {
	if data := os.Getenv("PWNOTES_DATA_DIR"); data != "" {
		return filepath.Join(data, "notes.db"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("find data directory: %w", err)
	}
	return filepath.Join(home, "Library", "Application Support", "Polterware Notes", "notes.db"), nil
}
