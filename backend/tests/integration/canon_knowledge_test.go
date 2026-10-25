package integration

import (
	"path/filepath"
	"testing"

	contextpkg "github.com/polterware/polterware/backend/domains/context"
	"github.com/polterware/polterware/backend/providers/demoseed"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestCanonKnowledgeSearchAndContext(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "canon.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err := demoseed.Defaults(store); err != nil {
		t.Fatal(err)
	}
	count, err := store.SyncProjectModel(demoseed.ProjectID)
	if err != nil {
		t.Fatal(err)
	}
	if count == 0 {
		t.Fatal("expected entities")
	}
	hits, err := store.SearchKnowledge(demoseed.ProjectID, "database", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) == 0 {
		t.Fatal("expected fts hits")
	}
	links, err := store.ListKnowledgeLinks(demoseed.ProjectID, "doc-database", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(links) == 0 {
		t.Fatal("expected knowledge links")
	}
	pkg, err := store.CompileContext(contextpkg.Request{
		ProjectID:   demoseed.ProjectID,
		Query:       "database",
		TokenBudget: 800,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(pkg.Items) == 0 {
		t.Fatal("expected compiled context items")
	}
}
