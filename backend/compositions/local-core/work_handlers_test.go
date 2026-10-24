package localcore

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/compositions/wedge"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestWorkServiceApplyAndList(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "work.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	project, err := wedge.InitProject(store, wedge.InitInput{Name: "Demo", RootPath: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	core := NewCore(store, "test-token")
	ctx := context.Background()
	change := &localv1.ChangeEnvelope{Summary: "Plan import", Rationale: "Board needs cards"}
	apply := func(text string) (*localv1.ApplyPolterResponse, error) {
		response, err := core.ApplyPolter(ctx, connect.NewRequest(&localv1.ApplyPolterRequest{ProjectId: project.ID, Text: text, Change: change}))
		if err != nil {
			return nil, err
		}
		return response.Msg, nil
	}

	created, err := apply("---\npolter: 1\n---\n## git-import: Git import\nstage: plan\n- [ ] Commit evidence\n? Merge commits? [blocking]\n! No network\n")
	if err != nil || !created.Applied || created.AgentRunId == "" || len(created.Ops) != 4 {
		t.Fatalf("apply: err=%v msg=%+v", err, created)
	}
	run, err := store.GetAgentRunRecord(created.AgentRunId)
	if err != nil || run.Run.ActorKind != "human" {
		t.Fatalf("desktop apply should record a human run: err=%v run=%+v", err, run.Run)
	}

	if _, err := apply("---\npolter: 1\n---\n## git-import\nstage: build\n"); err != nil {
		t.Fatal(err)
	}
	listed, err := core.ListWorkCards(ctx, connect.NewRequest(&localv1.ListWorkCardsRequest{ProjectId: project.ID}))
	if err != nil || len(listed.Msg.Cards) != 1 {
		t.Fatalf("list: err=%v cards=%d", err, len(listed.Msg.GetCards()))
	}
	card := listed.Msg.Cards[0]
	if card.Stage != "build" || len(card.Tasks) != 1 || len(card.Questions) != 1 || len(card.Invariants) != 1 {
		t.Fatalf("card = %+v", card)
	}

	handoff, err := apply("---\npolter: 1\n---\n## git-import\nhandoff:\nbranch: feat/git-import\nagent: codex\ndone: parser\nin_progress: status\nnext: docs\ntouched: docs/spec.md\n")
	if err != nil || !handoff.Applied {
		t.Fatalf("handoff apply: err=%v msg=%+v", err, handoff)
	}
	var entity string
	if err := store.DB.QueryRow(`SELECT entity FROM change_ops WHERE batch_id=? AND entity='handoff'`, handoff.BatchId).Scan(&entity); err != nil || entity != "handoff" {
		t.Fatalf("change_ops handoff: entity=%q err=%v", entity, err)
	}
	queried, err := core.QueryPolter(ctx, connect.NewRequest(&localv1.QueryPolterRequest{ProjectId: project.ID, Query: "handoff git-import"}))
	if err != nil || !strings.Contains(queried.Msg.Text, "branch: feat/git-import") || !strings.Contains(queried.Msg.Text, "Merge commits? [blocking]") {
		t.Fatalf("query handoff: err=%v resp=%+v", err, queried)
	}
	again, err := apply("---\npolter: 1\n---\n## git-import\nhandoff:\nbranch: feat/git-import\nagent: codex\ndone: parser\nin_progress: status\nnext: docs\ntouched: docs/spec.md\n")
	if err != nil || again.Applied || len(again.Ops) != 0 {
		t.Fatalf("re-apply handoff should be a no-op: err=%v msg=%+v", err, again)
	}

	if _, err := apply("---\npolter: 1\n---\n## git-import\nstatus: removed\n"); err != nil {
		t.Fatal(err)
	}
	listed, err = core.ListWorkCards(ctx, connect.NewRequest(&localv1.ListWorkCardsRequest{ProjectId: project.ID}))
	if err != nil || len(listed.Msg.Cards) != 0 {
		t.Fatalf("removed cards must not be listed: err=%v cards=%d", err, len(listed.Msg.GetCards()))
	}

	_, err = apply("---\npolter: 1\n---\n## missing\nstage: plan\n")
	if connect.CodeOf(err) != connect.CodeInvalidArgument || !strings.Contains(err.Error(), "line 4") {
		t.Fatalf("invalid text should be InvalidArgument with a line number: %v", err)
	}
}

func TestWorkBoardHandlersAuditWrites(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "boards.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	project, err := wedge.InitProject(store, wedge.InitInput{Name: "Demo", RootPath: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	core := NewCore(store, "test-token")
	ctx := context.Background()
	change := &localv1.ChangeEnvelope{Summary: "Save a view", Rationale: "The board needs a second grouping"}

	if _, err := core.CreateWorkBoard(ctx, connect.NewRequest(&localv1.CreateWorkBoardRequest{ProjectId: project.ID, Name: "Stage"})); connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Fatalf("create without a change envelope: %v", err)
	}
	created, err := core.CreateWorkBoard(ctx, connect.NewRequest(&localv1.CreateWorkBoardRequest{
		ProjectId: project.ID, Name: " Stage ", ConfigJson: `{"version":1,"group":"stage"}`, Change: change,
	}))
	if err != nil {
		t.Fatal(err)
	}
	if created.Msg.Board.GetName() != "Stage" || created.Msg.Board.GetPosition() != 0 {
		t.Fatalf("create board = %+v", created.Msg.Board)
	}
	second, err := core.CreateWorkBoard(ctx, connect.NewRequest(&localv1.CreateWorkBoardRequest{
		ProjectId: project.ID, Name: "Owners", Change: change,
	}))
	if err != nil {
		t.Fatal(err)
	}
	renamed, err := core.UpdateWorkBoard(ctx, connect.NewRequest(&localv1.UpdateWorkBoardRequest{
		ProjectId: project.ID, Id: second.Msg.Board.Id, Name: "By owner", Change: change,
	}))
	if err != nil {
		t.Fatal(err)
	}
	if renamed.Msg.Board.GetName() != "By owner" || renamed.Msg.Board.GetConfigJson() != `{"version":1}` {
		t.Fatalf("rename board = %+v", renamed.Msg.Board)
	}
	reordered, err := core.ReorderWorkBoards(ctx, connect.NewRequest(&localv1.ReorderWorkBoardsRequest{
		ProjectId: project.ID, BoardIds: []string{second.Msg.Board.Id, created.Msg.Board.Id}, Change: change,
	}))
	if err != nil {
		t.Fatal(err)
	}
	if len(reordered.Msg.Boards) != 2 || reordered.Msg.Boards[0].GetId() != second.Msg.Board.Id || reordered.Msg.Boards[0].GetPosition() != 0 {
		t.Fatalf("reorder boards = %v", reordered.Msg.Boards)
	}
	if _, err := core.DeleteWorkBoard(ctx, connect.NewRequest(&localv1.DeleteWorkBoardRequest{
		ProjectId: project.ID, Id: second.Msg.Board.Id, Change: change,
	})); err != nil {
		t.Fatal(err)
	}
	listed, err := core.ListWorkBoards(ctx, connect.NewRequest(&localv1.ListWorkBoardsRequest{ProjectId: project.ID}))
	if err != nil {
		t.Fatal(err)
	}
	if len(listed.Msg.Boards) != 1 || listed.Msg.Boards[0].GetName() != "Stage" || listed.Msg.Boards[0].GetPosition() != 0 {
		t.Fatalf("list boards = %v", listed.Msg.Boards)
	}
	var creates int
	if err := store.DB.QueryRow(`SELECT COUNT(1) FROM change_ops WHERE project_id=? AND entity='board' AND op='create'`, project.ID).Scan(&creates); err != nil || creates != 2 {
		t.Fatalf("audited creates = %d, err=%v", creates, err)
	}
	var runID string
	if err := store.DB.QueryRow(`SELECT agent_run_id FROM change_ops WHERE project_id=? AND entity='board' LIMIT 1`, project.ID).Scan(&runID); err != nil || runID == "" {
		t.Fatalf("board change_ops run = %q, err=%v", runID, err)
	}
}
