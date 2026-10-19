// e2edriver is a test-only SDK client. It never opens SQLite.
package main

import (
	"connectrpc.com/connect"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/polterware/polterware/notes/backend/platform/coreclient"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
	"github.com/polterware/polterware/notes/backend/platform/runstate"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type bearer struct {
	token string
	next  http.RoundTripper
}

func (b bearer) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	clone.Header.Set("Authorization", "Bearer "+b.token)
	return b.next.RoundTrip(clone)
}
func run(ctx context.Context) error {
	mode := flag.String("mode", "stdio", "stdio, http, or seed")
	db := flag.String("db", "", "isolated database path")
	binary := flag.String("binary", "", "core executable")
	title := flag.String("title", "Agent note", "synthetic note title")
	count := flag.Int("count", 10000, "seed size")
	flag.Parse()
	state, ok := runstate.ReadCore(*db)
	if !ok {
		return fmt.Errorf("isolated core state unavailable")
	}
	clients, err := coreclient.New(state, "e2e")
	if err != nil {
		return err
	}
	if *mode == "seed" {
		for i := 0; i < *count; i++ {
			_, err := clients.Note.Create(ctx, connect.NewRequest(&v1.CreateNoteRequest{Title: fmt.Sprintf("Performance note %05d", i), Content: fmt.Sprintf("Benchmark group %d", i%100)}))
			if err != nil {
				return fmt.Errorf("seed note %d: %w", i, err)
			}
		}
		return json.NewEncoder(os.Stdout).Encode(map[string]int{"seeded": *count})
	}
	var transport sdk.Transport
	switch *mode {
	case "stdio":
		cmd := exec.CommandContext(ctx, *binary, "-db", *db, "mcp")
		cmd.Stderr = os.Stderr
		transport = &sdk.CommandTransport{Command: cmd, TerminateDuration: time.Second}
	case "http":
		health, err := clients.Health.Check(ctx, connect.NewRequest(&v1.CheckRequest{}))
		if err != nil {
			return err
		}
		token, err := os.ReadFile(filepath.Join(filepath.Dir(*db), "run/mcp-token"))
		if err != nil {
			return err
		}
		transport = &sdk.StreamableClientTransport{Endpoint: fmt.Sprintf("http://127.0.0.1:%d/mcp", health.Msg.Mcp.Port), HTTPClient: &http.Client{Transport: bearer{strings.TrimSpace(string(token)), http.DefaultTransport}}, MaxRetries: -1}
	default:
		return fmt.Errorf("unknown mode %s", *mode)
	}
	client := sdk.NewClient(&sdk.Implementation{Name: "w3-e2e", Version: "1"}, nil)
	session, err := client.Connect(ctx, transport, nil)
	if err != nil {
		return fmt.Errorf("connect SDK: %w", err)
	}
	defer session.Close()
	result, err := session.CallTool(ctx, &sdk.CallToolParams{Name: "create_notes", Arguments: map[string]any{"items": []map[string]string{{"title": *title}}}})
	if err != nil {
		return fmt.Errorf("agent write: %w", err)
	}
	if result.IsError {
		return fmt.Errorf("agent write rejected: %v", result.Content)
	}
	return json.NewEncoder(os.Stdout).Encode(result)
}
func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	if err := run(ctx); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
