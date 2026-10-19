package db

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDatabaseStorageIsPrivate(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "notes.db")
	if err := os.WriteFile(path, nil, 0644); err != nil {
		t.Fatal(err)
	}
	h, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	if _, err := h.Writer().ExecContext(t.Context(), `CREATE TABLE security_probe(id TEXT)`); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(root)
	if err != nil || info.Mode().Perm() != 0700 {
		t.Fatalf("database directory mode: %v %v", info, err)
	}
	for _, file := range []string{path, path + "-wal", path + "-shm"} {
		info, err := os.Stat(file)
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm() != 0600 {
			t.Fatalf("%s permissions: %o", file, info.Mode().Perm())
		}
	}
	shared, err := os.MkdirTemp("", "notes-shared-security-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(shared)
	if err := os.Chmod(shared, 0755); err != nil {
		t.Fatal(err)
	}
	h2, err := Open(filepath.Join(shared, "new.db"))
	if err != nil {
		t.Fatal(err)
	}
	h2.Close()
	info, _ = os.Stat(shared)
	if info.Mode().Perm() != 0700 {
		t.Fatal("did not tighten a directory inside the private temp tree")
	}
}
