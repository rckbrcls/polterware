package integration

import (
	"path/filepath"
	"testing"

	"github.com/polterware/polterware/backend/domains/canon"
	"github.com/polterware/polterware/backend/providers/demoseed"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestCanonFactsKeepTheirProvenance(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "canon-facts.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err := demoseed.Defaults(store); err != nil {
		t.Fatal(err)
	}

	fact, err := canon.NewFact(demoseed.ProjectID, "polterware-core is the local authority binary", canon.TruthDeclared, "README", "system", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.UpsertCanonFact(fact); err != nil {
		t.Fatal(err)
	}
	got, err := store.GetCanonFact(fact.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Statement != fact.Statement || got.TruthClass != canon.TruthDeclared || got.Source != "README" {
		t.Fatalf("unexpected fact: %+v", got)
	}
	if _, err := canon.NewFact(demoseed.ProjectID, "verified claim", canon.TruthVerified, "human", "system", ""); err != canon.ErrVerifiedRequiresActor {
		t.Fatalf("expected verified actor error, got %v", err)
	}
}
