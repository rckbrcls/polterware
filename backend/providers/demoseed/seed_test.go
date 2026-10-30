package demoseed_test

import (
	"path/filepath"
	"testing"

	"github.com/polterware/polterware/backend/domains/knowledge"
	"github.com/polterware/polterware/backend/providers/demoseed"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func newSeeded(t *testing.T) *storepkg.Store {
	t.Helper()
	store, err := storepkg.New(filepath.Join(t.TempDir(), "seed.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	if err := demoseed.Defaults(store); err != nil {
		t.Fatalf("Defaults: %v", err)
	}
	return store
}

func count(t *testing.T, store *storepkg.Store, query string, args ...any) int {
	t.Helper()
	var n int
	if err := store.DB.QueryRow(query, args...).Scan(&n); err != nil {
		t.Fatalf("%s: %v", query, err)
	}
	return n
}

func TestDefaultsCreatesPolterAndEmptyProjects(t *testing.T) {
	store := newSeeded(t)
	for _, id := range []string{demoseed.ProjectID, demoseed.EmptyProjectID} {
		if _, err := store.GetProject(id); err != nil {
			t.Fatalf("project %q missing: %v", id, err)
		}
	}
	envs, err := store.ListEnvironments(demoseed.ProjectID)
	if err != nil || len(envs) == 0 {
		t.Fatalf("seeded project needs environments: %v, %v", envs, err)
	}
	defaults := 0
	for _, env := range envs {
		if env.IsDefault {
			defaults++
		}
	}
	if defaults != 1 {
		t.Fatalf("want exactly one default environment, got %d", defaults)
	}
}

func TestDefaultsIsIdempotent(t *testing.T) {
	store := newSeeded(t)
	tables := []string{"projects", "environments", "knowledge_items", "work_cards", "work_tasks", "canon_facts"}
	before := map[string]int{}
	for _, table := range tables {
		before[table] = count(t, store, `SELECT COUNT(*) FROM `+table)
	}
	if err := demoseed.Defaults(store); err != nil {
		t.Fatalf("second Defaults: %v", err)
	}
	for _, table := range tables {
		if after := count(t, store, `SELECT COUNT(*) FROM `+table); after != before[table] {
			t.Errorf("%s changed from %d to %d on a second seed", table, before[table], after)
		}
	}
}

func TestDefaultsDoesNotOverwriteAnExistingDatabase(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "user.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if _, err := store.DB.Exec(`INSERT INTO projects(id,name,root_path,created_at,updated_at,status,archived_at)
		VALUES('proj-user','Mine','/mine','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','active','')`); err != nil {
		t.Fatal(err)
	}
	if err := demoseed.Defaults(store); err != nil {
		t.Fatal(err)
	}
	if n := count(t, store, `SELECT COUNT(*) FROM projects`); n != 1 {
		t.Fatalf("seed must leave a non-empty database alone, projects = %d", n)
	}
}

func TestSeededDecisionsCoverTheLifecycleStates(t *testing.T) {
	store := newSeeded(t)
	decisions, err := store.ListKnowledge(demoseed.ProjectID, "decision")
	if err != nil {
		t.Fatal(err)
	}
	if len(decisions) < 3 {
		t.Fatalf("want at least 3 seeded Decisions, got %d", len(decisions))
	}
	states := map[string]bool{}
	for _, decision := range decisions {
		states[decision.Status] = true
	}
	if !states["active"] || !states["proposed"] {
		t.Fatalf("seed must show active and proposed Decisions, got %v", states)
	}
}

func TestSeedRegistersNoSourceDocs(t *testing.T) {
	store := newSeeded(t)
	items, err := store.ListKnowledge(demoseed.ProjectID, knowledge.KindDoc)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range items {
		if item.DocType != knowledge.DocTypeDoc {
			t.Fatalf("doc %s has type %q: docs have no types", item.ID, item.DocType)
		}
	}
}
func TestEmptyProjectHasNoContent(t *testing.T) {
	store := newSeeded(t)
	for _, table := range []string{"knowledge_items", "work_cards", "canon_facts"} {
		if n := count(t, store, `SELECT COUNT(*) FROM `+table+` WHERE project_id=?`, demoseed.EmptyProjectID); n != 0 {
			t.Errorf("empty project has %d rows in %s", n, table)
		}
	}
}
