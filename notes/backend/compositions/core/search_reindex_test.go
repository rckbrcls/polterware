package core

import (
	"context"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/search"
	searchprovider "github.com/polterware/polterware/notes/backend/providers/search"
	"github.com/polterware/polterware/notes/backend/providers/sqlite"
)

func searchStore(t *testing.T) *sqlite.Store {
	t.Helper()
	s, err := sqlite.Open(filepath.Join(t.TempDir(), "notes.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func seedSearchNote(t *testing.T, s *sqlite.Store) note.Note {
	t.Helper()
	now := time.Now().UTC()
	m := note.Note{ID: "m", Title: "Before", Status: note.StatusActive, Rev: 1, CreatedAt: now, UpdatedAt: now}
	if err := s.Notes().Insert(t.Context(), m); err != nil {
		t.Fatal(err)
	}
	return m
}

func TestSearchDocumentsReleaseRowsBeforeProjection(t *testing.T) {
	s := searchStore(t)
	seedSearchNote(t, s)
	// Even one reader must suffice; projection cannot wait on its own open Rows.
	s.Handle().Reader().SetMaxOpenConns(1)
	ctx, cancel := context.WithTimeout(t.Context(), time.Second)
	defer cancel()
	docs, err := (storeDocuments{store: s}).ListSearchDocuments(ctx)
	if err != nil || len(docs) != 1 || docs[0].Title != "Before" {
		t.Fatalf("documents: %+v, %v", docs, err)
	}
}

func TestConcurrentReindexDoesNotStarveConnections(t *testing.T) {
	s := searchStore(t)
	svc := WireSearch(s)
	seedSearchNote(t, s)
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if n, err := svc.Reindex(ctx); err != nil || n != 1 {
				t.Errorf("reindex: %d, %v", n, err)
			}
		}()
	}
	close(start)
	wg.Wait()
	if status, err := svc.Status(ctx); err != nil || status.FTSDocuments != 1 {
		t.Fatalf("status: %+v, %v", status, err)
	}
}

type pausedDocuments struct {
	search.DocumentSource
	collected chan struct{}
	release   chan struct{}
}

func (s pausedDocuments) ListSearchDocuments(ctx context.Context) ([]search.Document, error) {
	docs, err := s.DocumentSource.ListSearchDocuments(ctx)
	if err != nil {
		return nil, err
	}
	close(s.collected)
	select {
	case <-s.release:
		return docs, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func TestReindexCannotOverwriteConcurrentNoteUpdate(t *testing.T) {
	s := searchStore(t)
	idx := searchprovider.NewWithReader(s.Handle().Writer(), s.Handle().Reader())
	s.SetIndex(idx)
	m := seedSearchNote(t, s)
	source := pausedDocuments{storeDocuments{s}, make(chan struct{}), make(chan struct{})}
	svc := searchRuntime{
		Service: search.NewService(storeSearchIndex{idx, s}, source), transactions: s,
	}
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	reindexed := make(chan error, 1)
	go func() { _, err := svc.Reindex(ctx); reindexed <- err }()
	select {
	case <-source.collected:
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	m.Title, m.Rev = "After", 2
	updated := make(chan error, 1)
	go func() { updated <- s.Notes().Update(ctx, 1, m) }()
	// The competing writer must wait until the full rebuild commits.
	var updateErr error
	var overtook bool
	select {
	case updateErr = <-updated:
		overtook = true
	case <-time.After(50 * time.Millisecond):
	}
	close(source.release)
	if err := <-reindexed; err != nil {
		t.Fatal(err)
	}
	if !overtook {
		updateErr = <-updated
	}
	if updateErr != nil {
		t.Fatal(updateErr)
	}
	if overtook {
		t.Error("update committed between collection and rebuild")
	}
	hits, err := svc.Search(ctx, "After", search.Filter{})
	if err != nil || len(hits.Hits) != 1 || hits.Hits[0].Title != "After" {
		t.Fatalf("fresh index: %+v, %v", hits, err)
	}
	old, err := svc.Search(ctx, "Before", search.Filter{})
	if err != nil || len(old.Hits) != 0 {
		t.Fatalf("stale index: %+v, %v", old, err)
	}
}
