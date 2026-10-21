package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/polterware/polterware/backend/platform/coreclient"
	"github.com/polterware/polterware/backend/platform/runstate"
	"github.com/polterware/polterware/backend/providers/mcp"
)

// errSessionLost means the core no longer knows the MCP session (it restarted
// or expired the session); the bridge initializes again and retries.
var errSessionLost = errors.New("mcp session lost")

// runMCP bridges MCP stdio (how Claude Code, Codex, and Cursor launch servers)
// to the core's /mcp endpoint (Verdict 0007). It opens no store.
func runMCP(dbPath string) error {
	bridge := &mcpBridge{dbPath: dbPath, http: &http.Client{}}
	defer bridge.close()
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 0, 64*1024), 4<<20)
	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		message := append([]byte(nil), line...)
		if isInitialize(message) {
			bridge.initialize = message
			bridge.session = ""
		}
		response, err := bridge.send(message)
		if errors.Is(err, errSessionLost) && bridge.initialize != nil && !isInitialize(message) {
			if err = bridge.reinitialize(); err == nil {
				response, err = bridge.send(message)
			}
		}
		if err != nil {
			response = errorResponse(message, err)
		}
		if len(response) > 0 {
			if _, err := fmt.Fprintf(os.Stdout, "%s\n", bytes.TrimSpace(response)); err != nil {
				return err
			}
		}
	}
	return scanner.Err()
}

type mcpBridge struct {
	dbPath     string
	http       *http.Client
	core       runstate.Core
	session    string
	initialize []byte
}

// send posts one message, starting or re-finding the core when needed.
func (b *mcpBridge) send(message []byte) ([]byte, error) {
	for attempt := 0; attempt < 2; attempt++ {
		if b.core.Endpoint == "" {
			core, err := coreclient.Ensure(b.dbPath)
			if err != nil {
				return nil, err
			}
			b.core = core
		}
		response, status, err := b.post(message)
		if err != nil {
			// The core exited (idle or replaced): find or start it again.
			b.core = runstate.Core{}
			if b.session != "" {
				b.session = ""
				if !isInitialize(message) {
					return nil, errSessionLost
				}
			}
			continue
		}
		switch status {
		case http.StatusOK, http.StatusAccepted:
			return response, nil
		case http.StatusNotFound:
			b.session = ""
			return nil, errSessionLost
		default:
			return nil, fmt.Errorf("core /mcp returned %d: %s", status, strings.TrimSpace(string(response)))
		}
	}
	return nil, fmt.Errorf("core unavailable; see %s", runstate.LogPath(b.dbPath))
}

func (b *mcpBridge) post(message []byte) ([]byte, int, error) {
	request, err := http.NewRequest(http.MethodPost, strings.TrimSuffix(b.core.Endpoint, "/")+"/mcp", bytes.NewReader(message))
	if err != nil {
		return nil, 0, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+b.core.Token)
	request.Header.Set(coreclient.ClientHeader, "mcp")
	if b.session != "" {
		request.Header.Set(mcp.SessionHeader, b.session)
	}
	response, err := b.http.Do(request)
	if err != nil {
		return nil, 0, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, 0, err
	}
	if id := response.Header.Get(mcp.SessionHeader); id != "" {
		b.session = id
	}
	return body, response.StatusCode, nil
}

// reinitialize replays the client's initialize so tool calls continue after
// the core restarted; the replayed response is not forwarded.
func (b *mcpBridge) reinitialize() error {
	b.session = ""
	_, err := b.send(b.initialize)
	return err
}

func (b *mcpBridge) close() {
	if b.session == "" || b.core.Endpoint == "" {
		return
	}
	request, err := http.NewRequest(http.MethodDelete, strings.TrimSuffix(b.core.Endpoint, "/")+"/mcp", nil)
	if err != nil {
		return
	}
	request.Header.Set("Authorization", "Bearer "+b.core.Token)
	request.Header.Set(mcp.SessionHeader, b.session)
	if response, err := b.http.Do(request); err == nil {
		_ = response.Body.Close()
	}
}

func isInitialize(message []byte) bool {
	var probe struct {
		Method string `json:"method"`
	}
	return json.Unmarshal(message, &probe) == nil && probe.Method == "initialize"
}

// errorResponse answers a request the bridge could not deliver; notifications
// get no answer.
func errorResponse(message []byte, err error) []byte {
	var probe struct {
		ID json.RawMessage `json:"id"`
	}
	if json.Unmarshal(message, &probe) != nil || probe.ID == nil {
		return nil
	}
	body, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      probe.ID,
		"error":   map[string]any{"code": -32000, "message": err.Error()},
	})
	return body
}
