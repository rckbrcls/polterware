package attachments_test

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/polterware/polterware/notes/backend/compositions/core"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/note"
)

func TestCoreAttachmentAuditAndRecoveryBeforeImport(t *testing.T) {
	ctx := context.Background()
	data := t.TempDir()
	db := filepath.Join(data, "notes.db")
	runtime, err := core.OpenRuntime(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	m, err := runtime.Services.Notes.Create(ctx, actor.UI(), note.Create{Title: "Attachments"})
	if err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(data, "source")
	if err = os.WriteFile(source, []byte("hello"), 0600); err != nil {
		t.Fatal(err)
	}
	service := runtime.Services.Attachments
	file, err := service.ImportFromPath(ctx, m.ID, source, "", m.Rev)
	if err != nil {
		t.Fatal(err)
	}
	duplicate, err := service.ImportFromPath(ctx, m.ID, source, "", m.Rev)
	if err != nil || duplicate.ID != file.ID {
		t.Fatalf("dedup: %+v %v", duplicate, err)
	}
	link, err := service.AddLink(ctx, m.ID, "https://example.com/", "Example", m.Rev)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.Reorder(ctx, m.ID, []string{link.ID, file.ID}); err != nil {
		t.Fatal(err)
	}
	if err = service.Delete(ctx, link.ID); err != nil {
		t.Fatal(err)
	}
	page, err := runtime.Services.Activity.List(ctx, "", "", 100)
	if err != nil {
		t.Fatal(err)
	}
	counts := map[string]int{}
	for _, event := range page.Events {
		if event.Entity == "attachment" {
			counts[event.Op]++
			if event.Actor != "ui" {
				t.Fatalf("incorrect audit actor: %+v", event)
			}
		}
	}
	if counts["create"] != 2 || counts["update"] != 1 || counts["delete"] != 1 {
		t.Fatalf("audit (dedup must be silent): %v", counts)
	}
	if err = runtime.Close(); err != nil {
		t.Fatal(err)
	}
	// Simulate a crash: one committed row lost its file, one file lacks a row,
	// and the temporary copy never reached its final rename.
	dir := filepath.Join(data, "attachments", m.ID)
	if err = os.Remove(filepath.Join(data, "attachments", *file.RelPath)); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{".import-crashed", "orphan.bin"} {
		if err = os.WriteFile(filepath.Join(dir, name), []byte("orphan"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	outside := filepath.Join(data, "outside")
	if err = os.Mkdir(outside, 0700); err != nil {
		t.Fatal(err)
	}
	victim := filepath.Join(outside, "private")
	if err = os.WriteFile(victim, []byte("private"), 0600); err != nil {
		t.Fatal(err)
	}
	if err = os.Symlink(outside, filepath.Join(data, "attachments", "symlink")); err != nil {
		t.Fatal(err)
	}
	runtime, err = core.OpenRuntime(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	defer runtime.Close()
	imported, err := runtime.Services.Attachments.ImportFromPath(ctx, m.ID, source, "", m.Rev)
	if err != nil {
		t.Fatal(err)
	}
	if imported.ID == file.ID {
		t.Fatal("recovery deduplicated against missing file")
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 {
		t.Fatalf("recovery left orphans: %v %v", entries, err)
	}
	if content, err := os.ReadFile(victim); err != nil || string(content) != "private" {
		t.Fatalf("sweep followed symlink: %q %v", content, err)
	}
	page, err = runtime.Services.Activity.List(ctx, "", "system", 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Events) != 1 || page.Events[0].EntityID != file.ID || page.Events[0].Op != "delete" {
		t.Fatalf("missing recovery audit: %+v", page.Events)
	}
}

func TestCoreConcurrentFirstImportsPreserveEveryFile(t *testing.T) {
	ctx := context.Background()
	data := t.TempDir()
	runtime, err := core.OpenRuntime(ctx, filepath.Join(data, "notes.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer runtime.Close()
	m, err := runtime.Services.Notes.Create(ctx, actor.UI(), note.Create{Title: "Concurrent attachments"})
	if err != nil {
		t.Fatal(err)
	}
	const count = 8
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < count; i++ {
		src := filepath.Join(data, fmt.Sprint(i))
		if err = os.WriteFile(src, []byte(fmt.Sprint(i)), 0600); err != nil {
			t.Fatal(err)
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if _, err := runtime.Services.Attachments.ImportFromPath(ctx, m.ID, src, "", m.Rev); err != nil {
				t.Error(err)
			}
		}()
	}
	close(start)
	wg.Wait()
	rows, err := runtime.Services.Attachments.List(ctx, m.ID)
	if err != nil || len(rows) != count {
		t.Fatalf("concurrent rows: %d, %v", len(rows), err)
	}
	for _, row := range rows {
		if _, err := runtime.Services.Attachments.OpenInfo(ctx, row.ID); err != nil {
			t.Fatalf("initialization swept imported file: %v", err)
		}
	}
}
