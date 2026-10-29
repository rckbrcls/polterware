package wedge_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/structure"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestBriefResolvesFilesToTheNodeThatHoldsThem(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "work.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	root := t.TempDir()
	apiDir := filepath.Join(t.TempDir(), "api")
	if err := os.MkdirAll(apiDir, 0o755); err != nil {
		t.Fatal(err)
	}
	project, err := wedge.InitProject(store, wedge.InitInput{Name: "Demo", RootPath: root})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := wedge.AddProjectRepo(store, project.ID, "api", apiDir); err != nil {
		t.Fatal(err)
	}
	result, err := wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, AutoStartLabel: "cli", Text: `---
polter: 1
summary: Map the checkouts
rationale: Briefs find a file's node by its checkout
---

# app: App
level: system · path: src

# app/web: Web
level: component · under: app · path: src/web

# app/auth: Auth
level: component · under: app · repo: api · path: internal/auth

## login: Login
stage: build · under: app/auth
`})
	if err != nil || len(result.Diagnostics) > 0 {
		t.Fatalf("apply: %v %+v", err, result.Diagnostics)
	}
	query := func(text string) string {
		t.Helper()
		out, err := wedge.QueryPolterScoped(store, project.ID, text, structure.MultiScope{})
		if err != nil {
			t.Fatalf("%s: %v", text, err)
		}
		return out
	}

	for file, node := range map[string]string{
		"src/web/app.tsx": "app/web",
		"src/lib/util.ts": "app",
		filepath.Join(root, "src", "web", "index.ts"):     "app/web",
		filepath.Join(apiDir, "internal", "auth", "x.go"): "app/auth",
		"api:internal/auth/session.go":                    "app/auth",
	} {
		text := query("brief " + file)
		if !strings.HasPrefix(text, "file "+file+" is under "+node+"\n# "+node+":") {
			t.Fatalf("brief %s:\n%s", file, text)
		}
	}
	if text := query("brief login"); !strings.HasPrefix(text, "## login: Login\nstage: build · under: app/auth\nrepo: api · path: internal/auth\n") {
		t.Fatalf("card brief:\n%s", text)
	}
	if _, err := wedge.QueryPolterScoped(store, project.ID, "brief docs/readme.md", structure.MultiScope{}); err == nil || !strings.Contains(err.Error(), "unknown brief target") {
		t.Fatalf("a file no node holds: %v", err)
	}
	if text := query("search auth"); !strings.Contains(text, `node app/auth  component  "Auth"`) {
		t.Fatalf("search:\n%s", text)
	}
}
