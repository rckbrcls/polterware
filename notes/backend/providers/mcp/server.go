package mcp

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"

	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/polterware/polterware/notes/backend/domains/fault"
)

// Server is the stateful official-SDK MCP server.
type Server struct {
	deps     Deps
	sdk      *mcpsdk.Server
	handler  http.Handler
	mu       sync.Mutex
	sessions map[string]*NoteSession
}

// New registers the compact catalog on a stateful SDK server.
func New(deps Deps) (*Server, error) {
	if deps.Notes == nil || deps.Spaces == nil {
		return nil, fmt.Errorf("MCP requires note and space services")
	}
	version := deps.Version
	if version == "" {
		version = defaultMCPVer
	}
	s := &Server{deps: deps, sessions: make(map[string]*NoteSession)}
	s.sdk = mcpsdk.NewServer(&mcpsdk.Implementation{Name: ServerName, Version: version}, nil)
	tools, err := Catalog()
	if err != nil {
		return nil, err
	}
	handlers := s.handlers()
	for _, tool := range tools {
		handler, ok := handlers[tool.Name]
		if !ok {
			return nil, fmt.Errorf("missing handler for %s", tool.Name)
		}
		s.sdk.AddTool(&mcpsdk.Tool{Name: tool.Name, Description: tool.Description, InputSchema: tool.InputSchema}, func(ctx context.Context, req *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
			if s.deps.WithActor != nil {
				ctx = s.deps.WithActor(ctx, s.session(req).Actor())
			}
			return handler(ctx, req)
		})
	}
	s.addResourcesAndPrompts()
	s.handler = mcpsdk.NewStreamableHTTPHandler(func(*http.Request) *mcpsdk.Server { return s.sdk }, &mcpsdk.StreamableHTTPOptions{
		JSONResponse:   true,
		SessionTimeout: 30 * time.Minute,
	})
	return s, nil
}

func (s *Server) SDK() *mcpsdk.Server { return s.sdk }

// Handler is the unguarded streamable HTTP handler. Core wraps it with NewGuard.
func (s *Server) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := s.requireEnabled(r.Context()); err != nil {
			http.Error(w, sentence(err), http.StatusForbidden)
			return
		}
		s.handler.ServeHTTP(w, r)
	})
}

func (s *Server) requireEnabled(ctx context.Context) error {
	if s.deps.Settings == nil {
		return nil
	}
	doc, err := s.deps.Settings.Get(ctx)
	if err != nil {
		return fault.Unavailable("MCP settings are unavailable")
	}
	if !doc.AgentsMCPEnabled {
		return fmt.Errorf("MCP is disabled. Enable it in Settings > Agents")
	}
	return nil
}

func (s *Server) fileAttachAllowed(ctx context.Context) (bool, error) {
	if s.deps.Settings == nil {
		return false, nil
	}
	doc, err := s.deps.Settings.Get(ctx)
	if err != nil {
		return false, err
	}
	return doc.AgentsAllowFileAttach, nil
}

func (s *Server) session(req *mcpsdk.CallToolRequest) *NoteSession {
	if req == nil {
		return s.sessionFor(nil)
	}
	return s.sessionFor(req.Session)
}

func (s *Server) sessionFor(transport *mcpsdk.ServerSession) *NoteSession {
	if transport == nil {
		return NewNoteSession(s.deps.Notes, "unknown")
	}
	key := fmt.Sprintf("%p", transport)
	name := "unknown"
	if params := transport.InitializeParams(); params != nil && params.ClientInfo != nil && params.ClientInfo.Name != "" {
		name = params.ClientInfo.Name
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	sess := s.sessions[key]
	if sess == nil {
		sess = NewNoteSession(s.deps.Notes, name)
		s.sessions[key] = sess
		go func() {
			_ = transport.Wait() // closes on DELETE, expiration, or transport termination
			s.mu.Lock()
			defer s.mu.Unlock()
			delete(s.sessions, key)
		}()
	}
	return sess
}

func (s *Server) handlers() map[string]mcpsdk.ToolHandler {
	return map[string]mcpsdk.ToolHandler{
		"get_current_time":  s.getCurrentTime,
		"list_spaces":       s.listSpaces,
		"list_tags":         s.listTags,
		"list_notes":        s.listNotes,
		"search_notes":      s.searchNotes,
		"get_note":          s.getNote,
		"list_occurrences":  s.listOccurrences,
		"get_review":        s.getReview,
		"list_activity":     s.listActivity,
		"create_notes":      s.createNotes,
		"update_notes":      s.updateNotes,
		"set_note_status":   s.setNoteStatus,
		"toggle_check_item": s.toggleCheckItem,
		"delete_notes":      s.deleteNotes,
		"create_space":      s.createSpace,
		"update_space":      s.updateSpace,
		"delete_space":      s.deleteSpace,
		"add_attachments":   s.addAttachments,
	}
}
