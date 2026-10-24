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
