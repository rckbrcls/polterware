package core

import (
	"context"
	"fmt"
	"net"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/settings"
	"github.com/polterware/polterware/notes/backend/platform/coreclient"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
	"github.com/polterware/polterware/notes/backend/platform/listen"
	"github.com/polterware/polterware/notes/backend/platform/runstate"
)

func TestAgentInfoNeverAdvertisesAnOccupiedMCPPort(t *testing.T) {
	occupied, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer occupied.Close()
	port := occupied.Addr().(*net.TCPAddr).Port
	db := filepath.Join(t.TempDir(), "notes.db")
	rt, err := OpenRuntime(t.Context(), db)
	if err != nil {
		t.Fatal(err)
	}
	defer rt.Close()
	if _, err := rt.Services.Settings.Set(t.Context(), actor.UI(), []string{"agents.mcpPort"}, settings.Settings{AgentsMCPPort: port}); err != nil {
		t.Fatal(err)
	}
	mcp := rt.MCP
	mcp.Port = port
	ln, endpoint, err := listen.Open("127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	server, err := Start(ln, Config{Token: "security-session", DBPath: db, Services: rt.Services, MCP: mcp})
	if err != nil {
		ln.Close()
		t.Fatal(err)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		server.Shutdown(ctx)
	}()
	clients, err := coreclient.New(runstate.Core{Endpoint: endpoint, Token: "security-session"}, "cli")
	if err != nil {
		t.Fatal(err)
	}
	health, err := clients.Health.Check(t.Context(), connect.NewRequest(&v1.CheckRequest{}))
	if err != nil {
		t.Fatal(err)
	}
	info, err := clients.AgentAccess.GetInfo(t.Context(), connect.NewRequest(&v1.GetAgentInfoRequest{}))
	if err != nil {
		t.Fatal(err)
	}
	if info.Msg.McpPort == int32(port) || info.Msg.McpPort != health.Msg.Mcp.Port {
		t.Fatalf("advertised an unrelated listener: preferred=%d advertised=%d actual=%d", port, info.Msg.McpPort, health.Msg.Mcp.Port)
	}
	actual := fmt.Sprintf("http://127.0.0.1:%d/mcp", health.Msg.Mcp.Port)
	for _, snippet := range []string{info.Msg.ClaudeHttp, info.Msg.CursorHttpJson} {
		if !strings.Contains(snippet, actual) {
			t.Fatalf("snippet does not target actual listener")
		}
	}
}
