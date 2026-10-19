package sqlite

import (
	"context"
	"path/filepath"
	"sync"
	"testing"

	"github.com/polterware/polterware/notes/backend/domains/search"
	"github.com/polterware/polterware/notes/backend/tests/repotest"
)

func openStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "notes.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func TestRepoSuite(t *testing.T) {
	repotest.Run(t, "sqlite", func(t *testing.T) (repotest.Repos, func()) {
		s := openStore(t)
		return repotest.Repos{
			Tx: s, Spaces: s.Spaces(), Notes: s.Notes(), Tags: s.Tags(),
			Schedules: s.Schedules(), Places: s.Places(), Attachments: s.Attachments(),
			Focus: s.Focus(), Activity: s.Activity(), Settings: s.Settings(),
			Reminders: s.Reminders(), Review: s.Review(),
		}, func() { _ = s.Close() }
	})
}

type recIndex struct {
	mu      sync.Mutex
	upserts []search.Document
	deleted []string
}

func (r *recIndex) Upsert(_ context.Context, doc search.Document) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.upserts = append(r.upserts, doc)
	return nil
}

func (r *recIndex) Delete(_ context.Context, noteID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.deleted = append(r.deleted, noteID)
	return nil
}

func (r *recIndex) Search(context.Context, string, search.Filter) ([]search.Hit, error) {
	return nil, nil
}
func (r *recIndex) Rebuild(context.Context, []search.Document) error { return nil }
func (r *recIndex) Count(context.Context) (int, error)               { return 0, nil }

func (r *recIndex) last() search.Document {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.upserts) == 0 {
		return search.Document{}
	}
	return r.upserts[len(r.upserts)-1]
}
