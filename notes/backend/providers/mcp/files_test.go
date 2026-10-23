package mcp

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAttachPathRejectsEverySymlinkComponent(t *testing.T) {
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(root, "real")
	if err := os.Mkdir(dir, 0700); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(dir, "note.txt")
	if err := os.WriteFile(file, []byte("note"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(dir, filepath.Join(root, "linked-dir")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(file, filepath.Join(root, "linked-file")); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, path string
		valid      bool
	}{
		{"regular", file, true},
		{"directory symlink", filepath.Join(root, "linked-dir", "note.txt"), false},
		{"directory symlink with dot", root + "/linked-dir/./note.txt", false},
		{"file symlink", filepath.Join(root, "linked-file"), false},
		{"traversal", dir + "/../real/note.txt", false},
		{"relative", "note.txt", false},
		{"directory", dir, false},
		{"missing", filepath.Join(root, "missing"), false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := checkAttachPath(tc.path); (err == nil) != tc.valid {
				t.Fatalf("valid=%v: %v", tc.valid, err)
			}
		})
	}
}
