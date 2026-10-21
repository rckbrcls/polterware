package mcp

import (
	"encoding/json"
	"io"
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/polterware/polterware/backend/platform/ids"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// SessionHeader carries the MCP session id (streamable HTTP transport).
const SessionHeader = "Mcp-Session-Id"

// sessionIdle closes sessions whose client stopped calling without a DELETE
// (for example a killed bridge).
const sessionIdle = 30 * time.Minute

// Sessions serves MCP over HTTP inside the core (Verdict 0007): POST one JSON-RPC
// message, get its JSON response (202 for notifications); `initialize` opens a
// session and returns its id in Mcp-Session-Id; DELETE closes it. Callers
// authenticate before reaching this handler.
type Sessions struct {
	Store *storepkg.Store

	mu       sync.Mutex
	sessions map[string]*Server
}

func NewSessions(store *storepkg.Store) *Sessions {
	return &Sessions{Store: store, sessions: map[string]*Server{}}
}

// Info describes one live session.
type Info struct {
	ID            string
	ClientName    string
	ClientVersion string
	StartedAt     time.Time
	LastSeen      time.Time
}

// List returns live sessions, oldest first.
func (h *Sessions) List() []Info {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.expireLocked()
	out := make([]Info, 0, len(h.sessions))
	for _, s := range h.sessions {
		out = append(out, Info{ID: s.ID, ClientName: s.ClientName, ClientVersion: s.ClientVersion, StartedAt: s.StartedAt, LastSeen: s.lastSeen})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].StartedAt.Before(out[j].StartedAt) })
	return out
}

// CloseAll completes every session's runs (core shutdown).
func (h *Sessions) CloseAll() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for id, s := range h.sessions {
		s.Close()
		delete(h.sessions, id)
	}
}

func (h *Sessions) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		h.post(w, r)
	case http.MethodDelete:
		h.mu.Lock()
		if s := h.sessions[r.Header.Get(SessionHeader)]; s != nil {
			s.Close()
			delete(h.sessions, s.ID)
		}
		h.mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	default:
		w.Header().Set("Allow", "POST, DELETE")
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (h *Sessions) post(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 4<<20))
	if err != nil {
		http.Error(w, "read body", http.StatusBadRequest)
		return
	}
	var probe struct {
		Method string `json:"method"`
	}
	_ = json.Unmarshal(body, &probe)

	h.mu.Lock()
	h.expireLocked()
	var session *Server
	if probe.Method == "initialize" {
		now := time.Now().UTC()
		session = &Server{Store: h.Store, ID: ids.NewULID(), StartedAt: now, lastSeen: now}
		h.sessions[session.ID] = session
	} else {
		session = h.sessions[r.Header.Get(SessionHeader)]
	}
	if session == nil {
		h.mu.Unlock()
		// Unknown or expired session: the client must initialize again.
		http.Error(w, "unknown MCP session: initialize again", http.StatusNotFound)
		return
	}
	session.lastSeen = time.Now().UTC()
	h.mu.Unlock()

	// Writes are serialized by SQLite; tool calls of one session run in order
	// because the bridge sends one message at a time.
	response, ok := session.handle(body)
	w.Header().Set(SessionHeader, session.ID)
	if !ok {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(response)
}

func (h *Sessions) expireLocked() {
	cutoff := time.Now().Add(-sessionIdle)
	for id, s := range h.sessions {
		if s.lastSeen.Before(cutoff) {
			s.Close()
			delete(h.sessions, id)
		}
	}
}
