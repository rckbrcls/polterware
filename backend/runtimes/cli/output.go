package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

func writeJSON(v any) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

// writeProtoJSON prints a core response with snake_case field names.
func writeProtoJSON(message proto.Message) error {
	body, err := protojson.MarshalOptions{Multiline: true, Indent: "  ", UseProtoNames: true, EmitUnpopulated: true}.Marshal(message)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(os.Stdout, "%s\n", body)
	return err
}

// exitError ends the process with code after the command already printed its
// own output (for example lint diagnostics).
type exitError struct{ code int }

func (e exitError) Error() string { return fmt.Sprintf("exit status %d", e.code) }

func fail(err error) {
	var exit exitError
	if errors.As(err, &exit) {
		os.Exit(exit.code)
	}
	// Core errors carry a Connect code prefix; the message alone is the fix.
	var connectErr *connect.Error
	if errors.As(err, &connectErr) {
		fmt.Fprintf(os.Stderr, "polterware: %s\n", connectErr.Message())
		os.Exit(1)
	}
	fmt.Fprintf(os.Stderr, "polterware: %v\n", err)
	os.Exit(1)
}

func usage() {
	fmt.Fprintf(os.Stderr, `Usage:
  polterware [-db path]                (interactive status and MCP setup; requires a terminal)
  polterware [-db path] init [--name <name>] [--dir <clone> | --no-dir] [--id <id>] [--json]
  polterware [-db path] repo list --project <id> [--json]
  polterware [-db path] brief <card slug|Structure path|file> [--budget N] [--project <id>]   (read before working on it)
  polterware [-db path] search "<terms>" [--budget N] [--scope <node>[,<node>]] [--exact] [--project <id>]   (context is an alias)
  polterware [-db path] structure [--node <path>] [--at <point>] [--project <id>]
  polterware [-db path] structure history [--project <id>]
  polterware [-db path] canvas ls [--agents] [--scope <node>[,<node>]] [--exact] [--project <id>]
  polterware [-db path] canvas show <id|name> [--format mermaid|json|dot] [--project <id>]
  polterware [-db path] canvas share <id|name> on|off [--project <id>]
  polterware [-db path] export [--dry-run] [--sync on|off] [--json] [--project <id>]
  polterware [-db path] apply <file|-> [--dry-run] [--project <id>] [--summary ...] [--rationale ...] [--agent-run-id ...]
  polterware [-db path] lint <file|dir|-> [--project <id>]   (silent on success)
  polterware [-db path] format [structure|rules|decisions|facts|feature]   (the Polter format core, or one topic)
  polterware [-db path] query "cards" | "card <slug>" | "status" | "inbox" | "handoff <slug>" | "brief <target>" | "search <terms>" | "show <id>" | "commits <slug>" | "conflicts" | "conflict <slug>" | "structure [<path>] [at <point>]" | "structure history" | "decisions [state]" | "decision <decision>" | "feature <slug> [step]" | "verify <slug>" | "milestones" | "roadmap" | "canvas [<name|id>]" [--scope <node>[,<node>]] [--exact] [--project <id>]
  polterware [-db path] status [--scope <node>[,<node>]] [--exact] [--project <id>]
  polterware [-db path] handoff [--card <slug>] [--note "..."] [--project <id>]
  polterware [-db path] task claim|done|release <slug>#T2 [--agent name] [--commit <sha>] [--project <id>]
  polterware [-db path] decision list [state] | show <decision> | propose "<title>" | activate <decision> | challenge <decision> --reason "..." | supersede <decision> (--by <decision> | --title "...") | trigger <decision> "..." [--project <id>]
  polterware [-db path] feature new "<intent>" [--title "..."] [--under <node>] [--project <id>]
  polterware [-db path] feature shape <slug> | contract <slug> [--accept] | plan <slug> [--approve] [--project <id>]
  polterware [-db path] verify <slug|slug#T2> [--project <id>]   (exit 1 when a check fails)
  polterware [-db path] inbox [<id> decide "<answer>" | delegate | defer | ignore] [--agent name] [--scope <node>[,<node>]] [--exact] [--project <id>]
  polterware [-db path] conflict raise <slug> "<request>" --rule <slug> | --decision <ref> [--card <slug>] [--option "<text>"]... | decide <slug> "<answer>" | wait <slug> [--timeout 30m] | withdraw <slug> | list [--project <id>]
  polterware [-db path] scope <decision|fact|rule|item> <id> [<node path>...] [--project <id>]   (the nodes replace its contexts; none clears them)
  polterware [-db path] setup [doctor] | claude [--uninstall | --enable | --disable | --skill-only] | codex [--uninstall] [--project <id>]
  polterware [-db path] hooks [list] | enable|disable <status|stop|lint|context|session|all>
  polterware [-db path] hook session-start [--label name] | session-end | lint | context | status | stop   (Claude Code hooks; JSON on stdin)
  polterware [-db path] run [--tier <tier>] [--as <profile>] [--card <slug>] [--agent <name>] [--provider <p>] [--model <m>] [--effort <e>] [--priority <p>] [--relax] [--readonly] [--no-verify] [--timeout <dur>] [--dir <repo>] <prompt|->
  polterware [-db path] wait <id> [--timeout <dur>] | result <id> [--section ...] | cancel <id> | runs | merge <id> [--force] [--no-verify] | clean <id> [--force] | recover <id> | verify run <id> | verify --init
  polterware [-db path] route|classify [filters] | tiers [--check] | usage [--by ...] [--since ...] | agents | doctor | subagents [--init|--check] | config get|set|allow|deny [--project] | skill install|show|refresh | update
  polterware [-db path] hooks enable|disable dispatch   (SessionStart hint that points agents at the delegation skill)
  polterware [-db path] serve [--listen addr] [--token token]   (local core server for the Desktop)
  polterware [-db path] mcp                                     (MCP server over stdio for coding agents)
`)
}
