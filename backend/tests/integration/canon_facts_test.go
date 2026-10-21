package integration

import (
	"path/filepath"
	"testing"

	"github.com/polterware/polterware/backend/domains/canon"
	"github.com/polterware/polterware/backend/providers/demoseed"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestCanonFactsEvidenceProvenance(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "canon-facts.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err := demoseed.Defaults(store); err != nil {
		t.Fatal(err)
	}
	if _, err := store.SyncProjectModel(demoseed.ProjectID); err != nil {
		t.Fatal(err)
	}

	fact, err := canon.NewFact(
		demoseed.ProjectID,
		"polterware-core is the local authority binary",
		canon.TruthObserved,
		"import:README",
		"system",
		"",
	)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.UpsertCanonFact(fact); err != nil {
		t.Fatal(err)
	}

	evidence, err := canon.NewEvidence(
		demoseed.ProjectID,
		canon.EvidenceKindFile,
		"README describes polterware-core",
		"fs",
		"README.md",
		"system",
	)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.UpsertCanonEvidence(evidence); err != nil {
		t.Fatal(err)
	}
	if err := store.LinkCanonEvidenceToFact(demoseed.ProjectID, fact.ID, evidence.ID); err != nil {
		t.Fatal(err)
	}

	got, err := store.GetCanonFact(fact.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Statement != fact.Statement || got.TruthClass != canon.TruthObserved || got.Source != "import:README" {
		t.Fatalf("unexpected fact: %+v", got)
	}
	linked, err := store.ListCanonEvidenceForFact(fact.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(linked) != 1 || linked[0].ID != evidence.ID || linked[0].Path != "README.md" {
		t.Fatalf("unexpected evidence: %+v", linked)
	}

	_, err = canon.NewFact(demoseed.ProjectID, "verified claim", canon.TruthVerified, "human", "system", "")
	if err != canon.ErrVerifiedRequiresActor {
		t.Fatalf("expected verified actor error, got %v", err)
	}
}
