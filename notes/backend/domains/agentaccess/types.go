// Package agentaccess is the local MCP access document shown in Settings.
package agentaccess

// Info is AgentAccessService.GetInfo. Token is the stable loopback bearer.
type Info struct {
	MCPPort         int
	TokenPresent    bool
	Token           string
	Enabled         bool
	AllowFileAttach bool
	ClaudeStdio     string
	ClaudeHTTP      string
	CursorStdioJSON string
	CursorHTTPJSON  string
}
