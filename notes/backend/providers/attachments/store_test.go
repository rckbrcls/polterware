package attachments

import (
	"context"
	domain "github.com/polterware/polterware/notes/backend/domains/attachments"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

const testNoteID = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
const testAttachmentID = "01ARZ3NDEKTSV4RRFFQ69G5FAW"

func TestImportFileSafetyAndCrashShape(t *testing.T) {
	root := t.TempDir()
	s, err := New(nil, root)
	if err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(root, "../input.txt")
	if err = os.WriteFile(source, []byte("hello"), 0600); err != nil {
		t.Fatal(err)
	}
	got, err := s.ImportFile(context.Background(), testNoteID, testAttachmentID, source)
	if err != nil {
		t.Fatal(err)
	}
	if filepath.IsAbs(got.RelPath) || filepath.Base(got.RelPath) == "input.txt" {
		t.Fatalf("path includes source name: %q", got.RelPath)
	}
	if _, err = os.Stat(filepath.Join(root, "attachments", got.RelPath)); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(filepath.Join(root, "attachments", testNoteID))
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name()[0] == '.' {
		t.Fatalf("temporary file remained after import: %v", entries)
	}
	if _, err = s.ImportFile(context.Background(), "../../escape", testAttachmentID, source); err == nil {
		t.Fatal("traversal ID accepted")
	}
	if _, err = s.ImportFile(context.Background(), testNoteID, "../../escape", source); err == nil {
		t.Fatal("absolute/traversal ID accepted")
	}
	link := filepath.Join(root, "link")
	if err = os.Symlink(source, link); err != nil {
		t.Fatal(err)
	}
	if _, err = s.ImportFile(context.Background(), testNoteID, testAttachmentID, link); err == nil {
		t.Fatal("symlink accepted")
	}
	large := filepath.Join(root, "large")
	f, err := os.Create(large)
	if err != nil {
		t.Fatal(err)
	}
	if err = f.Truncate(500<<20 + 1); err != nil {
		t.Fatal(err)
	}
	f.Close()
	if _, err = s.ImportFile(context.Background(), testNoteID, testAttachmentID, large); err == nil {
		t.Fatal("oversized file accepted")
	}
}

func TestConcurrentImportsUseIndependentTemporaryFiles(t *testing.T) {
	root := t.TempDir()
	s, err := New(nil, root)
	if err != nil {
		t.Fatal(err)
	}
	src := filepath.Join(root, "src")
	if err = os.WriteFile(src, []byte("concurrent"), 0600); err != nil {
		t.Fatal(err)
	}
	ids := []string{"01ARZ3NDEKTSV4RRFFQ69G5FAW", "01ARZ3NDEKTSV4RRFFQ69G5FAX", "01ARZ3NDEKTSV4RRFFQ69G5FAY", "01ARZ3NDEKTSV4RRFFQ69G5FAZ"}
	var wg sync.WaitGroup
	errs := make(chan error, len(ids))
	for _, id := range ids {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			_, e := s.ImportFile(context.Background(), testNoteID, id, src)
			errs <- e
		}(id)
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
}

func TestStoreRejectsSymlinkAncestorsForEveryFileOperation(t *testing.T) {
	for _, ancestor := range []string{"attachments", testNoteID} {
		t.Run(ancestor, func(t *testing.T) {
			data, outside := t.TempDir(), t.TempDir()
			s, err := New(nil, data)
			if err != nil {
				t.Fatal(err)
			}
			target := filepath.Join(data, "attachments")
			if ancestor == testNoteID {
				target = filepath.Join(target, testNoteID)
			} else if err = os.Remove(target); err != nil {
				t.Fatal(err)
			}
			if err = os.Symlink(outside, target); err != nil {
				t.Fatal(err)
			}
			source := filepath.Join(data, "input")
			if err = os.WriteFile(source, []byte("hello"), 0600); err != nil {
				t.Fatal(err)
			}
			victim := filepath.Join(outside, testAttachmentID+".bin")
			if err = os.WriteFile(victim, []byte("private"), 0600); err != nil {
				t.Fatal(err)
			}
			rel := filepath.Join(testNoteID, testAttachmentID+".bin")
			if _, err = s.ImportFile(context.Background(), testNoteID, testAttachmentID, source); err == nil {
				t.Fatal("import followed symlink ancestor")
			}
			if _, err = s.AbsolutePath(rel); err == nil {
				t.Fatal("AbsolutePath followed symlink ancestor")
			}
			if err = s.RemoveFile(context.Background(), rel); err == nil {
				t.Fatal("delete followed symlink ancestor")
			}
			if got, err := os.ReadFile(victim); err != nil || string(got) != "private" {
				t.Fatalf("victim changed: %q %v", got, err)
			}
			if ancestor == "attachments" {
				if _, err := New(nil, data); err == nil {
					t.Fatal("New followed symlink root")
				}
			}
		})
	}
}

func TestAnchoredDirectorySurvivesAncestorSwap(t *testing.T) {
	data, outside := t.TempDir(), t.TempDir()
	s, err := New(nil, data)
	if err != nil {
		t.Fatal(err)
	}
	dir, err := s.openNote(testNoteID, true)
	if err != nil {
		t.Fatal(err)
	}
	defer dir.Close()
	original := filepath.Join(data, "attachments", testNoteID)
	moved := original + ".moved"
	if err = os.Rename(original, moved); err != nil {
		t.Fatal(err)
	}
	if err = os.Symlink(outside, original); err != nil {
		t.Fatal(err)
	}
	file, name, err := createTemp(dir)
	if err != nil {
		t.Fatal(err)
	}
	file.Close()
	if _, err = os.Stat(filepath.Join(moved, name)); err != nil {
		t.Fatal(err)
	}
	entries, _ := os.ReadDir(outside)
	if len(entries) != 0 {
		t.Fatal("descriptor write escaped to replacement directory")
	}
}

func TestImportNormalizesPreviewMIME(t *testing.T) {
	for _, tc := range []struct {
		name      string
		data      []byte
		mime, ext string
	}{
		{"wave", []byte("RIFF\x00\x00\x00\x00WAVEfmt "), "audio/wav", ".wav"},
		{"webm", []byte{0x1a, 0x45, 0xdf, 0xa3, 0x87, 0x42, 0x82, 0x84, 'w', 'e', 'b', 'm'}, "audio/webm", ".webm"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			data := t.TempDir()
			s, err := New(nil, data)
			if err != nil {
				t.Fatal(err)
			}
			src := filepath.Join(data, "source")
			if err = os.WriteFile(src, tc.data, 0600); err != nil {
				t.Fatal(err)
			}
			got, err := s.ImportFile(context.Background(), testNoteID, testAttachmentID, src)
			if err != nil {
				t.Fatal(err)
			}
			if got.Mime != tc.mime || filepath.Ext(got.RelPath) != tc.ext {
				t.Fatalf("preview: %+v", got)
			}
		})
	}
}

func TestImportAppliesMIMELimitBeforeCompletingCopy(t *testing.T) {
	for _, tc := range []struct {
		name   string
		header []byte
		limit  int64
	}{
		{"photo", []byte("\x89PNG\r\n\x1a\n"), domain.MaxPhotoBytes},
		{"audio", []byte("RIFF\x00\x00\x00\x00WAVEfmt "), domain.MaxAudioBytes},
		{"file", []byte("%PDF-1.7"), domain.MaxFileBytes},
	} {
		t.Run(tc.name, func(t *testing.T) {
			data := t.TempDir()
			s, err := New(nil, data)
			if err != nil {
				t.Fatal(err)
			}
			src := filepath.Join(data, "source")
			f, err := os.Create(src)
			if err != nil {
				t.Fatal(err)
			}
			f.Write(tc.header)
			f.Truncate(tc.limit + 4096)
			f.Close()
			if _, err = s.ImportFile(context.Background(), testNoteID, testAttachmentID, src); err == nil {
				t.Fatal("kind limit ignored")
			}
			entries, err := os.ReadDir(filepath.Join(data, "attachments", testNoteID))
			if err != nil || len(entries) != 0 {
				t.Fatalf("failed import left files: %v %v", entries, err)
			}
		})
	}
}
