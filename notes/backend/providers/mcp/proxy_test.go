package mcp

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProxyLargeResponsesRemainValidJSON(t *testing.T) {
	for _, tc := range []struct {
		name           string
		size           int
		sse, wantError bool
	}{
		{"over request limit", 5 << 20, false, false},
		{"over response limit", MaxResponseBytes + 1, false, true},
		{"large SSE", 5 << 20, true, false},
		{"oversized SSE", MaxResponseBytes + 1, true, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if tc.sse {
					w.Header().Set("Content-Type", "text/event-stream")
					fmt.Fprint(w, "data: ")
				} else {
					w.Header().Set("Content-Type", "application/json")
				}
				fmt.Fprintf(w, `{"jsonrpc":"2.0","id":7,"result":{"note":%q}}`, strings.Repeat("x", tc.size))
				if tc.sse {
					fmt.Fprint(w, "\n\n")
				}
			}))
			defer srv.Close()
			var out bytes.Buffer
			if err := Proxy(t.Context(), srv.URL, "token", strings.NewReader(`{"jsonrpc":"2.0","id":7,"method":"tools/call"}`+"\n"), &out); err != nil {
				t.Fatal(err)
			}
			var response struct {
				ID     int
				Error  json.RawMessage
				Result json.RawMessage
			}
			if err := json.Unmarshal(bytes.TrimSpace(out.Bytes()), &response); err != nil {
				t.Fatalf("invalid JSON: %v", err)
			}
			if response.ID != 7 || (len(response.Error) > 0) != tc.wantError {
				t.Fatalf("wrong response id/error: %d / %s", response.ID, response.Error)
			}
		})
	}
}
