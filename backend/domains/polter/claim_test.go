package polter

import (
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/domains/work"
)

func claimSnapshot() work.Snapshot {
	return work.Snapshot{ProjectID: "p1", Cards: []work.Card{
		{
			ID: "c1", Slug: "git-import", Title: "Git import", Stage: work.StageBuild, Status: work.CardActive,
			Tasks: []work.Task{
				{ID: "t1", CardID: "c1", Number: 1, Title: "Evidence", State: work.TaskOpen, Scope: "backend/import/*"},
				{ID: "t2", CardID: "c1", Number: 2, Title: "Stamp", State: work.TaskOpen, Scope: "backend/domains/canon/*"},
				{ID: "t3", CardID: "c1", Number: 3, Title: "Docs", State: work.TaskOpen},
				{ID: "t4", CardID: "c1", Number: 4, Title: "Old", State: work.TaskDone, Scope: "docs/*"},
			},
		},
		{
			ID: "c2", Slug: "canon-core", Title: "Canon core", Stage: work.StageBuild, Status: work.CardActive,
			Tasks: []work.Task{
				{ID: "u1", CardID: "c2", Number: 1, Title: "Core", State: work.TaskOpen, Scope: "backend/*",
					Claim: &work.Claim{ID: "k1", ProjectID: "p1", TaskID: "u1", Holder: "claude", Scope: "backend/*"}},
			},
		},
	}}
}

func coordDoc(t *testing.T, body string) Document {
	t.Helper()
	return mustDecode(t, "---\npolter: 1\n---\n"+body)
}

func TestClaimDecode(t *testing.T) {
	doc, diags := Decode("---\npolter: 1\n---\n## git-import\nclaim: T2\n\ndone: T1, T3\nrelease: t4\nclaim: X9\n")
	if len(diags) != 1 || !strings.Contains(diags[0].Message, `invalid task "X9"`) {
		t.Fatalf("diags = %+v", diags)
	}
	got := doc.Cards[0].Coordination
	if len(got) != 4 || got[0].Action != CoordClaim || got[0].Number != 2 || got[2].Number != 3 || got[3].Action != CoordRelease {
		t.Fatalf("coordination = %+v", got)
	}
	// Coordination lines are never encoded back.
	if strings.Contains(Format(doc), "claim:") {
		t.Fatalf("format should drop coordination lines:\n%s", Format(doc))
	}
}

func TestClaimPlan(t *testing.T) {
	snapshot := claimSnapshot()

	_, diags := PlanAs(coordDoc(t, "## git-import\nclaim: T3\n"), snapshot, "")
	if !HasErrors(diags) || !strings.Contains(diags[0].Message, "needs an agent") {
		t.Fatalf("claim without agent: %+v", diags)
	}

	ops, diags := PlanAs(coordDoc(t, "## git-import\nclaim: T3\n"), snapshot, "codex")
	if HasErrors(diags) || len(ops) != 1 || ops[0].Entity != work.EntityClaim || ops[0].Kind != work.OpCreate || ops[0].Fields["holder"] != "codex" {
		t.Fatalf("claim T3: ops=%+v diags=%+v", ops, diags)
	}

	// backend/import/* overlaps claude's backend/* on another card.
	_, diags = PlanAs(coordDoc(t, "## git-import\nclaim: T1\n"), snapshot, "codex")
	if !HasErrors(diags) || !strings.Contains(diags[0].Message, "canon-core T1 held by claude (backend/*)") {
		t.Fatalf("overlap: %+v", diags)
	}
	// The same holder may hold overlapping scopes.
	if _, diags = PlanAs(coordDoc(t, "## git-import\nclaim: T1\n"), snapshot, "claude"); HasErrors(diags) {
		t.Fatalf("same holder overlap: %+v", diags)
	}

	// Re-claim by the holder is a no-op; by another agent an error.
	if ops, diags = PlanAs(coordDoc(t, "## canon-core\nclaim: T1\n"), snapshot, "claude"); HasErrors(diags) || len(ops) != 0 {
		t.Fatalf("re-claim: ops=%+v diags=%+v", ops, diags)
	}
	if _, diags = PlanAs(coordDoc(t, "## canon-core\nclaim: T1\n"), snapshot, "codex"); !HasErrors(diags) || !strings.Contains(diags[0].Message, "claimed by claude") {
		t.Fatalf("claim held task: %+v", diags)
	}

	// Done or unknown tasks cannot be claimed.
	if _, diags = PlanAs(coordDoc(t, "## git-import\nclaim: T4\n"), snapshot, "codex"); !HasErrors(diags) || !strings.Contains(diags[0].Message, "it is done") {
		t.Fatalf("claim done task: %+v", diags)
	}
	if _, diags = PlanAs(coordDoc(t, "## git-import\nclaim: T9\n"), snapshot, "codex"); !HasErrors(diags) {
		t.Fatalf("claim unknown task: %+v", diags)
	}

	// Done by the holder marks the task done and deletes the claim.
	ops, diags = PlanAs(coordDoc(t, "## canon-core\ndone: T1\n"), snapshot, "claude")
	if HasErrors(diags) || len(ops) != 2 || ops[0].Fields["state"] != work.TaskDone || ops[1].Entity != work.EntityClaim || ops[1].Kind != work.OpRemove {
		t.Fatalf("done: ops=%+v diags=%+v", ops, diags)
	}
	if _, diags = PlanAs(coordDoc(t, "## canon-core\ndone: T1\n"), snapshot, "codex"); !HasErrors(diags) {
		t.Fatalf("done on another agent's claim should fail")
	}
	// Done on a free task that is already done is a no-op.
	if ops, diags = PlanAs(coordDoc(t, "## git-import\ndone: T4\n"), snapshot, "codex"); HasErrors(diags) || len(ops) != 0 {
		t.Fatalf("done no-op: ops=%+v diags=%+v", ops, diags)
	}

	// Release: holder only; free task is a no-op.
	if ops, diags = PlanAs(coordDoc(t, "## canon-core\nrelease: T1\n"), snapshot, "claude"); HasErrors(diags) || len(ops) != 1 || ops[0].Kind != work.OpRemove {
		t.Fatalf("release: ops=%+v diags=%+v", ops, diags)
	}
	if _, diags = PlanAs(coordDoc(t, "## canon-core\nrelease: T1\n"), snapshot, "codex"); !HasErrors(diags) {
		t.Fatalf("release another agent's claim should fail")
	}
	if ops, diags = PlanAs(coordDoc(t, "## git-import\nrelease: T3\n"), snapshot, "codex"); HasErrors(diags) || len(ops) != 0 {
		t.Fatalf("release free: ops=%+v diags=%+v", ops, diags)
	}

	// A nested scope overlaps a wider claim on another card.
	if _, diags = PlanAs(coordDoc(t, "## git-import\nclaim: T2\n"), snapshot, "codex"); !HasErrors(diags) {
		t.Fatalf("backend/domains/canon/* overlaps backend/*: %+v", diags)
	}

	// A checkbox that closes a claimed task releases it.
	ops, diags = PlanAs(coordDoc(t, "## canon-core\n- [x] T1 Core\n"), snapshot, "")
	if HasErrors(diags) || len(ops) != 2 || ops[1].Entity != work.EntityClaim || ops[1].Kind != work.OpRemove {
		t.Fatalf("checkbox done: ops=%+v diags=%+v", ops, diags)
	}
}

func TestClaimTaskRefAndText(t *testing.T) {
	for _, text := range []string{"git-import#T2", "git-import T2", " git-import#t2 "} {
		ref, err := ParseTaskRef(text)
		if err != nil || ref.Slug != "git-import" || ref.Number != 2 {
			t.Fatalf("ParseTaskRef(%q) = %+v, %v", text, ref, err)
		}
	}
	if _, err := ParseTaskRef("git-import"); err == nil {
		t.Fatal("slug without task should fail")
	}
	text, err := CoordText(CoordClaim, CommitRef{Slug: "git-import", Number: 2}, "codex")
	if err != nil {
		t.Fatal(err)
	}
	doc, diags := Decode(text)
	if len(diags) > 0 || doc.Summary == "" || doc.Rationale == "" || len(doc.Cards[0].Coordination) != 1 {
		t.Fatalf("coord text = %q doc=%+v diags=%+v", text, doc, diags)
	}
}

func TestClaimStatusLines(t *testing.T) {
	snapshot := claimSnapshot()
	snapshot.Cards[0].Tasks[2].Claim = &work.Claim{Holder: "codex"}
	status := EncodeStatusClaims("git-import", snapshot)
	want := "claim: T3 codex\nclaimed: canon-core T1 claude (backend/*)\n"
	if status != want {
		t.Fatalf("status claims = %q, want %q", status, want)
	}
}
