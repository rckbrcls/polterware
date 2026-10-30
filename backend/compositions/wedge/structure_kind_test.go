package wedge_test

import (
	"path/filepath"
	"testing"

	"github.com/polterware/polterware/backend/compositions/wedge"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestStructureKindAndTechPersist(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "work.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	project, err := wedge.InitProject(store, wedge.InitInput{Name: "Demo"})
	if err != nil {
		t.Fatal(err)
	}
	apply := func(body string) wedge.ApplyResult {
		t.Helper()
		result, err := wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, Text: body, AutoStartLabel: "cli"})
		if err != nil {
			t.Fatal(err)
		}
		return result
	}
	apply(`---
polter: 1
summary: Add the database
rationale: Record what the store is built with
---

# app: App
level: domain

# app/db: Database
level: component
under: app
kind: database
tech: Postgres
`)
	db := nodeByPath(t, store, project.ID, "app/db")
	if db.Kind != "database" || db.Tech != "Postgres" {
		t.Fatalf("node = %+v", db)
	}
	result := apply(`---
polter: 1
summary: Move to SQLite
rationale: The store is local now
---

# app/db: Database
tech: SQLite
`)
	if !result.Applied || len(result.Ops) != 1 {
		t.Fatalf("ops = %+v", result.Ops)
	}
	if db = nodeByPath(t, store, project.ID, "app/db"); db.Kind != "database" || db.Tech != "SQLite" {
		t.Fatalf("node = %+v", db)
	}
}
