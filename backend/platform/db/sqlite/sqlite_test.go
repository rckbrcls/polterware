package sqlite

import (
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func TestOpenMigrateVersions(t *testing.T) {
	db, err := Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := Migrate(db); err != nil {
		t.Fatal(err)
	}
	vers, err := AppliedVersions(db)
	if err != nil {
		t.Fatal(err)
	}
	want, err := MigrationVersions()
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(vers, want) {
		t.Fatalf("applied %v, embedded %v", vers, want)
	}
	files, err := os.ReadDir("migrations")
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != len(want) {
		t.Fatalf("disk migrations %d, embedded %d", len(files), len(want))
	}
	// idempotent
	if err := Migrate(db); err != nil {
		t.Fatal(err)
	}
}

func TestMigrateRebuildsIncompatibleProjectsBaseline(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	db, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	if _, err := db.Exec(`
		CREATE TABLE schema_migrations (
			version INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at TEXT NOT NULL
		);
		INSERT INTO schema_migrations(version, name, applied_at) VALUES (1, '0001_first_version.sql', '2026-01-01T00:00:00Z');
		CREATE TABLE projects (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			root_path TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
		INSERT INTO projects(id,name,root_path,created_at,updated_at) VALUES ('p1','Legacy','/tmp','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
	`); err != nil {
		t.Fatal(err)
	}

	if err := Migrate(db); err != nil {
		t.Fatal(err)
	}

	ok, err := projectsBaselineCompatible(db)
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("expected rebuilt projects baseline with status/archived_at")
	}

	var count int
	if err := db.QueryRow(`SELECT COUNT(1) FROM projects`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("expected legacy rows wiped during rebuild, got %d", count)
	}

	if _, err := db.Exec(`INSERT INTO projects(id,name,root_path,created_at,updated_at,status,archived_at) VALUES ('p2','Ok','/tmp','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','active','')`); err != nil {
		t.Fatal(err)
	}
}

func TestPolterFactsMigrationPreservesAllAuditEntitiesAndNodeID(t *testing.T) {
	db, err := Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	entries, err := migrationFS.ReadDir("migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.Name() >= "0032" {
			continue
		}
		body, err := migrationFS.ReadFile("migrations/" + entry.Name())
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(string(body)); err != nil {
			t.Fatalf("%s: %v", entry.Name(), err)
		}
	}
	if _, err := db.Exec(`INSERT INTO projects(id,name,root_path,created_at,updated_at) VALUES('p','Project','/tmp','now','now')`); err != nil {
		t.Fatal(err)
	}
	entities := []string{"card", "task", "question", "invariant", "handoff", "claim", "node", "decision", "canvas", "board"}
	for _, entity := range entities {
		if _, err := db.Exec(`INSERT INTO change_ops(id,project_id,batch_id,entity,entity_id,op,data_json,node_id,created_at) VALUES(?,'p','batch',?,?,'create','{"saved":true}','node-kept','now')`, entity, entity, entity); err != nil {
			t.Fatal(err)
		}
	}
	body, err := migrationFS.ReadFile("migrations/0032_polter_facts.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(body)); err != nil {
		t.Fatal(err)
	}
	for _, entity := range entities {
		var node, data string
		if err := db.QueryRow(`SELECT node_id,data_json FROM change_ops WHERE id=? AND entity=?`, entity, entity).Scan(&node, &data); err != nil || node != "node-kept" || data != `{"saved":true}` {
			t.Fatalf("%s: node=%s data=%s err=%v", entity, node, data, err)
		}
		if _, err := db.Exec(`INSERT INTO change_ops(id,project_id,batch_id,entity,entity_id,op,created_at) VALUES(?,'p','after',?,?,'update','now')`, entity+"-after", entity, entity); err != nil {
			t.Fatalf("entity %s rejected after migration: %v", entity, err)
		}
	}
	if _, err := db.Exec(`INSERT INTO change_ops(id,project_id,batch_id,entity,entity_id,op,created_at) VALUES('fact','p','after','fact','fact-id','create','now')`); err != nil {
		t.Fatal(err)
	}
}

func TestStructureRenameMigrationKeepsRowsAndForeignKeys(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "rename.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	entries, err := migrationFS.ReadDir("migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.Name() >= "0037" {
			continue
		}
		body, err := migrationFS.ReadFile("migrations/" + entry.Name())
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(string(body)); err != nil {
			t.Fatalf("%s: %v", entry.Name(), err)
		}
	}
	seed := []string{
		`INSERT INTO projects(id,name,root_path,created_at,updated_at) VALUES('p','Project','/tmp','now','now')`,
		`INSERT INTO atlas_nodes(id,project_id,parent_id,level,slug,path,title,created_at,updated_at) VALUES('sys','p',NULL,'system','app','app','App','now','now')`,
		`INSERT INTO atlas_nodes(id,project_id,parent_id,level,slug,path,title,created_at,updated_at) VALUES('cmp','p','sys','component','api','app/api','API','now','now')`,
		`INSERT INTO atlas_invariants(id,node_id,text,created_at,updated_at) VALUES('inv','cmp','Stays stateless','now','now')`,
		`INSERT INTO scope_assignments(project_id,item_key,node_id,updated_at) VALUES('p','drift:x','cmp','now')`,
	}
	for _, statement := range seed {
		if _, err := db.Exec(statement); err != nil {
			t.Fatalf("%s: %v", statement, err)
		}
	}
	body, err := migrationFS.ReadFile("migrations/0037_structure_rename.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(body)); err != nil {
		t.Fatal(err)
	}
	for table, want := range map[string]int{"structure_nodes": 2, "structure_invariants": 1, "scope_assignments": 1} {
		var got int
		if err := db.QueryRow(`SELECT COUNT(*) FROM ` + table).Scan(&got); err != nil || got != want {
			t.Fatalf("%s: rows=%d want %d err=%v", table, got, want, err)
		}
	}
	rows, err := db.Query(`PRAGMA foreign_key_check`)
	if err != nil {
		t.Fatal(err)
	}
	if rows.Next() {
		t.Fatal("foreign_key_check reported violations")
	}
	_ = rows.Close()
	var stale int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE name LIKE '%atlas%' OR sql LIKE '%atlas%'`).Scan(&stale); err != nil || stale != 0 {
		t.Fatalf("schema still names atlas: %d err=%v", stale, err)
	}
	var referencing int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND (sql LIKE '%REFERENCES "structure_nodes"%' OR sql LIKE '%REFERENCES structure_nodes%')`).Scan(&referencing); err != nil || referencing < 6 {
		t.Fatalf("tables referencing structure_nodes: %d err=%v", referencing, err)
	}
	if _, err := db.Exec(`INSERT INTO scope_assignments(project_id,item_key,node_id,updated_at) VALUES('p','drift:y','missing','now')`); err == nil {
		t.Fatal("a scope assignment to an unknown node was accepted")
	}
	if _, err := db.Exec(`DELETE FROM structure_nodes WHERE id='sys'`); err != nil {
		t.Fatal(err)
	}
	var left int
	if err := db.QueryRow(`SELECT (SELECT COUNT(*) FROM structure_nodes) + (SELECT COUNT(*) FROM structure_invariants) + (SELECT COUNT(*) FROM scope_assignments)`).Scan(&left); err != nil || left != 0 {
		t.Fatalf("cascade after rename left %d rows, err=%v", left, err)
	}
}
