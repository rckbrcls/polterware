package seed_test

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/providers/seed"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func newSeeded(t *testing.T) *storepkg.Store {
	t.Helper()
	if seed.DetectRoot() == "" {
		t.Skip("tests must run inside the Polterware checkout")
	}
	store, err := storepkg.New(filepath.Join(t.TempDir(), "seed.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	if err := seed.Defaults(store); err != nil {
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

func TestDefaultsCreatesPolterwareAndEmptyProjects(t *testing.T) {
	store := newSeeded(t)
	project, err := store.GetProject(seed.ProjectID)
	if err != nil {
		t.Fatalf("Polterware project missing: %v", err)
	}
	if project.Name != "Polterware" || project.RootPath != seed.DetectRoot() {
		t.Fatalf("project = %+v", project)
	}
	if _, err := store.GetProject(seed.EmptyProjectID); err != nil {
		t.Fatalf("empty project missing: %v", err)
	}
	if n := count(t, store, `SELECT COUNT(*) FROM work_cards WHERE project_id=?`, seed.EmptyProjectID); n != 0 {
		t.Fatalf("empty project has %d cards", n)
	}
}

func TestPolterwareContentIsReal(t *testing.T) {
	store := newSeeded(t)
	for _, stage := range []string{"shape", "plan", "build", "verify", "delivered"} {
		if n := count(t, store, `SELECT COUNT(*) FROM work_cards WHERE project_id=? AND stage=? AND status='active'`, seed.ProjectID, stage); n == 0 {
			t.Errorf("no card in stage %q", stage)
		}
	}
	// Decision-0001..0005 and the five principles are seeded as active.
	if n := count(t, store, `SELECT COUNT(*) FROM knowledge_items WHERE project_id=? AND kind='decision'`, seed.ProjectID); n != 15 {
		t.Errorf("want 15 Decisions, got %d", n)
	}
	if n := count(t, store, `SELECT COUNT(*) FROM knowledge_items WHERE project_id=? AND kind='decision' AND status='active'`, seed.ProjectID); n != 10 {
		t.Errorf("want 10 active Decisions, got %d", n)
	}
	// A decision with no contexts is a principle: the five pinned ones and Decision-0004.
	if n := count(t, store, `SELECT COUNT(*) FROM knowledge_items k WHERE k.project_id=? AND k.kind='decision'
		AND NOT EXISTS (SELECT 1 FROM entity_contexts c WHERE c.entity_id=k.id)`, seed.ProjectID); n != 6 {
		t.Errorf("want 6 principles, got %d", n)
	}
	if n := count(t, store, `SELECT COUNT(*) FROM structure_nodes WHERE project_id=?`, seed.ProjectID); n < 10 {
		t.Errorf("want a Structure of Polterware, got %d nodes", n)
	}
	if n := count(t, store, `SELECT COUNT(*) FROM canon_facts WHERE project_id=?`, seed.ProjectID); n == 0 {
		t.Error("want facts")
	}
	if n := count(t, store, `SELECT COUNT(*) FROM work_invariants wi JOIN work_cards wc ON wc.id=wi.card_id WHERE wc.project_id=?`, seed.ProjectID); n == 0 {
		t.Error("want card invariants")
	}
}

func TestNoMockContentRemains(t *testing.T) {
	store := newSeeded(t)
	for _, table := range []string{"integration_connections"} {
		if n := count(t, store, `SELECT COUNT(*) FROM `+table); n != 0 {
			t.Errorf("%s has %d mock rows", table, n)
		}
	}
	for _, word := range []string{"example-api", "stripe", "redis", "prod-postgres", "payment service", "demo"} {
		pattern := "%" + strings.ToLower(word) + "%"
		if n := count(t, store, `SELECT COUNT(*) FROM knowledge_items WHERE lower(title||body||summary) LIKE ?`, pattern); n != 0 {
			t.Errorf("knowledge mentions mock word %q", word)
		}
		if n := count(t, store, `SELECT COUNT(*) FROM work_cards WHERE lower(title||intent) LIKE ?`, pattern); n != 0 {
			t.Errorf("cards mention mock word %q", word)
		}
	}
}

func TestDefaultsIsIdempotent(t *testing.T) {
	store := newSeeded(t)
	tables := []string{"projects", "environments", "knowledge_items", "work_cards", "work_tasks", "structure_nodes", "canon_facts"}
	before := map[string]int{}
	for _, table := range tables {
		before[table] = count(t, store, `SELECT COUNT(*) FROM `+table)
	}
	if err := seed.Defaults(store); err != nil {
		t.Fatal(err)
	}
	for _, table := range tables {
		if after := count(t, store, `SELECT COUNT(*) FROM `+table); after != before[table] {
			t.Errorf("%s changed from %d to %d on a second seed", table, before[table], after)
		}
	}
}

func TestPolterwareStructureIsSeeded(t *testing.T) {
	store := newSeeded(t)
	var count int
	if err := store.DB.QueryRow(`SELECT COUNT(*) FROM structure_nodes WHERE project_id=?`, seed.ProjectID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count < 30 {
		t.Fatalf("want a real tree, got %d nodes", count)
	}
}
