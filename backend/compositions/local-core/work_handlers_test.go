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
	project, err := wedge.InitProject(store, wedge.InitInput{Name: "Demo"})
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

func TestMilestoneHandlersAuditWrites(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "milestones.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	project, err := wedge.InitProject(store, wedge.InitInput{Name: "Demo"})
	if err != nil {
		t.Fatal(err)
	}
	core := NewCore(store, "test-token")
	ctx := context.Background()
	change := &localv1.ChangeEnvelope{Summary: "Plan the beta", Rationale: "Group the cards that ship first"}

	if _, err := core.CreateMilestone(ctx, connect.NewRequest(&localv1.CreateMilestoneRequest{ProjectId: project.ID, Name: "Beta"})); connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Fatalf("create without a change envelope: %v", err)
	}
	if _, err := core.CreateMilestone(ctx, connect.NewRequest(&localv1.CreateMilestoneRequest{ProjectId: project.ID, Name: "Beta", TargetDate: "soon", Change: change})); connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Fatalf("create with a bad date: %v", err)
	}
	created, err := core.CreateMilestone(ctx, connect.NewRequest(&localv1.CreateMilestoneRequest{
		ProjectId: project.ID, Name: " Public beta ", Goal: "First outside users", ExitCriteria: []string{"Signup works", " "},
		TargetDate: "2026-12-01", State: "active", Change: change,
	}))
	if err != nil {
		t.Fatal(err)
	}
	beta := created.Msg.Milestone
	if beta.GetName() != "Public beta" || beta.GetSlug() != "public-beta" || beta.GetState() != "active" || len(beta.GetExitCriteria()) != 1 || beta.GetPosition() != 0 {
		t.Fatalf("create milestone = %+v", beta)
	}
	second, err := core.CreateMilestone(ctx, connect.NewRequest(&localv1.CreateMilestoneRequest{ProjectId: project.ID, Name: "GA", Change: change}))
	if err != nil {
		t.Fatal(err)
	}
	if second.Msg.Milestone.GetState() != "planned" || second.Msg.Milestone.GetPosition() != 1 {
		t.Fatalf("second milestone = %+v", second.Msg.Milestone)
	}
	renamed, err := core.UpdateMilestone(ctx, connect.NewRequest(&localv1.UpdateMilestoneRequest{
		ProjectId: project.ID, Id: beta.Id, Name: "Open beta", Goal: beta.Goal, ExitCriteria: beta.ExitCriteria,
		TargetDate: beta.TargetDate, State: "active", Change: change,
	}))
	if err != nil {
		t.Fatal(err)
	}
	if renamed.Msg.Milestone.GetName() != "Open beta" || renamed.Msg.Milestone.GetSlug() != "public-beta" {
		t.Fatalf("a rename keeps the slug: %+v", renamed.Msg.Milestone)
	}
	reordered, err := core.ReorderMilestones(ctx, connect.NewRequest(&localv1.ReorderMilestonesRequest{
		ProjectId: project.ID, MilestoneIds: []string{second.Msg.Milestone.Id, beta.Id}, Change: change,
	}))
	if err != nil {
		t.Fatal(err)
	}
	if reordered.Msg.Milestones[0].GetId() != second.Msg.Milestone.Id {
		t.Fatalf("reorder milestones = %v", reordered.Msg.Milestones)
	}

	// Polter puts cards in a milestone by slug, and the queries read them back.
	apply := func(text string) (wedge.ApplyResult, error) {
		return wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, Text: text, AutoStartLabel: "cli"})
	}
	if _, err := apply("---\npolter: 1\nsummary: Plan signup\nrationale: It ships in the beta\n---\n\n## signup: Signup\nmilestone: public-beta\n\n## docs: Docs\n"); err != nil {
		t.Fatal(err)
	}
	refused, _ := apply("---\npolter: 1\nsummary: Plan\nrationale: Typo\n---\n\n## docs: Docs\nmilestone: nope\n")
	if refused.Applied || len(refused.Diagnostics) != 1 || !strings.Contains(refused.Diagnostics[0].Message, `unknown milestone "nope"`) {
		t.Fatalf("unknown milestone: %+v", refused)
	}
	roadmap, err := wedge.QueryPolter(store, project.ID, "roadmap")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(roadmap, "## public-beta: Open beta") || !strings.Contains(roadmap, "goal: First outside users") ||
		!strings.Contains(roadmap, "- signup  shape") || !strings.Contains(roadmap, "Backlog: 1 cards") || strings.Contains(roadmap, "## ga:") {
		t.Fatalf("roadmap = %s", roadmap)
	}
	card, err := wedge.QueryPolter(store, project.ID, "card signup")
	if err != nil || !strings.Contains(card, "milestone: public-beta") {
		t.Fatalf("card = %s, err=%v", card, err)
	}

	archived, err := core.ArchiveMilestone(ctx, connect.NewRequest(&localv1.ArchiveMilestoneRequest{ProjectId: project.ID, Id: second.Msg.Milestone.Id, Archived: true, Change: change}))
	if err != nil || archived.Msg.Milestone.GetArchivedAt() == "" {
		t.Fatalf("archive = %+v, err=%v", archived, err)
	}
	listed, err := wedge.QueryPolter(store, project.ID, "milestones")
	if err != nil || strings.Contains(listed, "ga ") || !strings.Contains(listed, "public-beta  active  0/1 delivered  target 2026-12-01") {
		t.Fatalf("milestones = %s, err=%v", listed, err)
	}
	var creates int
	if err := store.DB.QueryRow(`SELECT COUNT(1) FROM change_ops WHERE project_id=? AND entity='milestone' AND op='create'`, project.ID).Scan(&creates); err != nil || creates != 2 {
		t.Fatalf("audited creates = %d, err=%v", creates, err)
	}
	var runID string
	if err := store.DB.QueryRow(`SELECT agent_run_id FROM change_ops WHERE project_id=? AND entity='milestone' LIMIT 1`, project.ID).Scan(&runID); err != nil || runID == "" {
		t.Fatalf("milestone change_ops run = %q, err=%v", runID, err)
	}
}
