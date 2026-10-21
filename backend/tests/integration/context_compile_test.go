package integration

import (
	"path/filepath"
	"testing"

	contextpkg "github.com/polterware/polterware/backend/domains/context"
	"github.com/polterware/polterware/backend/domains/canon"
	"github.com/polterware/polterware/backend/providers/demoseed"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestCompileContextIncludesFactsReasonsEvidence(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "context-compile.db"))
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
		"module uses Go modules for dependency management",
		canon.TruthObserved,
		"import:go.mod",
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
		"go.mod module line",
		"import:go.mod",
		"go.mod",
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

	sample, err := store.CompileContext(contextpkg.Request{
		ProjectID:   demoseed.ProjectID,
		TokenBudget: 2000,
	})
	if err != nil {
		t.Fatal(err)
	}
	assertFactItem(t, sample, fact.ID, evidence.ID, contextpkg.ReasonImportedFact)

	matched, err := store.CompileContext(contextpkg.Request{
		ProjectID:   demoseed.ProjectID,
		Query:       "Go modules",
		TokenBudget: 2000,
	})
	if err != nil {
		t.Fatal(err)
	}
	assertFactItem(t, matched, fact.ID, evidence.ID, contextpkg.ReasonFactQueryMatch)
}

func assertFactItem(t *testing.T, pkg contextpkg.Package, factID, evidenceID, wantReason string) {
	t.Helper()
	var found *contextpkg.Item
	for i := range pkg.Items {
		if pkg.Items[i].Kind == "fact" && pkg.Items[i].ID == factID {
			found = &pkg.Items[i]
			break
		}
	}
	if found == nil {
		t.Fatalf("expected fact %s in package (%d items)", factID, len(pkg.Items))
	}
	if len(found.Reasons) == 0 {
		t.Fatal("expected non-empty reasons")
	}
	hasReason := false
	for _, reason := range found.Reasons {
		if reason == wantReason {
			hasReason = true
			break
		}
	}
	if !hasReason {
		t.Fatalf("expected reason %q, got %#v", wantReason, found.Reasons)
	}
	if len(found.Evidence) == 0 {
		t.Fatal("expected evidence refs on fact")
	}
	if found.Evidence[0].ID != evidenceID {
		t.Fatalf("expected evidence %s, got %#v", evidenceID, found.Evidence)
	}
}
