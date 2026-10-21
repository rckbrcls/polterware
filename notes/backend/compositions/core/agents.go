package core

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/agentaccess"
	"github.com/polterware/polterware/notes/backend/domains/settings"
	"github.com/polterware/polterware/notes/backend/platform/token"
)

type agentService struct {
	settings  settings.Service
	tokenPath string
	audit     activity.Audit
}

func (s agentService) GetInfo(ctx context.Context) (agentaccess.Info, error) {
	doc, err := s.settings.Get(ctx)
	if err != nil {
		return agentaccess.Info{}, err
	}
	raw, err := os.ReadFile(s.tokenPath)
	present := err == nil
	value := strings.TrimSpace(string(raw))
	if !present {
		value = ""
	}
	shown := value
	if shown == "" {
		shown = "<mcp-token>"
	}
	port := doc.AgentsMCPPort
	httpURL := fmt.Sprintf("http://127.0.0.1:%d/mcp", port)
	stdioJSON, _ := json.Marshal(map[string]any{"command": "pwnotes", "args": []string{"mcp"}})
	httpJSON, _ := json.Marshal(map[string]any{"url": httpURL, "headers": map[string]string{"Authorization": "Bearer " + shown}})
	return agentaccess.Info{
		MCPPort: port, TokenPresent: present, Token: value, Enabled: doc.AgentsMCPEnabled, AllowFileAttach: doc.AgentsAllowFileAttach,
		ClaudeStdio:     "claude mcp add pwnotes -- pwnotes mcp",
		ClaudeHTTP:      fmt.Sprintf("claude mcp add --transport http pwnotes %s --header %q", httpURL, "Authorization: Bearer "+shown),
		CursorStdioJSON: string(stdioJSON), CursorHTTPJSON: string(httpJSON),
	}, nil
}

func (s agentService) RotateToken(ctx context.Context, who actor.Actor) (string, error) {
	var value string
	err := s.audit.Write(ctx, who, "agent", "mcp-token", activity.OpUpdate, "Rotate MCP token", func(context.Context) error {
		next, err := token.Rotate(s.tokenPath)
		value = next
		return err
	})
	return value, err
}

func (s agentService) SetEnabled(ctx context.Context, who actor.Actor, enabled bool) error {
	_, err := s.settings.Set(ctx, who, []string{settings.KeyAgentsMCPEnabled}, settings.Settings{AgentsMCPEnabled: enabled})
	return err
}

func (s agentService) SetAllowFileAttach(ctx context.Context, who actor.Actor, allow bool) error {
	_, err := s.settings.Set(ctx, who, []string{settings.KeyAgentsAllowFileAttach}, settings.Settings{AgentsAllowFileAttach: allow})
	return err
}

// currentToken reads the atomically replaced token file used by the live guard.
func (s agentService) currentToken() (string, error) {
	raw, err := os.ReadFile(s.tokenPath)
	return strings.TrimSpace(string(raw)), err
}
