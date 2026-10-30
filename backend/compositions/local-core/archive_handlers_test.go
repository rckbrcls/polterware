package localcore

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/domains/knowledge"
	"github.com/polterware/polterware/backend/domains/projects"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestKnowledgeArchiveRules(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "archive.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	now := time.Now().UTC()
	project := projects.Project{ID: "proj-archive", Name: "Archive", CreatedAt: now, UpdatedAt: now}
	if err := store.SaveProject(project); err != nil {
		t.Fatal(err)
	}
	for _, item := range []struct{ id, kind string }{{"doc-1", knowledge.KindDoc}, {"dec-1", knowledge.KindDecision}} {
		saved, err := knowledge.NewItem(item.id, project.ID, "Item "+item.id, "body", item.kind, nil)
		if err != nil {
			t.Fatal(err)
		}
		if err := store.SaveKnowledge(saved); err != nil {
			t.Fatal(err)
		}
	}
	core := NewCore(store, "token")
	ctx := context.Background()
	change := &localv1.ChangeEnvelope{Summary: "Archive", Rationale: "No longer current"}
	failed := func(err error) bool {
		var connectErr *connect.Error
		return errors.As(err, &connectErr) && connectErr.Code() == connect.CodeFailedPrecondition
	}

	if _, err := core.SetKnowledgeArchived(ctx, connect.NewRequest(&localv1.SetKnowledgeArchivedRequest{Id: "dec-1", Archived: true, Change: change})); !failed(err) {
		t.Fatalf("archive of a decision: %v", err)
	}
	if _, err := core.DeleteKnowledge(ctx, connect.NewRequest(&localv1.DeleteKnowledgeRequest{Id: "dec-1", Change: change})); !failed(err) {
		t.Fatalf("delete of a decision: %v", err)
	}
	if _, err := core.DeleteKnowledge(ctx, connect.NewRequest(&localv1.DeleteKnowledgeRequest{Id: "doc-1", Change: change})); !failed(err) {
		t.Fatalf("delete of an active item: %v", err)
	}
	archived, err := core.SetKnowledgeArchived(ctx, connect.NewRequest(&localv1.SetKnowledgeArchivedRequest{Id: "doc-1", Archived: true, Change: change}))
	if err != nil || archived.Msg.GetItem().GetArchivedAt() == "" {
		t.Fatalf("archive: err=%v item=%+v", err, archived)
	}
	_, err = core.SaveKnowledge(ctx, connect.NewRequest(&localv1.SaveKnowledgeRequest{
		Item:   &localv1.KnowledgeItem{Id: "doc-1", ProjectId: project.ID, Title: "Edited", Kind: knowledge.KindDoc},
		Change: change,
	}))
	if !failed(err) {
		t.Fatalf("edit of an archived item: %v", err)
	}
	listed, err := core.ListKnowledge(ctx, connect.NewRequest(&localv1.ListKnowledgeRequest{ProjectId: project.ID, Archived: true}))
	if err != nil || len(listed.Msg.GetItems()) != 1 || listed.Msg.GetItems()[0].GetId() != "doc-1" {
		t.Fatalf("archived list: err=%v items=%+v", err, listed)
	}
	if _, err := core.DeleteKnowledge(ctx, connect.NewRequest(&localv1.DeleteKnowledgeRequest{Id: "doc-1", Change: change})); err != nil {
		t.Fatal(err)
	}
}
