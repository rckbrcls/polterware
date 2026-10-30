package wedge_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/polterware/polterware/backend/compositions/wedge"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestInitScanContext(t *testing.T) {
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

	project, err := wedge.InitProject(store, wedge.InitInput{Name: "Demo", Dir: root})
	if err != nil {
		t.Fatal(err)
	}
	repos, err := store.ListRepositories(project.ID)
	if err != nil || len(repos) != 1 || repos[0].LocalPath != root {
		t.Fatalf("init links the folder as the only repository: %+v %v", repos, err)
	}
	snapshot, err := store.LoadWorkSnapshot(project.ID)
	if err != nil || len(snapshot.Nodes) != 1 || snapshot.Nodes[0].Level != "component" || snapshot.Nodes[0].Repo != repos[0].Name {
		t.Fatalf("init creates one component on the repository: %+v %v", snapshot.Nodes, err)
	}
	envs, err := store.ListEnvironments(project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(envs) != 1 || !envs[0].IsDefault {
		t.Fatalf("expected default local env, got %+v", envs)
	}

	pkg, err := wedge.CompileContext(store, wedge.ContextInput{ProjectID: project.ID})
	if err != nil {
		t.Fatal(err)
	}
	if pkg.ProjectID != project.ID {
		t.Fatalf("context project mismatch: %s", pkg.ProjectID)
	}

}
