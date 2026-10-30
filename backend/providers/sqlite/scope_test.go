package sqlite_test

import (
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/polterware/polterware/backend/domains/knowledge"
	"github.com/polterware/polterware/backend/domains/projects"
	"github.com/polterware/polterware/backend/domains/structure"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestEntityContextsMatchAnyNode(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "scope.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	now := time.Now().UTC()
	if err := store.SaveProject(projects.Project{ID: "p", Name: "p", CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatal(err)
	}
	stamp := now.Format(time.RFC3339)
	for _, row := range [][4]string{{"app", "", "system", "app"}, {"api", "app", "component", "app/api"}, {"web", "", "system", "web"}} {
		var parent any
		if row[1] != "" {
			parent = row[1]
		}
		if _, err := store.DB.Exec(`INSERT INTO structure_nodes(id,project_id,parent_id,level,slug,path,title,created_at,updated_at) VALUES(?,'p',?,?,?,?,?,?,?)`,
			row[0], parent, row[2], row[0], row[3], row[0], stamp, stamp); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range []string{"both", "web-only", "none"} {
		if err := store.SaveKnowledge(knowledge.Item{ID: id, ProjectID: "p", Title: id, Kind: knowledge.KindDoc, DocType: knowledge.DocTypeDoc, CreatedAt: now, UpdatedAt: now}); err != nil {
			t.Fatal(err)
		}
	}
	if err := store.SetScope("p", storepkg.ScopeKnowledge, "both", []string{"web", "api", "api"}); err != nil {
		t.Fatal(err)
	}
	if err := store.SetScope("p", storepkg.ScopeKnowledge, "web-only", []string{"web"}); err != nil {
		t.Fatal(err)
	}
	if err := store.SetScope("p", storepkg.ScopeKnowledge, "none", []string{"missing"}); err == nil {
		t.Fatal("an unknown node was accepted")
	}
	scopes, err := store.ScopeMap("p", storepkg.ScopeKnowledge)
	if err != nil || !slices.Equal(scopes["both"], []string{"api", "web"}) || len(scopes["none"]) != 0 {
		t.Fatalf("scopes = %v err = %v", scopes, err)
	}
	// A filter on app keeps the doc with one context under it and the doc with none.
	resolved, err := store.LoadScopes("p", structure.MultiScope{NodeIDs: []string{"app"}})
	if err != nil {
		t.Fatal(err)
	}
	var kept []string
	for _, id := range []string{"both", "web-only", "none"} {
		if resolved.MatchesAny(scopes[id]) {
			kept = append(kept, id)
		}
	}
	if !slices.Equal(kept, []string{"both", "none"}) {
		t.Fatalf("kept = %v", kept)
	}
	// An empty list clears the contexts: the doc is about the whole project again.
	if err := store.SetScope("p", storepkg.ScopeKnowledge, "both", nil); err != nil {
		t.Fatal(err)
	}
	if scopes, _ = store.ScopeMap("p", storepkg.ScopeKnowledge); len(scopes["both"]) != 0 {
		t.Fatalf("cleared scopes = %v", scopes)
	}
}
