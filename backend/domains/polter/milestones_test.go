package polter

import (
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/domains/work"
)

func milestoneSnapshot() work.Snapshot {
	return work.Snapshot{
		ProjectID: "p1",
		Milestones: []work.Milestone{
			{ID: "m1", Slug: "beta", Name: "Beta", State: work.MilestoneActive, Goal: "First users", ExitCriteria: []string{"Signup works"}},
			{ID: "m2", Slug: "old", Name: "Old", State: work.MilestoneDone, ArchivedAt: "2026-10-01T00:00:00Z", Position: 1},
		},
		Cards: []work.Card{
			{ID: "c1", Slug: "signup", Title: "Signup", Stage: work.StageBuild, Status: work.CardActive, MilestoneID: "m1", Milestone: "beta"},
			{ID: "c2", Slug: "docs", Title: "Docs", Stage: work.StageShape, Status: work.CardActive},
		},
	}
}

func planMilestone(t *testing.T, text string) ([]work.Op, []Diagnostic) {
	t.Helper()
	doc, diags := Decode("---\npolter: 1\n---\n" + text)
	if HasErrors(diags) {
		return nil, diags
	}
	return Plan(doc, milestoneSnapshot())
}

func TestPlanMovesCardsBetweenMilestoneAndBacklog(t *testing.T) {
	ops, diags := planMilestone(t, "## docs: Docs\nmilestone: Beta\n")
	if HasErrors(diags) || len(ops) != 1 || ops[0].Fields["milestone"] != "m1" || ops[0].Before["milestone"] != "" {
		t.Fatalf("assign: ops = %+v diags = %+v", ops, diags)
	}
	ops, diags = planMilestone(t, "## signup: Signup\nmilestone:\n")
	if HasErrors(diags) || len(ops) != 1 || ops[0].Fields["milestone"] != "" || ops[0].Before["milestone"] != "m1" {
		t.Fatalf("clear: ops = %+v diags = %+v", ops, diags)
	}
	if ops, diags = planMilestone(t, "## signup: Signup\nmilestone: beta\n"); HasErrors(diags) || len(ops) != 0 {
		t.Fatalf("unchanged: ops = %+v diags = %+v", ops, diags)
	}
	ops, _ = planMilestone(t, "## new-card: New card\nmilestone: beta\n")
	if len(ops) != 1 || ops[0].Fields["milestone"] != "m1" {
		t.Fatalf("create in a milestone: ops = %+v", ops)
	}
}

func TestPlanRefusesArchivedAndUnknownMilestones(t *testing.T) {
	for _, slug := range []string{"old", "missing"} {
		_, diags := planMilestone(t, "## docs: Docs\nmilestone: "+slug+"\n")
		if !hasDiag(diags, 5, `unknown milestone "`+slug+`"`) {
			t.Fatalf("%s: diags = %+v", slug, diags)
		}
	}
	if _, diags := Decode("---\npolter: 1\n---\n## docs: Docs\nmilestone: Not a slug!\n"); !hasDiag(diags, 5, "invalid milestone") {
		t.Fatalf("diags = %+v", diags)
	}
}

func TestEncodeMilestonesAndRoadmap(t *testing.T) {
	snapshot := milestoneSnapshot()
	list := EncodeMilestones(snapshot)
	if !strings.Contains(list, "beta  active  0/1 delivered  \"Beta\"\n") || strings.Contains(list, "old") || !strings.HasSuffix(list, "backlog  1 cards\n") {
		t.Fatalf("milestones = %q", list)
	}
	roadmap := EncodeRoadmap(snapshot)
	for _, want := range []string{"## beta: Beta\n", "goal: First users\n", "exit: Signup works\n", "cards: 1 build\n", "- signup  build  \"Signup\"\n", "Backlog: 1 cards\n"} {
		if !strings.Contains(roadmap, want) {
			t.Fatalf("roadmap is missing %q:\n%s", want, roadmap)
		}
	}
	if !strings.Contains(EncodeCard(snapshot.Cards[0]), "milestone: beta") {
		t.Fatal("a card lists its milestone")
	}
}
