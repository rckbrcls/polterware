package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"strings"

	"connectrpc.com/connect"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
)

// mcpSnippetInput matches packages/features/notes-settings/src/snippets.ts.
type mcpSnippetInput struct {
	Port    int
	Token   string
	Command string
}

// mcpSnippets is the Go twin of mcpSnippets() in snippets.ts.
type mcpSnippets struct {
	Command            string `json:"command"`
	Token              string `json:"token"`
	HTTPURL            string `json:"httpUrl"`
	ClaudeStdio        string `json:"claudeStdio"`
	ClaudeHTTP         string `json:"claudeHttp"`
	CursorStdioJSON    string `json:"cursorStdioJson"`
	CursorHTTPJSON     string `json:"cursorHttpJson"`
	CursorConfig       string `json:"cursorConfig"`
	ClaudeDesktopStdio string `json:"claudeDesktopStdio"`
	ClaudeDesktopHTTP  string `json:"claudeDesktopHttp"`
}

// shellArg single-quotes a command path that a shell would split, such as one inside "Polterware Notes.app".
func shellArg(value string) string {
	if !strings.ContainsAny(value, " \t\x27\"\\$`") {
		return value
	}
	return "'" + strings.ReplaceAll(value, "'", `'\''`) + "'"
}

func compactJSON(value any) string {
	raw, _ := json.Marshal(value)
	return string(raw)
}

func prettyJSON(value any) string {
	raw, _ := json.MarshalIndent(value, "", "  ")
	return string(raw)
}

type mcpStdioConfig struct {
	Command string   `json:"command"`
	Args    []string `json:"args"`
}

type mcpHTTPConfig struct {
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers"`
}

type mcpWrappedStdio struct {
	MCPServers map[string]mcpStdioConfig `json:"mcpServers"`
}

type mcpWrappedHTTP struct {
	MCPServers map[string]mcpHTTPConfig `json:"mcpServers"`
}

func buildMCPSnippets(in mcpSnippetInput) mcpSnippets {
	command := strings.TrimSpace(in.Command)
	if command == "" {
		command = "pwnotes"
	}
	token := strings.TrimSpace(in.Token)
	if token == "" {
		token = "<mcp-token>"
	}
	port := in.Port
	if port < 1 {
		port = 47600
	}
	httpURL := fmt.Sprintf("http://127.0.0.1:%d/mcp", port)
	stdio := mcpStdioConfig{Command: command, Args: []string{"mcp"}}
	httpCfg := mcpHTTPConfig{URL: httpURL, Headers: map[string]string{"Authorization": "Bearer " + token}}
	wrappedStdio := mcpWrappedStdio{MCPServers: map[string]mcpStdioConfig{"pwnotes": stdio}}
	wrappedHTTP := mcpWrappedHTTP{MCPServers: map[string]mcpHTTPConfig{"pwnotes": httpCfg}}
	return mcpSnippets{
		Command:            command,
		Token:              token,
		HTTPURL:            httpURL,
		ClaudeStdio:        fmt.Sprintf("claude mcp add pwnotes -- %s mcp", shellArg(command)),
		ClaudeHTTP:         fmt.Sprintf("claude mcp add --transport http pwnotes %s --header \"Authorization: Bearer %s\"", httpURL, token),
		CursorStdioJSON:    compactJSON(stdio),
		CursorHTTPJSON:     compactJSON(httpCfg),
		CursorConfig:       prettyJSON(wrappedStdio),
		ClaudeDesktopStdio: prettyJSON(wrappedStdio),
		ClaudeDesktopHTTP:  prettyJSON(wrappedHTTP),
	}
}

func runMCPConfig(ctx context.Context, dbPath string, args []string, out, stderr io.Writer) error {
	fs := flag.NewFlagSet("mcp config", flag.ContinueOnError)
	fs.SetOutput(stderr)
	jsonOutput := fs.Bool("json", false, "print JSON")
	pos, err := parseCommand(fs, args)
	if err != nil {
		return mapRPC(err)
	}
	if len(pos) != 1 {
		return usagef("usage: pwnotes mcp config <claude|cursor|claude-desktop> [--json]")
	}
	client := strings.ToLower(pos[0])
	switch client {
	case "claude", "claude-code", "cursor", "claude-desktop":
	default:
		return usagef("usage: pwnotes mcp config <claude|cursor|claude-desktop> [--json]")
	}
	clients, err := ensureClients(ctx, dbPath)
	if err != nil {
		return err
	}
	info, err := clients.AgentAccess.GetInfo(ctx, connect.NewRequest(&v1.GetAgentInfoRequest{}))
	if err != nil {
		return mapRPC(err)
	}
	snips := buildMCPSnippets(mcpSnippetInput{Port: int(info.Msg.McpPort), Token: info.Msg.Token, Command: "pwnotes"})
	if *jsonOutput {
		raw, err := json.Marshal(snips)
		if err != nil {
			return err
		}
		return writeJSONBytes(out, raw)
	}
	return printMCPConfig(out, client, snips)
}

func printMCPConfig(out io.Writer, client string, s mcpSnippets) error {
	switch client {
	case "claude", "claude-code":
		fmt.Fprintf(out, "# Claude Code (stdio)\n%s\n\n# Claude Code (HTTP)\n%s\n", s.ClaudeStdio, s.ClaudeHTTP)
	case "cursor":
		fmt.Fprintf(out, "# Cursor stdio JSON\n%s\n\n# Cursor HTTP JSON\n%s\n\n# Cursor mcp.json\n%s\n", s.CursorStdioJSON, s.CursorHTTPJSON, s.CursorConfig)
	case "claude-desktop":
		fmt.Fprintf(out, "# Claude Desktop stdio\n%s\n\n# Claude Desktop HTTP\n%s\n", s.ClaudeDesktopStdio, s.ClaudeDesktopHTTP)
	}
	return nil
}
