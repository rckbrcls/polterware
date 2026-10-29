package sqlite

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
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
	migrateBefore(t, db, "0037")
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
	applyMigration(t, db, "0037_structure_rename.sql")
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

func TestDecisionDocKindsMigration(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "kinds.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	migrateBefore(t, db, "0038")
	seed := []string{
		`INSERT INTO projects(id,name,root_path,created_at,updated_at) VALUES('p','Project','/tmp','now','now')`,
		`INSERT INTO knowledge_items(id,project_id,title,body,kind,tags_json,extra_json,created_at,updated_at) VALUES('d1','p','Verdict 0003: Local store','b','verdict','["verdict","storage"]','{"scope":"principle","reviewTrigger":"x"}','now','now')`,
		`INSERT INTO knowledge_items(id,project_id,title,body,kind,tags_json,extra_json,created_at,updated_at) VALUES('d2','p','ADR 0004: Old name','b','verdict','["adr"]','{}','now','now')`,
		`INSERT INTO knowledge_items(id,project_id,title,body,kind,tags_json,created_at,updated_at) VALUES('k1','p','Guide','b','evidence','["doc","ops"]','now','now')`,
		`INSERT INTO knowledge_items(id,project_id,title,body,kind,tags_json,created_at,updated_at) VALUES('k2','p','Failover','b','evidence','["runbook"]','now','now')`,
		`INSERT INTO knowledge_items(id,project_id,title,body,kind,tags_json,created_at,updated_at,archived_at) VALUES('k3','p','go.mod','','evidence','["source"]','now','now','2026-01-01T00:00:00Z')`,
		`INSERT INTO knowledge_items(id,project_id,title,body,kind,tags_json,created_at,updated_at) VALUES('k4','p','Untagged','b','evidence','[]','now','now')`,
		`INSERT INTO knowledge_items(id,project_id,title,body,kind,tags_json,created_at,updated_at) VALUES('src-import-1','p','go.mod','','evidence','null','now','now')`,
		`INSERT INTO canon_entities(id,project_id,kind,ref_kind,ref_id,title,observed_at,created_at,updated_at) VALUES('e','p','component','architecture_node','n','API','now','now','now')`,
		`INSERT INTO knowledge_entity_links(id,project_id,knowledge_id,entity_id,predicate,observed_at,created_at) VALUES('l','p','k1','e','DOCUMENTS','now','now')`,
		`INSERT INTO work_cards(id,project_id,slug,title,decisions_json,created_at,updated_at) VALUES('c','p','card','Card','["Verdict-3","d1","ADR 0004","Decision-0009"]','now','now')`,
		`INSERT INTO structure_nodes(id,project_id,level,slug,path,title,decisions_json,created_at,updated_at) VALUES('n','p','system','app','app','App','["verdict_12"]','now','now')`,
	}
	for _, statement := range seed {
		if _, err := db.Exec(statement); err != nil {
			t.Fatalf("%s: %v", statement, err)
		}
	}
	applyMigration(t, db, "0038_decision_doc_kinds.sql")

	type row struct{ kind, docType, title, tags, extra string }
	want := map[string]row{
		"d1": {"decision", "", "Decision 0003: Local store", `["storage"]`, `{"reviewTrigger":"x","level":"principle"}`},
		"d2": {"decision", "", "Decision 0004: Old name", `[]`, `{}`},
		"k1": {"doc", "doc", "Guide", `["ops"]`, `{}`},
		"k2": {"doc", "runbook", "Failover", `[]`, `{}`},
		"k3": {"doc", "source", "go.mod", `[]`, `{}`},
		"k4": {"doc", "doc", "Untagged", `[]`, `{}`},
		// Older imports wrote JSON null tags; the importer id marks them as sources.
		"src-import-1": {"doc", "source", "go.mod", `[]`, `{}`},
	}
	for id, w := range want {
		var got row
		if err := db.QueryRow(`SELECT kind,doc_type,title,tags_json,extra_json FROM knowledge_items WHERE id=?`, id).Scan(&got.kind, &got.docType, &got.title, &got.tags, &got.extra); err != nil {
			t.Fatalf("%s: %v", id, err)
		}
		if got != w {
			t.Errorf("%s = %+v, want %+v", id, got, w)
		}
	}
	var links, fts int
	if err := db.QueryRow(`SELECT COUNT(*) FROM knowledge_entity_links`).Scan(&links); err != nil || links != 1 {
		t.Fatalf("links = %d err=%v", links, err)
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM knowledge_fts`).Scan(&fts); err != nil || fts != 6 {
		t.Fatalf("fts rows = %d (archived items stay out), err=%v", fts, err)
	}
	var card, node string
	if err := db.QueryRow(`SELECT decisions_json FROM work_cards WHERE id='c'`).Scan(&card); err != nil || card != `["Decision-0003","d1","Decision-0004","Decision-0009"]` {
		t.Fatalf("card decisions = %s err=%v", card, err)
	}
	if err := db.QueryRow(`SELECT decisions_json FROM structure_nodes WHERE id='n'`).Scan(&node); err != nil || node != `["Decision-0012"]` {
		t.Fatalf("node decisions = %s err=%v", node, err)
	}
	if _, err := db.Exec(`INSERT INTO knowledge_items(id,project_id,title,body,kind,doc_type,created_at,updated_at) VALUES('x','p','Bad','b','decision','runbook','now','now')`); err == nil {
		t.Fatal("a decision with a doc type was accepted")
	}
	rows, err := db.Query(`PRAGMA foreign_key_check`)
	if err != nil {
		t.Fatal(err)
	}
	if rows.Next() {
		t.Fatal("foreign_key_check reported violations")
	}
	_ = rows.Close()
}

// migrateBefore applies the embedded migrations whose names sort before prefix.
func TestStructureKindTechMigration(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "kind-tech.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	migrateBefore(t, db, "0039")
	for _, stmt := range []string{
		`INSERT INTO projects(id,name,root_path,created_at,updated_at) VALUES('p','Project','/tmp','now','now')`,
		`INSERT INTO structure_nodes(id,project_id,level,slug,path,title,created_at,updated_at) VALUES('n1','p','component','db','db','DB','now','now')`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatal(err)
		}
	}
	applyMigration(t, db, "0039_structure_kind_tech.sql")
	var kind, tech string
	var count int
	if err := db.QueryRow(`SELECT kind, tech, (SELECT COUNT(*) FROM structure_nodes) FROM structure_nodes WHERE id='n1'`).Scan(&kind, &tech, &count); err != nil {
		t.Fatal(err)
	}
	if kind != "" || tech != "" || count != 1 {
		t.Fatalf("kind=%q tech=%q count=%d", kind, tech, count)
	}
	if _, err := db.Exec(`UPDATE structure_nodes SET kind='database', tech='Postgres' WHERE id='n1'`); err != nil {
		t.Fatal(err)
	}
	if rows, err := db.Query(`PRAGMA foreign_key_check`); err != nil {
		t.Fatal(err)
	} else {
		defer rows.Close()
		if rows.Next() {
			t.Fatal("foreign key violations after 0039")
		}
	}
}

func TestMilestonesMigration(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "milestones.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	migrateBefore(t, db, "0040")
	for _, stmt := range []string{
		`INSERT INTO projects(id,name,root_path,created_at,updated_at) VALUES('p','Project','/tmp','now','now')`,
		`INSERT INTO work_boards(id,project_id,name,position,config_json,created_at,updated_at) VALUES('b1','p','Public Beta',0,'{"version":1}','now','now')`,
		`INSERT INTO work_boards(id,project_id,name,position,config_json,created_at,updated_at) VALUES('b2','p','public beta',1,'{"version":1}','now','now')`,
		`INSERT INTO work_cards(id,project_id,slug,title,created_at,updated_at) VALUES('c1','p','signup','Signup','now','now')`,
		`INSERT INTO change_ops(id,project_id,batch_id,entity,entity_id,op,created_at) VALUES('o1','p','batch','board','b1','create','now')`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatal(err)
		}
	}
	applyMigration(t, db, "0040_milestones.sql")
	rows, err := db.Query(`SELECT id, slug, state, position FROM milestones ORDER BY position`)
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for rows.Next() {
		var id, slug, state string
		var position int
		if err := rows.Scan(&id, &slug, &state, &position); err != nil {
			t.Fatal(err)
		}
		got = append(got, fmt.Sprintf("%s=%s/%s/%d", id, slug, state, position))
	}
	rows.Close()
	if strings.Join(got, " ") != "b1=public-beta/active/0 b2=public-beta-b2/active/1" {
		t.Fatalf("milestones = %v", got)
	}
	var entity string
	if err := db.QueryRow(`SELECT entity FROM change_ops WHERE id='o1'`).Scan(&entity); err != nil || entity != "milestone" {
		t.Fatalf("board history = %q, err=%v", entity, err)
	}
	if _, err := db.Exec(`UPDATE work_cards SET milestone_id='b1' WHERE id='c1'`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE work_cards SET milestone_id='missing' WHERE id='c1'`); err == nil {
		t.Fatal("milestone_id must reference a milestone")
	}
	if _, err := db.Exec(`DELETE FROM milestones WHERE id='b1'`); err != nil {
		t.Fatal(err)
	}
	var milestone sql.NullString
	if err := db.QueryRow(`SELECT milestone_id FROM work_cards WHERE id='c1'`).Scan(&milestone); err != nil || milestone.Valid {
		t.Fatalf("a deleted milestone leaves the card in the Backlog: %v, err=%v", milestone, err)
	}
	var tables int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE name='work_boards'`).Scan(&tables); err != nil || tables != 0 {
		t.Fatalf("work_boards should be gone: %d, err=%v", tables, err)
	}
}

func migrateBefore(t *testing.T, db *sql.DB, prefix string) {
	t.Helper()
	entries, err := migrationFS.ReadDir("migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.Name() >= prefix {
			continue
		}
		applyMigration(t, db, entry.Name())
	}
}

func applyMigration(t *testing.T, db *sql.DB, name string) {
	t.Helper()
	body, err := migrationFS.ReadFile("migrations/" + name)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(body)); err != nil {
		t.Fatalf("%s: %v", name, err)
	}
}
