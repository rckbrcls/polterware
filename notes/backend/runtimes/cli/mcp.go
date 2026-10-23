package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"strings"

	"connectrpc.com/connect"
	"github.com/polterware/polterware/notes/backend/platform/coreclient"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
	"github.com/polterware/polterware/notes/backend/platform/runstate"
	"github.com/polterware/polterware/notes/backend/providers/mcp"
)

func runMCP(ctx context.Context, dbPath string, args []string, in io.Reader, out, stderr io.Writer) error {
	if len(args) != 0 {
		return fmt.Errorf("unexpected mcp arguments")
	}
	state, err := coreclient.Ensure(ctx, dbPath)
	if err != nil {
		return err
	}
	token, err := os.ReadFile(runstate.TokenPath(state.DBPath))
	if err != nil {
		return fmt.Errorf("read MCP token: %w", err)
	}
	endpoint := state.Endpoint + "/mcp"
	clients, err := coreclient.New(state, "cli")
	if err == nil {
		health, herr := clients.Health.Check(ctx, connect.NewRequest(&v1.CheckRequest{}))
		if herr == nil && health.Msg.Mcp != nil {
			if !health.Msg.Mcp.Enabled {
				return fmt.Errorf("MCP is disabled. Enable it in Settings > Agents")
			}
			if health.Msg.Mcp.Port > 0 {
				endpoint = fmt.Sprintf("http://127.0.0.1:%d/mcp", health.Msg.Mcp.Port)
			}
		}
	}
	return mcp.Proxy(ctx, endpoint, strings.TrimSpace(string(token)), in, out)
}
