package mcp_test

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"connectrpc.com/connect"
	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/polterware/polterware/notes/backend/compositions/core"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/platform/coreclient"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
	"github.com/polterware/polterware/notes/backend/platform/runstate"
)

func openCore(t *testing.T) core.Runtime {
	t.Helper()
	rt, err := core.OpenRuntime(t.Context(), filepath.Join(t.TempDir(), "notes.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := rt.Close(); err != nil {
			t.Error(err)
		}
	})
	return rt
}

func TestRotateTokenImmediatelyChangesMountedGuard(t *testing.T) {
	rt := openCore(t)
	ln, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	state := runstate.Core{Endpoint: "http://" + ln.Addr().String(), Token: "ui-test"}
	srv, err := core.Start(ln, core.Config{Token: state.Token, Services: rt.Services, MCP: rt.MCP})
	if err != nil {
		ln.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			t.Error(err)
		}
	})
	httpClient := &http.Client{Transport: &http.Transport{DisableKeepAlives: true}}
	clients, err := coreclient.NewWithHTTP(state, "cli", httpClient)
	if err != nil {
		t.Fatal(err)
	}
	health, err := clients.Health.Check(t.Context(), connect.NewRequest(&v1.CheckRequest{}))
	if err != nil {
		t.Fatal(err)
	}
	endpoint := fmt.Sprintf("http://127.0.0.1:%d/mcp", health.Msg.Mcp.Port)
	probe := func(token string) (int, error) {
		req, err := http.NewRequestWithContext(t.Context(), http.MethodHead, endpoint, nil)
		if err != nil {
			return 0, err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		res, err := httpClient.Do(req)
		if err != nil {
			return 0, err
		}
		res.Body.Close()
		return res.StatusCode, nil
	}
	old := rt.MCP.Token
	if code, err := probe(old); err != nil || code != http.StatusMethodNotAllowed {
		t.Fatalf("initial token: %d / %v", code, err)
	}
	for round := 0; round < 3; round++ {
		next, err := rt.Services.Agents.RotateToken(t.Context(), actor.UI())
		if err != nil {
			t.Fatal(err)
		}
		if next == old || next == "" {
			t.Fatal("rotation did not mint a new token")
		}
		var wg sync.WaitGroup
		for i := 0; i < 12; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				if code, err := probe(old); err != nil || code != http.StatusUnauthorized {
					t.Errorf("revoked token: %d / %v", code, err)
				}
				if code, err := probe(next); err != nil || code != http.StatusMethodNotAllowed {
					t.Errorf("new token: %d / %v", code, err)
				}
			}()
		}
		wg.Wait()
		info, err := rt.Services.Agents.GetInfo(t.Context())
		if err != nil || info.Token != next {
			t.Fatalf("file/live token differ: %v", err)
		}
		old = next
	}
}

func TestCoreMCPPlaceWritesUseSessionActor(t *testing.T) {
	rt := openCore(t)
	httpServer := httptest.NewServer(rt.MCP.Handler)
	defer httpServer.Close()
	client := sdk.NewClient(&sdk.Implementation{Name: "place-review", Version: "0"}, nil)
	sess, err := client.Connect(t.Context(), &sdk.StreamableClientTransport{Endpoint: httpServer.URL}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer sess.Close()
	m, err := rt.Services.Notes.Create(t.Context(), actor.UI(), note.Create{Title: "Place task"})
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range []any{map[string]any{"lat": -23.55, "lng": -46.63}, nil} {
		res, err := sess.CallTool(t.Context(), &sdk.CallToolParams{Name: "update_notes", Arguments: map[string]any{"items": []map[string]any{{"id": m.ID, "place": p}}}})
		if err != nil {
			t.Fatal(err)
		}
		if row := structured(t, res)["results"].([]any)[0].(map[string]any); row["ok"] != true {
			t.Fatal(row)
		}
	}
	page, err := rt.Services.Activity.List(t.Context(), "", "", 100)
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, event := range page.Events {
		if event.Entity == "place" && event.EntityID == m.ID {
			count++
			if event.Actor != "mcp:place-review" {
				t.Fatalf("place audit actor: %s", event.Actor)
			}
		}
	}
	if count != 2 {
		t.Fatalf("place audit writes: %d", count)
	}
}
