//go:build notesperf

package perf_test

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/polterware/polterware/notes/backend/compositions/core"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/search"
	"github.com/polterware/polterware/notes/backend/platform/coreclient"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
	"github.com/polterware/polterware/notes/backend/platform/runstate"
	"github.com/polterware/polterware/notes/backend/tests/fixture"
)

func TestListAndFTS10kBudgets(t *testing.T) {
	rt, err := core.OpenRuntime(t.Context(), filepath.Join(t.TempDir(), "notes.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = rt.Close() })
	if err := fixture.Seed(t.Context(), rt.Services.Notes, 10000); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name string
		run  func() error
	}{
		{"list_notes", func() error {
			p, err := rt.Services.Notes.List(t.Context(), note.ListFilter{Limit: 50})
			if err == nil && p.Total != 10000 {
				return fmt.Errorf("total %d", p.Total)
			}
			return err
		}},
		{"FTS", func() error {
			p, err := rt.Services.Search.Search(t.Context(), "Performance", search.Filter{Limit: 50})
			if err == nil && len(p.Hits) != 50 {
				return fmt.Errorf("hits %d", len(p.Hits))
			}
			return err
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			samples := make([]time.Duration, 200)
			for i := range samples {
				start := time.Now()
				if err := tc.run(); err != nil {
					t.Fatal(err)
				}
				samples[i] = time.Since(start)
			}
			sort.Slice(samples, func(i, j int) bool { return samples[i] < samples[j] })
			p95 := samples[189]
			t.Logf("PERF %s n=200 p95_ms=%.3f budget_ms=30", tc.name, float64(p95)/float64(time.Millisecond))
			if p95 >= 30*time.Millisecond {
				t.Errorf("budget missed: %s", p95)
			}
		})
	}
}

func TestCoreColdStartupBudget(t *testing.T) {
	binary := os.Getenv("PWNOTES_PERF_CORE_BINARY")
	if binary == "" {
		t.Fatal("Set PWNOTES_PERF_CORE_BINARY to the built core executable")
	}
	for i := 0; i < 10; i++ {
		db := filepath.Join(t.TempDir(), "notes.db")
		ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
		cmd := exec.CommandContext(ctx, binary, "-db", db, "serve", "--listen", "127.0.0.1:0")
		start := time.Now()
		if err := cmd.Start(); err != nil {
			cancel()
			t.Fatal(err)
		}
		_, err := waitHealthy(ctx, db)
		elapsed := time.Since(start)
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		cancel()
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("PERF core_start sample=%d ms=%.3f budget_ms=300", i, float64(elapsed)/float64(time.Millisecond))
		if elapsed >= 300*time.Millisecond {
			t.Errorf("budget missed: %s", elapsed)
		}
	}
}
func waitHealthy(ctx context.Context, db string) (time.Duration, error) {
	start := time.Now()
	for {
		if state, ok := runstate.ReadCore(db); ok {
			clients, err := coreclient.New(state, "perf")
			if err == nil {
				_, err = clients.Health.Check(ctx, connect.NewRequest(&v1.CheckRequest{}))
				if err == nil {
					return time.Since(start), nil
				}
			}
		}
		select {
		case <-ctx.Done():
			return 0, ctx.Err()
		case <-time.After(time.Millisecond):
		}
	}
}
