package attachments

import (
	"context"
	domain "github.com/polterware/polterware/notes/backend/domains/attachments"
	"os"
	"path/filepath"
	"testing"
)

type growingSourceContext struct {
	context.Context
	calls int
	grow  func()
}

func (ctx *growingSourceContext) Err() error {
	ctx.calls++
	if ctx.calls == 2 {
		ctx.grow()
	}
	return ctx.Context.Err()
}
func TestAgentBudgetAppliesWhileSourceGrows(t *testing.T) {
	root := t.TempDir()
	store, err := New(nil, root)
	if err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(root, "source.txt")
	if err := os.WriteFile(source, []byte("small"), 0600); err != nil {
		t.Fatal(err)
	}
	ctx := &growingSourceContext{Context: domain.WithImportLimit(t.Context(), 100), grow: func() {
		if err := os.WriteFile(source, make([]byte, 200), 0600); err != nil {
			t.Fatal(err)
		}
	}}
	if _, err := store.ImportFile(ctx, testNoteID, testAttachmentID, source); err == nil {
		t.Fatal("growing source escaped its caller's copy budget")
	}
	entries, err := os.ReadDir(filepath.Join(root, "attachments", testNoteID))
	if err != nil && !os.IsNotExist(err) {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatal("oversized copy was published")
	}
}
