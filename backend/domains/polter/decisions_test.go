package polter

import (
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/domains/decision"
	"github.com/polterware/polterware/backend/domains/work"
)

func decisionSnapshot() work.Snapshot {
	return work.Snapshot{ProjectID: "p1", Decisions: []decision.Decision{
		{ID: "a1", Title: "Decision 0001: SQLite", Status: "accepted"},
		{ID: "a2", Title: "Decision 0002: Import", Status: "active"},
		{ID: "a3", Title: "Decision 0003: Context", Status: "proposed"},
		{ID: "a4", Title: "Decision 0004: Old", Status: "superseded", Meta: decision.Meta{SupersededBy: "a2"}},
	}}
}

func planDecisionText(t *testing.T, body string) ([]work.Op, []Diagnostic) {
	t.Helper()
	doc, diags := Decode("---\npolter: 1\n---\n" + body)
	if HasErrors(diags) {
		t.Fatalf("decode: %+v", diags)
	}
	return Plan(doc, decisionSnapshot())
}

func TestDecisionDecodeAndFormat(t *testing.T) {
	text := "---\npolter: 1\n---\n\n### new: Local core\nstatus: active · trigger: multi-user sync\n\nOne process owns SQLite.\n"
	doc, diags := Decode(text)
	if len(diags) != 0 || len(doc.Decisions) != 1 {
		t.Fatalf("doc = %+v diags = %+v", doc, diags)
	}
	got := doc.Decisions[0]
	if got.Ref != "new" || got.Title != "Local core" || got.Body != "One process owns SQLite." {
		t.Fatalf("decision = %+v", got)
	}
	if status, _ := got.MetaValue("status"); status != "active" {
		t.Fatalf("status = %q", status)
	}
	again, _ := Decode(Format(doc))
	if Format(again) != Format(doc) {
		t.Fatalf("round trip differs:\n%s\n%s", Format(doc), Format(again))
	}
}

func TestDecisionDecodeErrors(t *testing.T) {
	_, diags := Decode("---\npolter: 1\n---\n### Decision-2\nstatus: dead\nowner: me\n")
	if len(diags) != 2 {
		t.Fatalf("diags = %+v", diags)
	}
}

func TestPlanNewDecisionGetsNextNumber(t *testing.T) {
	ops, diags := planDecisionText(t, "### new: Bounded output\ntrigger: model change\n")
	if HasErrors(diags) || len(ops) != 1 {
		t.Fatalf("ops = %+v diags = %+v", ops, diags)
	}
	if ops[0].Entity != work.EntityDecision || ops[0].Kind != work.OpCreate {
		t.Fatalf("op = %+v", ops[0])
	}
	if title := ops[0].Fields["title"]; title != "Decision 0005: Bounded output" {
		t.Fatalf("title = %v", title)
	}
	if ops[0].Fields["status"] != decision.StateProposed {
		t.Fatalf("status = %v", ops[0].Fields["status"])
	}
}

func TestPlanDecisionTransitions(t *testing.T) {
	ops, diags := planDecisionText(t, "### Decision-0003\nstatus: active\n")
	if HasErrors(diags) || len(ops) != 1 || ops[0].EntityID != "a3" || ops[0].Fields["status"] != decision.StateActive {
		t.Fatalf("activate: ops = %+v diags = %+v", ops, diags)
	}
	// A legacy "accepted" row is already active: no change.
	ops, diags = planDecisionText(t, "### Decision-0001\nstatus: active\n")
	if HasErrors(diags) || len(ops) != 0 {
		t.Fatalf("no-op: ops = %+v diags = %+v", ops, diags)
	}
	for _, body := range []string{
		"### Decision-0003\nstatus: challenged · reason: x\n", // proposed cannot be challenged
		"### Decision-0004\nstatus: active\n",                 // superseded is final
		"### Decision-0002\nstatus: challenged\n",             // challenge needs a reason
		"### Decision-0002\nstatus: superseded\n",             // superseded only via successor
		"### Decision-0099\nstatus: active\n",                 // unknown
	} {
		if _, diags := planDecisionText(t, body); !HasErrors(diags) {
			t.Errorf("expected an error for %q", body)
		}
	}
	ops, diags = planDecisionText(t, "### Decision-0002\nstatus: challenged · reason: multi-user sync arrived\n")
	if HasErrors(diags) || len(ops) != 1 || ops[0].Fields["status_reason"] != "multi-user sync arrived" {
		t.Fatalf("challenge: ops = %+v diags = %+v", ops, diags)
	}
}

func TestPlanSupersede(t *testing.T) {
	ops, diags := planDecisionText(t, "### new: Cloud store\nsupersedes: Decision-0001 · reason: teams need shared state\n")
	if HasErrors(diags) || len(ops) != 2 {
		t.Fatalf("ops = %+v diags = %+v", ops, diags)
	}
	create, old := ops[0], ops[1]
	if create.Fields["status"] != decision.StateActive {
		t.Fatalf("successor status = %v", create.Fields["status"])
	}
	if old.EntityID != "a1" || old.Fields["status"] != decision.StateSuperseded || old.Fields["superseded_by"] != create.EntityID {
		t.Fatalf("old = %+v", old)
	}
	// An existing proposal that supersedes is activated in the same batch.
	ops, diags = planDecisionText(t, "### Decision-0003\nsupersedes: Decision-0001\n")
	if HasErrors(diags) || len(ops) != 2 || ops[0].Fields["status"] != decision.StateActive {
		t.Fatalf("existing successor: ops = %+v diags = %+v", ops, diags)
	}
	// A superseded decision cannot be the successor, and cannot be superseded twice.
	if _, diags := planDecisionText(t, "### Decision-0004\nsupersedes: Decision-0001\n"); !HasErrors(diags) {
		t.Error("superseded successor should fail")
	}
	if _, diags := planDecisionText(t, "### Decision-0003\nsupersedes: Decision-0004\n"); !HasErrors(diags) {
		t.Error("superseding a superseded decision should fail")
	}
}

func TestLintHintsOnStaleDecisions(t *testing.T) {
	refs := &References{Decisions: []DecisionRef{
		{ID: "a2", Title: "Decision 0002: Import", Status: "superseded"},
		{ID: "a3", Title: "Decision 0003: Context", Status: "accepted"},
	}}
	_, diags := Lint("---\npolter: 1\n---\n## one: One\ndecisions: Decision-0002, Decision-0003\n", refs)
	var hints []string
	for _, d := range diags {
		if d.Severity == SeverityHint && strings.Contains(d.Message, "decision Decision") {
			hints = append(hints, d.Message)
		}
	}
	if len(hints) != 1 || !strings.Contains(hints[0], "superseded") {
		t.Fatalf("hints = %v (diags %+v)", hints, diags)
	}
}

func TestParseDecisionQueries(t *testing.T) {
	q, err := ParseQuery("decisions challenged")
	if err != nil || q.Kind != QueryDecisions || q.Slug != "challenged" {
		t.Fatalf("query = %+v err = %v", q, err)
	}
	q, err = ParseQuery("decision Decision 0007")
	if err != nil || q.Kind != QueryDecision || q.Slug != "Decision 0007" {
		t.Fatalf("query = %+v err = %v", q, err)
	}
	if _, err := ParseQuery("decisions bogus"); err == nil {
		t.Fatal("unknown state should fail")
	}
}

func TestEncodeDecisions(t *testing.T) {
	out := EncodeDecisions(decisionSnapshot().Decisions, "")
	if !strings.Contains(out, "active 2") || !strings.Contains(out, "superseded by Decision-0002") {
		t.Fatalf("out = %s", out)
	}
	detail := EncodeDecision(decisionSnapshot().Decisions[1], decisionSnapshot().Decisions, []string{"core/import"})
	if !strings.Contains(detail, "### Decision-0002: Import") || !strings.Contains(detail, "supersedes: Decision-0004") || !strings.Contains(detail, "governs: core/import") {
		t.Fatalf("detail = %s", detail)
	}
}

func TestComposeDecisionFlattensValues(t *testing.T) {
	text := ComposeDecision(DecisionInput{Ref: "Decision-0002", Status: "challenged", Reason: "cost · latency - both"}, "Challenge", "why")
	doc, diags := Decode(text)
	if len(diags) != 0 || len(doc.Decisions) != 1 {
		t.Fatalf("doc = %+v diags = %+v\n%s", doc, diags, text)
	}
	if reason, _ := doc.Decisions[0].MetaValue("reason"); reason != "cost, latency – both" {
		t.Fatalf("reason = %q", reason)
	}
}

func TestDecisionLevelPrinciple(t *testing.T) {
	ops, diags := planDecisionText(t, "### new: Local first\nlevel: principle · status: active\n")
	if HasErrors(diags) || len(ops) != 1 || ops[0].Fields["level"] != decision.LevelPrinciple {
		t.Fatalf("ops = %+v diags = %+v", ops, diags)
	}
	ops, diags = planDecisionText(t, "### Decision-0002\nlevel: principle\n")
	if HasErrors(diags) || len(ops) != 1 || ops[0].Fields["level"] != decision.LevelPrinciple || ops[0].Before["level"] != "" {
		t.Fatalf("update ops = %+v diags = %+v", ops, diags)
	}
	if _, diags := Decode("---\npolter: 1\n---\n### Decision-0002\nlevel: pinned\n"); !HasErrors(diags) {
		t.Fatal("an unknown level must be rejected")
	}
	pinned := decision.Decision{ID: "a2", Title: "Decision 0002: Import", Status: "active", Meta: decision.Meta{Level: decision.LevelPrinciple}}
	if got := EncodeDecision(pinned, []decision.Decision{pinned}, nil); !strings.Contains(got, "level: principle") {
		t.Fatalf("encoded decision lacks its level:\n%s", got)
	}
	if got := EncodeDecisions([]decision.Decision{pinned}, ""); !strings.Contains(got, "Decision 0002: Import · active · principle") {
		t.Fatalf("decision list lacks the principle mark:\n%s", got)
	}
}
