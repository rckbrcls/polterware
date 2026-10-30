package localcore

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/compositions/wedge"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestCheckDriftNarrowHappyPath(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "go.mod"), []byte("module github.com/acme/demo\n\ngo 1.23\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	store, err := storepkg.New(filepath.Join(t.TempDir(), "check-drift.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	project, err := wedge.InitProject(store, wedge.InitInput{
		Name:     "Demo",
		RootPath: root,
	})
	if err != nil {
		t.Fatal(err)
	}

	core := NewCore(store, "test-token")
	response, err := core.CheckDrift(context.Background(), connect.NewRequest(&localv1.CheckDriftRequest{
		ProjectId: project.ID,
	}))
	if err != nil {
		t.Fatal(err)
	}
	if response.Msg.Checker != "narrow" {
		t.Fatalf("checker: got %q want narrow", response.Msg.Checker)
	}
	if response.Msg.ProjectId != project.ID {
		t.Fatalf("project_id: got %q want %q", response.Msg.ProjectId, project.ID)
	}
	if response.Msg.Status == "" {
		t.Fatal("expected non-empty status")
	}
	if response.Msg.Findings == nil {
		t.Fatal("expected findings slice (may be empty)")
	}
}

func TestCheckDriftRequiresProjectID(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "check-drift-empty.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	core := NewCore(store, "test-token")
	_, err = core.CheckDrift(context.Background(), connect.NewRequest(&localv1.CheckDriftRequest{}))
	if err == nil {
		t.Fatal("expected error for empty project id")
	}
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Fatalf("code: got %v want InvalidArgument", connect.CodeOf(err))
	}
}
