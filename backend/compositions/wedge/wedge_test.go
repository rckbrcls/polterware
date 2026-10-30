package wedge_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/polterware/polterware/backend/compositions/wedge"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestInitScanContextDrift(t *testing.T) {
	root := t.TempDir()
	write := func(name, body string) {
		if err := os.WriteFile(filepath.Join(root, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("go.mod", "module github.com/acme/demo\n\ngo 1.23\n")
	write("README.md", "# Demo\n")
	write("package.json", `{"name":"demo","dependencies":{"left-pad":"1.0.0"}}`)

	store, err := storepkg.New(filepath.Join(t.TempDir(), "wedge.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	project, err := wedge.InitProject(store, wedge.InitInput{
		Name:     "Demo",
		RootPath: root,
	})
	if err != nil {
		t.Fatal(err)
	}
	if project.ID == "" || project.RootPath == "" {
		t.Fatalf("init incomplete: %+v", project)
	}
	envs, err := store.ListEnvironments(project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(envs) != 1 || !envs[0].IsDefault {
		t.Fatalf("expected default local env, got %+v", envs)
	}

	scan, err := wedge.ScanProject(store, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if scan.FactCount == 0 || scan.EvidenceCount == 0 {
		t.Fatalf("scan too small: %+v", scan)
	}

	scan2, err := wedge.ScanProject(store, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if scan2.FactCount != scan.FactCount || scan2.EvidenceCount != scan.EvidenceCount {
		t.Fatalf("scan not idempotent: first=%+v second=%+v", scan, scan2)
	}

	pkg, err := wedge.CompileContext(store, wedge.ContextInput{ProjectID: project.ID})
	if err != nil {
		t.Fatal(err)
	}
	if pkg.ProjectID != project.ID {
		t.Fatalf("context project mismatch: %s", pkg.ProjectID)
	}

	drift, err := wedge.CheckDrift(store, wedge.DriftInput{ProjectID: project.ID})
	if err != nil {
		t.Fatal(err)
	}
	if drift.Checker != "narrow" || drift.Status != "ok" {
		t.Fatalf("unexpected drift result: %+v", drift)
	}
	if drift.Findings == nil {
		t.Fatal("findings must be non-nil slice")
	}
}
