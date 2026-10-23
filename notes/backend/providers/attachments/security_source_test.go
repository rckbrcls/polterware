package attachments

import (
	"io"
	"os"
	"path/filepath"
	"testing"
)

func TestSourceOpenPinsAncestorsAndRejectsSymlinks(t *testing.T) {
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	sourceDir := filepath.Join(root, "source")
	if err := os.Mkdir(sourceDir, 0700); err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(sourceDir, "note.txt")
	if err := os.WriteFile(source, []byte("safe"), 0600); err != nil {
		t.Fatal(err)
	}
	file, err := openSource(source)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if err := os.Rename(sourceDir, sourceDir+"-old"); err != nil {
		t.Fatal(err)
	}
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "note.txt"), []byte("private"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, sourceDir); err != nil {
		t.Fatal(err)
	}
	data, err := io.ReadAll(file)
	if err != nil || string(data) != "safe" {
		t.Fatalf("descriptor redirected: %q %v", data, err)
	}
	for _, path := range []string{source, root + "/source-old/../source/note.txt", "relative.txt"} {
		f, err := openSource(path)
		if err == nil {
			f.Close()
			t.Fatalf("accepted unsafe source %q", path)
		}
	}
	store, err := New(nil, root)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.ImportFile(t.Context(), testNoteID, testAttachmentID, source); err == nil {
		t.Fatal("ingested a symlink ancestor")
	}
}
