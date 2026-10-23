package integration

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/polterware/polterware/backend/domains/canon"
	"github.com/polterware/polterware/backend/domains/projects"
	"github.com/polterware/polterware/backend/providers/importer"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestImportProjectSourcesIdempotent(t *testing.T) {
	root := t.TempDir()
	write := func(name, body string) {
		if err := os.WriteFile(filepath.Join(root, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("go.mod", "module github.com/acme/demo\n\ngo 1.23\n")
	write("README.md", "# Demo\n\nNotes\n")
	write("package.json", `{"name":"demo","dependencies":{"left-pad":"1.0.0"}}`)

	store, err := storepkg.New(filepath.Join(t.TempDir(), "import.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	projectID := "project-import-test"
	now := time.Now().UTC()
	project, err := projects.NewProject(projectID, "Import Test", root)
	if err != nil {
		t.Fatal(err)
	}
	project.CreatedAt = now
	project.UpdatedAt = now
	if err := store.SaveProject(project); err != nil {
		t.Fatal(err)
	}

	runImport := func() (facts, evidence, sources int) {
		discovered, err := importer.Discover(root)
		if err != nil {
			t.Fatal(err)
		}
		for _, file := range discovered.Files {
			if file.Skipped {
				continue
			}
			ev, factList, err := importer.Materialize(projectID, file, now)
			if err != nil {
				t.Fatal(err)
			}
			if err := store.UpsertCanonEvidence(ev); err != nil {
				t.Fatal(err)
			}
			evidence++
			for _, fact := range factList {
				if err := store.UpsertCanonFact(fact); err != nil {
					t.Fatal(err)
				}
				if err := store.LinkCanonEvidenceToFact(projectID, fact.ID, ev.ID); err != nil {
					t.Fatal(err)
				}
				facts++
			}
			sources++
		}
		return facts, evidence, sources
	}

	f1, e1, s1 := runImport()
	if f1 == 0 || e1 == 0 || s1 < 3 {
		t.Fatalf("first import too small: facts=%d evidence=%d sources=%d", f1, e1, s1)
	}
	f2, e2, s2 := runImport()
	if f2 != f1 || e2 != e1 || s2 != s1 {
		t.Fatalf("second import counts drifted: first=%d/%d/%d second=%d/%d/%d", f1, e1, s1, f2, e2, s2)
	}

	storedFacts, err := store.ListCanonFacts(projectID, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(storedFacts) != f1 {
		t.Fatalf("expected %d stored facts, got %d", f1, len(storedFacts))
	}
	for _, fact := range storedFacts {
		if fact.TruthClass != canon.TruthObserved {
			t.Fatalf("expected observed fact, got %+v", fact)
		}
		if fact.Actor != "system" {
			t.Fatalf("expected system actor, got %+v", fact)
		}
	}
	storedEvidence, err := store.ListCanonEvidence(projectID)
	if err != nil {
		t.Fatal(err)
	}
	if len(storedEvidence) != e1 {
		t.Fatalf("expected %d evidence rows, got %d", e1, len(storedEvidence))
	}
}
