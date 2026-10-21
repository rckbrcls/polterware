package mcp_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"

	provider "github.com/polterware/polterware/notes/backend/providers/mcp"
)

func TestGuardedHTTPAndProxy(t *testing.T) {
	h := setupMCP(t)
	ln, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	port := ln.Addr().(*net.TCPAddr).Port
	const token = "http-test-token"
	wrap, err := provider.NewGuard(token, port, provider.MaxBodyBytes)
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.Handle("/mcp", wrap(h.srv.Handler()))
	srv := &http.Server{Handler: mux}
	go func() { _ = srv.Serve(ln) }()
	t.Cleanup(func() { _ = srv.Close() })
	endpoint := "http://" + ln.Addr().String() + "/mcp"
	init := `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"proxy-test","version":"0"}}}`
	req, _ := http.NewRequest(http.MethodPost, endpoint, strings.NewReader(init))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	req.Host = ln.Addr().String()
	resp, err := http.DefaultClient.Do(req)
	if err == nil {
		resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("missing bearer: %d", resp.StatusCode)
		}
	}
	bad := req.Clone(t.Context())
	bad.Body = io.NopCloser(strings.NewReader(init))
	bad.Header.Set("Authorization", "Bearer "+token)
	bad.Host = "evil.example:" + strings.Split(ln.Addr().String(), ":")[1]
	resp, err = http.DefaultClient.Do(bad)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("bad host: %d", resp.StatusCode)
	}
	in := strings.NewReader(strings.Join([]string{
		init,
		`{"jsonrpc":"2.0","method":"notifications/initialized"}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/list"}`,
		`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"create_notes","arguments":{"items":[{"title":"Milk"}]}}}`,
	}, "\n") + "\n")
	var out bytes.Buffer
	if err := provider.Proxy(context.Background(), endpoint, token, in, &out); err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(out.Bytes(), []byte("created")) && !bytes.Contains(out.Bytes(), []byte("Milk")) {
		t.Fatalf("proxy: %s", out.String())
	}
	var listed struct {
		Result json.RawMessage `json:"result"`
	}
	for _, line := range bytes.Split(out.Bytes(), []byte("\n")) {
		if bytes.Contains(line, []byte(`"tools"`)) {
			_ = json.Unmarshal(line, &listed)
		}
	}
}
