package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"connectrpc.com/connect"

	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

// Agent session environment, exported by `hook session-start` into Claude
// Code's CLAUDE_ENV_FILE so every `polterware apply` in the session joins one
// AgentRun per project.
const (
	envSession    = "POLTERWARE_SESSION"
	envAgentLabel = "POLTERWARE_AGENT_LABEL"
)

// hookInput is the subset of the Claude Code hook payload (stdin JSON) we read.
type hookInput struct {
	SessionID string `json:"session_id"`
	Cwd       string `json:"cwd"`
	ToolInput struct {
		FilePath string `json:"file_path"`
	} `json:"tool_input"`
}

func runHook(dbPath string, args []string) error {
	if len(args) == 0 {
		return errors.New("usage: polterware hook session-start [--label name] | session-end | lint | status | stop")
	}
	if args[0] == "dispatch" {
		return runDispatchHook(dbPath)
	}
	if !hookEnabled(dbPath, args[0]) {
		return nil
	}
	input, inputErr := readHookInput(os.Stdin)
	switch args[0] {
	case "status":
		if inputErr != nil {
			return nil
		}
		hookStatus(dbPath, input)
		return nil
	case "stop":
		if inputErr != nil {
			input = hookInput{}
		}
		hookStop(dbPath, input)
		return nil
	}
	if inputErr != nil {
		return inputErr
	}
	switch args[0] {
	case "session-start":
		flags := flag.NewFlagSet("hook session-start", flag.ContinueOnError)
		flags.SetOutput(os.Stderr)
		label := flags.String("label", "claude-code", "AgentRun label for the session")
		if err := flags.Parse(args[1:]); err != nil {
			return err
		}
		return hookSessionStart(input, *label)
	case "session-end":
		return hookSessionEnd(dbPath, input.SessionID)
	case "lint":
		return hookLint(dbPath, input)
	default:
		return fmt.Errorf("unknown hook %q: use session-start, session-end, lint, status, or stop", args[0])
	}
}

func readHookInput(r io.Reader) (hookInput, error) {
	var input hookInput
	body, err := io.ReadAll(r)
	if err != nil || len(strings.TrimSpace(string(body))) == 0 {
		return input, err
	}
	if err := json.Unmarshal(body, &input); err != nil {
		return input, fmt.Errorf("hook input is not JSON: %w", err)
	}
	return input, nil
}

// hookSessionStart exports the session id for later Bash commands. The run
// itself opens lazily on the first write, so read-only sessions leave no run.
func hookSessionStart(input hookInput, label string) error {
	envFile := os.Getenv("CLAUDE_ENV_FILE")
	if envFile == "" || input.SessionID == "" {
		return nil
	}
	file, err := os.OpenFile(envFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = fmt.Fprintf(file, "export %s=%s\nexport %s=%s\n",
		envSession, shellQuote(input.SessionID), envAgentLabel, shellQuote(label))
	return err
}

// hookSessionEnd completes the session's open runs in the core.
func hookSessionEnd(dbPath, sessionID string) error {
	if sessionID == "" {
		return nil
	}
	c, err := dial(dbPath)
	if err != nil {
		return err
	}
	_, err = c.Work.EndSession(context.Background(), connect.NewRequest(&localv1.EndSessionRequest{SessionId: sessionID}))
	return err
}

// hookLint lints a written *.pw.md file. Exit code 2 sends the diagnostics
// (errors and similarity hints) back to the agent (Claude Code PostToolUse
// contract).
func hookLint(dbPath string, input hookInput) error {
	file := input.ToolInput.FilePath
	if !strings.HasSuffix(file, ".pw.md") {
		return nil
	}
	body, err := os.ReadFile(file)
	if err != nil {
		return nil
	}
	dir := input.Cwd
	if dir == "" {
		dir = filepath.Dir(file)
	}
	c, err := dial(dbPath)
	if err != nil {
		return err
	}
	project := ""
	if resolved, err := resolveProjectIn(c, "", dir); err == nil {
		project = resolved.Id
	}
	res, err := c.Work.LintPolter(context.Background(), connect.NewRequest(&localv1.LintPolterRequest{ProjectId: project, Text: string(body)}))
	if err != nil {
		return err
	}
	diags := diagnosticsFrom(res.Msg.Diagnostics)
	if len(diags) == 0 {
		return nil
	}
	writeDiagnostics(os.Stderr, file, diags)
	return exitError{code: 2}
}

// hookStatus prints the project status as Claude Code session context.
// A missing core or project leaves the session alone.
func hookStatus(dbPath string, input hookInput) {
	text, err := hookQueryStatus(dbPath, input.Cwd)
	if err != nil || strings.TrimSpace(text) == "" {
		return
	}
	_ = writeHookContext("SessionStart", text)
}

// hookStop reminds the agent to write a handoff. It never blocks the session.
func hookStop(dbPath string, input hookInput) {
	slug := ""
	if text, err := hookQueryStatus(dbPath, input.Cwd); err == nil {
		slug = statusCardSlug(text)
	}
	reminder := `Write a handoff before ending: polterware handoff --note "Goal: … Done: … In progress: … Next: … Touched: …"`
	if slug != "" {
		reminder = fmt.Sprintf("Write a handoff before ending: polterware handoff --card %s --note \"Goal: … Done: … In progress: … Next: … Touched: …\"", slug)
	}
	_ = writeHookContext("Stop", reminder)
}

func hookQueryStatus(dbPath, dir string) (string, error) {
	c, err := dial(dbPath)
	if err != nil {
		return "", err
	}
	if dir == "" {
		dir, err = os.Getwd()
		if err != nil {
			return "", err
		}
	}
	project, err := resolveProjectIn(c, "", dir)
	if err != nil {
		return "", err
	}
	res, err := c.Work.QueryPolter(context.Background(), connect.NewRequest(&localv1.QueryPolterRequest{ProjectId: project.Id, Query: "status"}))
	if err != nil {
		return "", err
	}
	return res.Msg.Text, nil
}

func statusCardSlug(text string) string {
	line, _, _ := strings.Cut(text, "\n")
	fields := strings.Fields(line)
	if len(fields) == 0 || fields[0] == "branch" || fields[0] == "no" {
		return ""
	}
	return fields[0]
}

func writeHookContext(event, text string) error {
	payload := map[string]any{
		"hookSpecificOutput": map[string]any{
			"hookEventName":     event,
			"additionalContext": text,
		},
	}
	return json.NewEncoder(os.Stdout).Encode(payload)
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", `'\''`) + "'"
}
