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
	project, err := initWithRepo(store, "Demo", root)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := wedge.EnsureRepository(store, project.ID, apiDir); err != nil {
		t.Fatal(err)
	}
	result, err := wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, AutoStartLabel: "cli", Text: strings.ReplaceAll(`---
polter: 1
summary: Map the checkouts
rationale: Briefs find a file's node by its checkout
---

# app: App
level: domain · dir: {root} · path: src

# app/web: Web
level: component · under: app · dir: {root} · path: src/web

# app/auth: Auth
level: component · under: app · repo: api · path: internal/auth

## login: Login
stage: build · under: app/auth
`, "{root}", root)})
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

func TestFileContextSendsEachNodeBriefOncePerSession(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "file-context.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	root := t.TempDir()
	project, err := initWithRepo(store, "Demo", root)
	if err != nil {
		t.Fatal(err)
	}
	apply := func(text string) {
		t.Helper()
		result, err := wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, AutoStartLabel: "cli",
			Text: "---\npolter: 1\nsummary: Map the app\nrationale: Hooks brief by file\n---\n\n" + text})
		if err != nil || len(result.Diagnostics) > 0 {
			t.Fatalf("apply: %v %+v", err, result.Diagnostics)
		}
	}
	apply("# app: App\nlevel: domain · path: src\n\n# app/web: Web\nlevel: component · under: app · path: src/web\n\n! No inline styles\n")
	file := filepath.Join(root, "src", "web", "page.tsx")

	text, node, err := wedge.FileContext(store, project.ID, "s1", file)
	if err != nil || node != "app/web" || !strings.HasPrefix(text, "Polterware: "+file+" is under app/web.") || !strings.Contains(text, "Rules:\n- No inline styles\n") {
		t.Fatalf("first read: %q %q %v", text, node, err)
	}
	if again, _, err := wedge.FileContext(store, project.ID, "s1", filepath.Join(root, "src", "web", "other.tsx")); err != nil || again != "" {
		t.Fatalf("a second file under the same node must send nothing: %q %v", again, err)
	}
	if other, _, _ := wedge.FileContext(store, project.ID, "s2", file); other == "" {
		t.Fatal("another session gets its own brief")
	}
	if parent, node, _ := wedge.FileContext(store, project.ID, "s1", filepath.Join(root, "src", "main.ts")); node != "app" || parent == "" {
		t.Fatalf("a file under another node sends that node: %q %q", parent, node)
	}
	apply("# app/web: Web\nlevel: component · under: app · path: src/web\n\n! No inline styles\n! Server components by default\n")
	if changed, _, _ := wedge.FileContext(store, project.ID, "s1", file); !strings.Contains(changed, "Server components by default") {
		t.Fatalf("a changed brief is sent again: %q", changed)
	}
	if none, node, err := wedge.FileContext(store, project.ID, "s1", "/elsewhere/readme.md"); err != nil || none != "" || node != "" {
		t.Fatalf("a file no node holds: %q %q %v", none, node, err)
	}
	if first, _, _ := wedge.FileContext(store, project.ID, "", file); first == "" {
		t.Fatal("without a session id the brief is always sent")
	}
}
