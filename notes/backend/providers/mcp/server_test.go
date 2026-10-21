package mcp

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/polterware/polterware/notes/backend/domains/activity/fake/testkit"
)

func TestSessionStateRemovedOnCloseAndExpiration(t *testing.T) {
	for _, expire := range []bool{false, true} {
		t.Run(fmt.Sprintf("expire=%v", expire), func(t *testing.T) {
			f := testkit.Setup()
			server, err := New(Deps{Notes: f.MS, Spaces: f.NS})
			if err != nil {
				t.Fatal(err)
			}
			timeout := time.Hour
			if expire {
				timeout = 100 * time.Millisecond
			}
			handler := sdk.NewStreamableHTTPHandler(func(*http.Request) *sdk.Server { return server.SDK() }, &sdk.StreamableHTTPOptions{JSONResponse: true, SessionTimeout: timeout})
			httpServer := httptest.NewServer(handler)
			defer httpServer.Close()
			client := sdk.NewClient(&sdk.Implementation{Name: "cleanup", Version: "0"}, nil)
			sess, err := client.Connect(t.Context(), &sdk.StreamableClientTransport{Endpoint: httpServer.URL}, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer sess.Close()
			if _, err := sess.CallTool(t.Context(), &sdk.CallToolParams{Name: "list_spaces", Arguments: map[string]any{}}); err != nil {
				t.Fatal(err)
			}
			server.mu.Lock()
			count := len(server.sessions)
			server.mu.Unlock()
			if count != 1 {
				t.Fatalf("sessions before close: %d", count)
			}
			if !expire {
				if err := sess.Close(); err != nil {
					t.Fatal(err)
				}
			}
			deadline := time.After(3 * time.Second)
			ticker := time.NewTicker(5 * time.Millisecond)
			defer ticker.Stop()
			for {
				server.mu.Lock()
				count = len(server.sessions)
				server.mu.Unlock()
				if count == 0 {
					return
				}
				select {
				case <-deadline:
					t.Fatal("closed/expired session state was retained")
				case <-ticker.C:
				}
			}
		})
	}
}
