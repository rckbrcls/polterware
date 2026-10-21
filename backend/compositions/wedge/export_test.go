package wedge_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/knowledge"
	"github.com/polterware/polterware/backend/domains/projection"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

const exportGraph = `---
polter: 1
summary: Shop graph
rationale: Export test
---
# shop: Shop
level: system · decisions: Verdict 0001

! Money is integer cents

# shop/auth: Auth
level: domain · repo: api · path: src/auth · decisions: Verdict 0002

! Tokens expire in 15 minutes
`

func TestExportProjections(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "export.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	root, apiDir := t.TempDir(), t.TempDir()
	project, err := wedge.InitProject(store, wedge.InitInput{Name: "Shop", RootPath: root})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := wedge.AddProjectRepo(store, project.ID, "api", apiDir); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	for _, item := range []knowledge.Item{
		{ID: "verdict-cents", Title: "Verdict 0001: Integer cents", Body: "## Decision\n\nStore cents.", Status: "accepted"},
		{ID: "verdict-tokens", Title: "Verdict 0002: Short tokens", Body: "## Decision\n\nShort tokens."},
		{ID: "verdict-hand", Title: "Verdict 0003: Hand written", Body: "From the store."},
	} {
		item.ProjectID, item.Kind, item.CreatedAt, item.UpdatedAt = project.ID, "verdict", now, now
		if err := store.SaveKnowledge(item); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, Text: exportGraph, AutoStartLabel: "cli"}); err != nil {
		t.Fatal(err)
	}

	// A hand-written Verdict with the same number and surrounding AGENTS.md text stay.
	handVerdict := filepath.Join(root, "docs", "verdict", "0003-hand-written.md")
	writeFile(t, handVerdict, "# Verdict 0003: Hand written\n\nOriginal.\n")
	agents := filepath.Join(root, "AGENTS.md")
	writeFile(t, agents, "# Agents\n\n"+projection.BlockBegin+"\nstale\n"+projection.BlockEnd+"\n\n## Tail\nKeep me.\n")

	dry, err := wedge.ExportProjections(store, project.ID, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(dry) == 0 || fileExists(filepath.Join(apiDir, "AGENTS.md")) {
		t.Fatalf("dry run wrote files: %+v", dry)
	}

	files, err := wedge.ExportProjections(store, project.ID, false)
	if err != nil {
		t.Fatal(err)
	}
	if got := readFile(t, handVerdict); got != "# Verdict 0003: Hand written\n\nOriginal.\n" {
		t.Fatalf("hand-written Verdict changed: %q", got)
	}
	if !hasProjection(files, "", "docs/verdict/0003-hand-written.md", wedge.ProjectionSkip) {
		t.Fatalf("hand-written Verdict should be skipped: %+v", files)
	}
	if !strings.Contains(readFile(t, filepath.Join(root, "docs", "verdict", "0001-integer-cents.md")), "Store cents.") {
		t.Fatalf("root Verdict missing")
	}
	if !strings.Contains(readFile(t, filepath.Join(apiDir, "docs", "verdict", "0002-short-tokens.md")), "Short tokens.") {
		t.Fatalf("api Verdict missing")
	}
	if fileExists(filepath.Join(root, "docs", "verdict", "0002-short-tokens.md")) {
		t.Fatalf("Verdict 0002 governs api only")
	}

	rootAgents := readFile(t, agents)
	if strings.Contains(rootAgents, "stale") || !strings.HasPrefix(rootAgents, "# Agents\n\n"+projection.BlockBegin) ||
		!strings.HasSuffix(rootAgents, projection.BlockEnd+"\n\n## Tail\nKeep me.\n") {
		t.Fatalf("root AGENTS.md:\n%s", rootAgents)
	}
	apiAgents := readFile(t, filepath.Join(apiDir, "AGENTS.md"))
	if !strings.Contains(apiAgents, "Tokens expire in 15 minutes (from shop/auth)") || !strings.Contains(apiAgents, "Money is integer cents (from shop)") {
		t.Fatalf("api AGENTS.md:\n%s", apiAgents)
	}

	// Edits in the checkout do not flow back; re-export replaces them.
	writeFile(t, agents, strings.Replace(rootAgents, "Money is integer cents", "Money is floats", 1))
	projected := filepath.Join(root, "docs", "verdict", "0001-integer-cents.md")
	writeFile(t, projected, readFile(t, projected)+"\nLocal edit.\n")
	if _, err := wedge.ExportProjections(store, project.ID, false); err != nil {
		t.Fatal(err)
	}
	if readFile(t, agents) != rootAgents || strings.Contains(readFile(t, projected), "Local edit.") {
		t.Fatalf("re-export must replace checkout edits")
	}
	again, err := wedge.ExportProjections(store, project.ID, false)
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range again {
		if file.Action == wedge.ProjectionWrite {
			t.Fatalf("second export should change nothing: %+v", file)
		}
	}
}

func hasProjection(files []wedge.ProjectionFile, repo, path, action string) bool {
	for _, file := range files {
		if file.Repo == repo && file.Path == path && file.Action == action {
			return true
		}
	}
	return false
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(body)
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
