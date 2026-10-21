//go:build !race

package search

import (
	"context"
	"fmt"
	"path/filepath"
	"sort"
	"testing"
	"time"

	searchdomain "github.com/polterware/polterware/notes/backend/domains/search"
	"github.com/polterware/polterware/notes/backend/platform/changes"
	"github.com/polterware/polterware/notes/backend/providers/sqlite"
)

func TestSearchPerformance10k(t *testing.T) {
	store, err := sqlite.OpenWith(filepath.Join(t.TempDir(), "notes.db"), changes.New(), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	ctx := context.Background()
	now := time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)
	q := store.Handle().Writer()
	for i := 0; i < 10000; i++ {
		id := fmt.Sprintf("m%05d", i)
		title := fmt.Sprintf("note title %d alpha", i%50)
		if _, err := q.ExecContext(ctx, `
			INSERT INTO notes(id, title, content, status, pinned, due_all_day, sort_order, auto_complete_on_checklist, created_at, updated_at, rev)
			VALUES (?,?,?,?,0,0,0,0,?,?,1)`,
			id, title, "body text", "active", now.Format(time.RFC3339Nano), now.Format(time.RFC3339Nano)); err != nil {
			t.Fatal(err)
		}
	}
	idx := NewWithReader(store.Handle().Writer(), store.Handle().Q(ctx, false))
	store.SetIndex(idx)
	svc := searchdomain.NewService(idx, listDocuments{store: store})
	if _, err := svc.Reindex(ctx); err != nil {
		t.Fatal(err)
	}
	count, err := idx.Count(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if count != 10000 {
		t.Fatalf("count = %d", count)
	}
	latencies := make([]time.Duration, 100)
	for i := 0; i < 100; i++ {
		start := time.Now()
		if _, err := idx.Search(ctx, "alpha", searchdomain.Filter{Limit: 20}); err != nil {
			t.Fatal(err)
		}
		latencies[i] = time.Since(start)
	}
	sort.Slice(latencies, func(i, j int) bool { return latencies[i] < latencies[j] })
	p95 := latencies[94]
	if p95 > 30*time.Millisecond {
		t.Fatalf("p95 = %v, want < 30ms", p95)
	}
}
