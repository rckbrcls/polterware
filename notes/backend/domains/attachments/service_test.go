package attachments

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/note"
)

type testStore struct {
	mu     sync.Mutex
	files  map[string]ImportedFile
	rows   map[string]Attachment
	source string
}

func newTestStore(src string) *testStore {
	return &testStore{files: map[string]ImportedFile{}, rows: map[string]Attachment{}, source: src}
}
func (s *testStore) List(_ context.Context, m string) ([]Attachment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []Attachment
	for _, a := range s.rows {
		if a.NoteID == m {
			out = append(out, a)
		}
	}
	return out, nil
}
func (s *testStore) Get(_ context.Context, id string) (Attachment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	a, ok := s.rows[id]
	if !ok {
		return a, errors.New("missing")
	}
	return a, nil
}
func (s *testStore) Insert(_ context.Context, a Attachment) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.rows[a.ID] = a
	return nil
}
func (s *testStore) Delete(_ context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.rows, id)
	return nil
}
func (s *testStore) Reorder(context.Context, string, []string) error { return nil }
func (s *testStore) ImportFile(_ context.Context, m, id, src string) (ImportedFile, error) {
	if src != s.source {
		return ImportedFile{}, errors.New("unexpected source")
	}
	f := ImportedFile{RelPath: filepath.Join(m, id+".dat"), SizeBytes: 5, SHA256: "same-hash", Mime: "application/octet-stream"}
	s.mu.Lock()
	s.files[f.RelPath] = f
	s.mu.Unlock()
	return f, nil
}
func (s *testStore) AbsolutePath(p string) (string, error) {
	return filepath.Join("/data/attachments", p), nil
}
func (s *testStore) RemoveFile(_ context.Context, p string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.files, p)
	return nil
}

type testIDs struct{ n int }

func (g *testIDs) New() string { g.n++; return string(rune('a' + g.n)) }

type testClock struct{}

func (testClock) Now() time.Time { return time.Date(2026, 10, 4, 0, 0, 0, 0, time.UTC) }

func TestImportDeduplicatesHashAndNeverUsesDisplayNameForPath(t *testing.T) {
	src := filepath.Join(t.TempDir(), "source")
	if err := os.WriteFile(src, []byte("hello"), 0600); err != nil {
		t.Fatal(err)
	}
	store := newTestStore(src)
	svc := NewService(store, &testIDs{}, testClock{})
	name := "../../outside.txt"
	first, err := svc.ImportFromPath(context.Background(), "01ARZ3NDEKTSV4RRFFQ69G5FAV", src, name, 0)
	if err != nil {
		t.Fatal(err)
	}
	second, err := svc.ImportFromPath(context.Background(), first.NoteID, src, "duplicate", 0)
	if err != nil {
		t.Fatal(err)
	}
	if first.ID != second.ID {
		t.Fatalf("duplicate hash created %q; want existing %q", second.ID, first.ID)
	}
	if filepath.IsAbs(*first.RelPath) || filepath.Base(*first.RelPath) == name {
		t.Fatalf("display name influenced stored path: %q", *first.RelPath)
	}
	if len(store.rows) != 1 {
		t.Fatalf("got %d rows, want 1", len(store.rows))
	}
}

func TestConcurrentDuplicateImportsDeduplicate(t *testing.T) {
	src := filepath.Join(t.TempDir(), "source")
	if err := os.WriteFile(src, []byte("hello"), 0600); err != nil {
		t.Fatal(err)
	}
	store := newTestStore(src)
	svc := NewService(store, &testIDs{}, testClock{})
	const mem = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, e := svc.ImportFromPath(context.Background(), mem, src, "", 0); e != nil {
				t.Error(e)
			}
		}()
	}
	wg.Wait()
	if len(store.rows) != 1 {
		t.Fatalf("got %d rows, want one", len(store.rows))
	}
}

type revMem struct {
	note.Repository
	current note.Note
}

func (r *revMem) Get(context.Context, string) (note.Note, error) { return r.current, nil }

type joinTx struct{}

func (joinTx) Within(ctx context.Context, fn func(context.Context) error) error { return fn(ctx) }

func TestAddLinkExpectedRev(t *testing.T) {
	store := newTestStore("")
	svc := NewService(store, &testIDs{}, testClock{})
	svc.WithNoteRev(&revMem{current: note.Note{ID: "m", Rev: 2}}, joinTx{})
	if _, err := svc.AddLink(context.Background(), "m", "https://example.com/a", "", 1); !fault.IsCode(err, fault.CodeConflict) {
		t.Fatalf("stale: %v", err)
	}
	if _, err := svc.AddLink(context.Background(), "m", "https://example.com/a", "", 0); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.AddLink(context.Background(), "m", "https://example.com/b", "", 2); err != nil {
		t.Fatal(err)
	}
}

type failingStore struct {
	*testStore
	cleanupErr     error
	cleanupContext error
}

func (s *failingStore) RemoveFile(ctx context.Context, p string) error {
	s.cleanupContext = ctx.Err()
	if s.cleanupErr != nil {
		return s.cleanupErr
	}
	return s.testStore.RemoveFile(ctx, p)
}

type cancelTx struct{ cancel context.CancelFunc }

func (tx cancelTx) Within(ctx context.Context, _ func(context.Context) error) error {
	tx.cancel()
	return ctx.Err()
}

func TestFailedTransactionCleanupIgnoresCancellationAndSurfacesFailure(t *testing.T) {
	for _, fail := range []bool{false, true} {
		t.Run(fmt.Sprint(fail), func(t *testing.T) {
			store := &failingStore{testStore: newTestStore("source")}
			cleanupErr := errors.New("disk cleanup failure")
			if fail {
				store.cleanupErr = cleanupErr
			}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			svc := NewService(store, &testIDs{}, testClock{}).WithNoteRev(nil, cancelTx{cancel})
			_, err := svc.ImportFromPath(ctx, "note", "source", "", 0)
			if !errors.Is(err, context.Canceled) || store.cleanupContext != nil {
				t.Fatalf("cleanup canceled: %v / %v", err, store.cleanupContext)
			}
			if fail && !errors.Is(err, cleanupErr) {
				t.Fatalf("lost cleanup error: %v", err)
			}
			if !fail && len(store.files) != 0 {
				t.Fatal("rollback left a file")
			}
		})
	}
}

func TestDedupChecksExpectedRevisionAndCleansCopy(t *testing.T) {
	store := newTestStore("source")
	svc := NewService(store, &testIDs{}, testClock{}).WithNoteRev(&revMem{current: note.Note{ID: "m", Rev: 2}}, joinTx{})
	if _, err := svc.ImportFromPath(context.Background(), "m", "source", "", 2); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ImportFromPath(context.Background(), "m", "source", "", 1); !fault.IsCode(err, fault.CodeConflict) {
		t.Fatalf("stale dedup: %v", err)
	}
	if len(store.files) != 1 {
		t.Fatalf("dedup left %d files", len(store.files))
	}
}

type pausedStore struct {
	*testStore
	listed chan struct{}
	resume chan struct{}
}

func (s *pausedStore) List(ctx context.Context, id string) ([]Attachment, error) {
	rows, err := s.testStore.List(ctx, id)
	close(s.listed)
	<-s.resume
	return rows, err
}

func TestDeleteCannotInvalidateAnImportDedupSnapshot(t *testing.T) {
	base := newTestStore("source")
	hash, rel := "same-hash", "m/original.dat"
	base.rows["original"] = Attachment{ID: "original", NoteID: "m", SHA256: &hash, RelPath: &rel}
	store := &pausedStore{testStore: base, listed: make(chan struct{}), resume: make(chan struct{})}
	svc := NewService(store, &testIDs{}, testClock{})
	imported := make(chan Attachment, 1)
	go func() {
		a, err := svc.ImportFromPath(context.Background(), "m", "source", "", 0)
		if err != nil {
			t.Error(err)
		}
		imported <- a
	}()
	<-store.listed
	deleted := make(chan error, 1)
	go func() { deleted <- svc.Delete(context.Background(), "original") }()
	select {
	case err := <-deleted:
		close(store.resume)
		<-imported
		t.Fatalf("delete crossed dedup critical section: %v", err)
	case <-time.After(30 * time.Millisecond):
	}
	close(store.resume)
	if a := <-imported; a.ID != "original" {
		t.Fatalf("dedup = %q", a.ID)
	}
	if err := <-deleted; err != nil {
		t.Fatal(err)
	}
	// Deletion linearizes after dedup; the next import must create a fresh row.
	svc.store = base
	a, err := svc.ImportFromPath(context.Background(), "m", "source", "", 0)
	if err != nil || a.ID == "original" {
		t.Fatalf("returned deleted attachment: %+v, %v", a, err)
	}
}
