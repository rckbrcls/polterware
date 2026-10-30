package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/term"
)

// delegationCommands are the delegation commands exposed at the top level; the
// value is the name the dispatch engine knows them by.
var delegationCommands = map[string]string{
	"run":       "run",
	"runs":      "ls",
	"wait":      "wait",
	"result":    "result",
	"cancel":    "cancel",
	"route":     "route",
	"classify":  "classify",
	"merge":     "merge",
	"clean":     "clean",
	"recover":   "recover",
	"subagents": "subagents",
	"tiers":     "tiers",
	"usage":     "stats",
	"agents":    "agents",
	"doctor":    "doctor",
	"config":    "config",
	"skill":     "skill",
	"update":    "update",
}

func main() {
	dbPath := flag.String("db", defaultDB(), "sqlite path")
	flag.Usage = usage
	flag.Parse()
	if abs, err := filepath.Abs(*dbPath); err == nil {
		*dbPath = abs
	}

	args := flag.Args()
	if len(args) == 0 {
		if !term.IsTerminal(int(os.Stdin.Fd())) || !term.IsTerminal(int(os.Stdout.Fd())) {
			usage()
			os.Exit(2)
		}
		if err := runTUI(*dbPath); err != nil {
			fail(err)
		}
		return
	}
	command := args[0]
	rest := args[1:]

	// Only `serve` opens the store (Decision 0007); every other command is a client
	// of the core and starts it when none is running.
	var err error
	switch command {
	case "serve":
		err = runServe(*dbPath, rest)
	case "mcp":
		err = runMCP(*dbPath)
	case "init":
		err = runInit(*dbPath, rest)
	case "repo":
		err = runRepo(*dbPath, rest)
	case "brief":
		err = runBrief(*dbPath, rest)
	case "search", "context":
		err = runSearch(*dbPath, rest)
	case "structure":
		err = runStructure(*dbPath, rest)
	case "canvas":
		err = runCanvas(*dbPath, rest)
	case "export":
		err = runExport(*dbPath, rest)
	case "apply":
		err = runApply(*dbPath, rest)
	case "lint":
		err = runLint(*dbPath, rest)
	case "format":
		err = runFormat(rest)
	case "query":
		err = runQuery(*dbPath, rest)
	case "status":
		err = runStatus(*dbPath, rest)
	case "handoff":
		err = runHandoff(*dbPath, rest)
	case "task":
		err = runTask(*dbPath, rest)
	case "decision":
		err = runDecision(*dbPath, rest)
	case "feature":
		err = runFeature(*dbPath, rest)
	case "verify":
		err = runVerify(*dbPath, rest)
	case "inbox":
		err = runInbox(*dbPath, rest)
	case "conflict":
		err = runConflict(*dbPath, rest)
	case "scope":
		err = runScope(*dbPath, rest)
	case "setup":
		err = runSetup(*dbPath, rest)
	case "hooks":
		err = runHooks(*dbPath, rest)
	case "hook":
		err = runHook(*dbPath, rest)
	case "dispatch":
		// Legacy prefix: the commands below are the same ones without it, and the
		// registered SessionStart hook still calls `dispatch hook`.
		err = runDispatch(*dbPath, rest)
	case "help", "-h", "--help":
		usage()
	default:
		if sub, ok := delegationCommands[command]; ok {
			err = runDispatch(*dbPath, append([]string{sub}, rest...))
			break
		}
		fmt.Fprintf(os.Stderr, "unknown command %q\n", command)
		usage()
		os.Exit(2)
	}
	if err != nil {
		fail(err)
	}
}
