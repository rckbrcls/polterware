package mcp

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const MaxResponseBytes = 8 << 20

const sessionHeader = "Mcp-Session-Id"

// Proxy copies stdin MCP messages to the core HTTP endpoint until EOF.
func Proxy(ctx context.Context, endpoint, token string, in io.Reader, out io.Writer) error {
	client := &http.Client{}
	scanner := bufio.NewScanner(in)
	scanner.Buffer(make([]byte, 0, 64*1024), MaxBodyBytes)
	var session string
	for scanner.Scan() {
		if err := ctx.Err(); err != nil {
			return err
		}
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		message := append([]byte(nil), line...)
		if methodOf(message) == "initialize" {
			session = ""
		}
		responses, next, err := postMCP(ctx, client, endpoint, token, session, message)
		if err != nil {
			responses = [][]byte{errorResponse(message, err)}
		}
		if next != "" {
			session = next
		}
		for _, response := range responses {
			if len(bytes.TrimSpace(response)) == 0 {
				continue
			}
			if _, err := fmt.Fprintf(out, "%s\n", bytes.TrimSpace(response)); err != nil {
				return err
			}
		}
	}
	return scanner.Err()
}

func postMCP(ctx context.Context, client *http.Client, endpoint, token, session string, message []byte) ([][]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(message))
	if err != nil {
		return nil, session, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	req.Header.Set("Authorization", "Bearer "+token)
	if session != "" {
		req.Header.Set(sessionHeader, session)
	}
	res, err := client.Do(req)
	if err != nil {
		return nil, session, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, MaxResponseBytes+1))
	if err != nil {
		return nil, session, err
	}
	if id := res.Header.Get(sessionHeader); id != "" {
		session = id
	}
	if len(body) > MaxResponseBytes {
		return nil, session, fmt.Errorf("MCP response exceeds the %d byte limit", MaxResponseBytes)
	}
	if res.StatusCode == http.StatusAccepted {
		return nil, session, nil
	}
	if res.StatusCode != http.StatusOK {
		if strings.Contains(res.Header.Get("Content-Type"), "application/json") && json.Valid(body) && bytes.Contains(body, []byte(`"jsonrpc"`)) {
			return [][]byte{body}, session, nil
		}
		return nil, session, fmt.Errorf("mcp http %d: %s", res.StatusCode, strings.TrimSpace(string(body)))
	}
	if strings.Contains(res.Header.Get("Content-Type"), "text/event-stream") {
		return sseData(body), session, nil
	}
	if !json.Valid(body) {
		return nil, session, fmt.Errorf("invalid MCP JSON response")
	}
	return [][]byte{body}, session, nil
}

func sseData(body []byte) [][]byte {
	var out [][]byte
	for _, line := range bytes.Split(body, []byte("\n")) {
		line = bytes.TrimSpace(line)
		if !bytes.HasPrefix(line, []byte("data:")) {
			continue
		}
		data := bytes.TrimSpace(bytes.TrimPrefix(line, []byte("data:")))
		if len(data) > 0 && data[0] == '{' {
			out = append(out, data)
		}
	}
	return out
}

func methodOf(message []byte) string {
	var probe struct {
		Method string `json:"method"`
	}
	_ = json.Unmarshal(message, &probe)
	return probe.Method
}

func errorResponse(message []byte, err error) []byte {
	var probe struct {
		ID json.RawMessage `json:"id"`
	}
	_ = json.Unmarshal(message, &probe)
	body, marshalErr := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      probe.ID,
		"error":   map[string]any{"code": -32000, "message": err.Error()},
	})
	if marshalErr != nil {
		return []byte(`{"jsonrpc":"2.0","error":{"code":-32603,"message":"internal error"}}`)
	}
	return body
}
