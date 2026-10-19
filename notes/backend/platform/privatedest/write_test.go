package privatedest

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWriteRejectsTraversalLinksAndOverwrite(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	victim := filepath.Join(outside, "victim")
	if err := os.WriteFile(victim, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "linked")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(victim, filepath.Join(root, "symlink")); err != nil {
		t.Fatal(err)
	}
	if err := os.Link(victim, filepath.Join(root, "hardlink")); err != nil {
		t.Fatal(err)
	}
	write := func(f *os.File) error { _, err := f.WriteString("private"); return err }
	for _, path := range []string{"relative.zip", root + "/../escape.zip", filepath.Join(root, "linked", "escape.zip"), filepath.Join(root, "symlink"), filepath.Join(root, "hardlink"), victim} {
		if _, err := Write(t.Context(), path, write); err == nil {
			t.Fatalf("accepted unsafe output %q", path)
		}
	}
	data, _ := os.ReadFile(victim)
	if string(data) != "keep" {
		t.Fatal("replaced existing file")
	}
	dest := filepath.Join(root, "new", "export.zip")
	if _, err := Write(t.Context(), dest, write); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(dest)
	if err != nil || info.Mode().Perm() != 0600 {
		t.Fatalf("output permissions: %v %v", info, err)
	}
	entries, _ := os.ReadDir(filepath.Dir(dest))
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".notes-output-") {
			t.Fatal("staging file leaked")
		}
	}
}
