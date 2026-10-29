package mcp

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/agentaccess"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// Server is one MCP session. The core serves sessions over HTTP (see
// Sessions); Serve keeps a line-oriented loop for tests and embedding.
type Server struct {
	Store *storepkg.Store
	In    io.Reader
	Out   io.Writer
	Err   io.Writer

	ID            string
	ClientName    string
	ClientVersion string
	StartedAt     time.Time
	lastSeen      time.Time

	// session holds this MCP session's open agent run per project for polter.apply.
	session wedge.SessionRuns
}

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// Close completes the agent runs this session opened.
func (s *Server) Close() { s.session.Close(s.Store) }

func (s *Server) recordClient(params json.RawMessage) {
	var init struct {
		ClientInfo struct {
			Name    string `json:"name"`
			Version string `json:"version"`
		} `json:"clientInfo"`
	}
	if json.Unmarshal(params, &init) != nil || init.ClientInfo.Name == "" {
		return
	}
	s.ClientName = init.ClientInfo.Name
	s.ClientVersion = init.ClientInfo.Version
	s.session.Label = init.ClientInfo.Name
}

// Serve reads one JSON-RPC message per line from In and writes responses to Out.
func (s *Server) Serve() error {
	scanner := bufio.NewScanner(s.In)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		if body, ok := s.handle(line); ok {
			if _, err := fmt.Fprintf(s.Out, "%s\n", body); err != nil {
				return err
			}
		}
	}
	return scanner.Err()
}

// handle answers one JSON-RPC message; ok is false for notifications.
func (s *Server) handle(line []byte) (body []byte, ok bool) {
	var req rpcRequest
	if err := json.Unmarshal(line, &req); err != nil {
		return marshal(rpcResponse{JSONRPC: "2.0", Error: &rpcError{Code: -32700, Message: "parse error"}}), true
	}
	if req.Method == "notifications/initialized" || req.Method == "notifications/cancelled" {
		return nil, false
	}
	result, err := s.dispatch(req)
	if req.ID == nil {
		return nil, false
	}
	if err != nil {
		return marshal(rpcResponse{JSONRPC: "2.0", ID: req.ID, Error: &rpcError{Code: -32000, Message: err.Error()}}), true
	}
	return marshal(rpcResponse{JSONRPC: "2.0", ID: req.ID, Result: result}), true
}

func marshal(resp rpcResponse) []byte {
	body, err := json.Marshal(resp)
	if err != nil {
		body, _ = json.Marshal(rpcResponse{JSONRPC: "2.0", ID: resp.ID, Error: &rpcError{Code: -32603, Message: err.Error()}})
	}
	return body
}

func (s *Server) dispatch(req rpcRequest) (any, error) {
	switch req.Method {
	case "initialize":
		s.recordClient(req.Params)
		return map[string]any{
			"protocolVersion": "2024-11-05",
			"capabilities":    map[string]any{"tools": map[string]any{}},
			"serverInfo":      map[string]any{"name": "polterware-mcp", "version": "0.5.0"},
			"instructions":    "Polterware MCP. Work cards: read polter.format once, then polter.query and polter.apply (Polter text with summary and rationale; the session run is implicit). polter.query also answers \"status\", \"inbox\", \"handoff <slug>\", \"oracle <path|slug> zoom:task|component|domain|system budget:N\", \"structure\" or \"structure <path>\", \"decisions [proposed|active|challenged|superseded]\", \"decision <verdict>\", \"feature <slug> [shape|contract|plan]\" (Shape impact and gate checks), \"verify <slug|slug#T2>\", and \"canvas\" or \"canvas <name|id>\" (agent-visible canvases; a name or id returns the node-link export, and a canvas that is not agent-visible is not found); \"? question -> answer\" in polter.apply closes an Inbox decision; a ### ref: decision block in polter.apply moves an Verdict through proposed, active, challenged, and superseded; a handoff: block in polter.apply writes the session record, and claim:/done:/release: lines reserve tasks for this client. Also context.get, entity.get, evidence.get, drift.check; AgentRun audit (agent_run.start|append|complete|get|list); audited writes (fact.upsert, evidence.upsert, evidence.link, knowledge.upsert, knowledge.link) requiring summary, rationale, and open agent_run_id. Prefer context.get for bounded project context. Oracle is the deterministic Structure read; it does not replace context.get.",
		}, nil
	case "tools/list":
		return map[string]any{"tools": toolDefinitions()}, nil
	case "tools/call":
		var params struct {
			Name      string         `json:"name"`
			Arguments map[string]any `json:"arguments"`
		}
		if err := json.Unmarshal(req.Params, &params); err != nil {
			return nil, err
		}
		text, err := s.callTool(params.Name, params.Arguments)
		if err != nil {
			return map[string]any{
				"content": []map[string]any{{"type": "text", "text": err.Error()}},
				"isError": true,
			}, nil
		}
		return map[string]any{
			"content": []map[string]any{{"type": "text", "text": text}},
		}, nil
	case "ping":
		return map[string]any{}, nil
	default:
		return nil, fmt.Errorf("method not found: %s", req.Method)
	}
}

func (s *Server) callTool(name string, args map[string]any) (string, error) {
	if args == nil {
		args = map[string]any{}
	}
	projectID := stringFrom(args["project_id"])
	agentRunID := stringFrom(args["agent_run_id"])
	if agentRunID == "" && name == ToolAgentRunGet {
		agentRunID = stringFrom(args["id"])
	}
	argsJSON, _ := json.Marshal(args)
	text, err := s.invokeTool(name, args)
	summary := agentaccess.SummarizeResult(text, 240)
	ok := err == nil
	if err != nil {
		summary = agentaccess.SummarizeResult(err.Error(), 240)
	}
	if name == ToolAgentRunStart && ok {
		var started map[string]any
		if json.Unmarshal([]byte(text), &started) == nil {
			agentRunID = stringFrom(started["id"])
		}
	}
	_ = s.Store.AppendAgentToolCall(agentaccess.ToolCall{
		ProjectID:     projectID,
		AgentRunID:    agentRunID,
		ToolName:      name,
		ArgumentsJSON: string(argsJSON),
		ResultSummary: summary,
		OK:            ok,
		Source:        "mcp",
	})
	return text, err
}
