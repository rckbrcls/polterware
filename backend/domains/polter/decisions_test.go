package polter

import (
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/domains/decision"
	"github.com/polterware/polterware/backend/domains/work"
)

func decisionSnapshot() work.Snapshot {
	return work.Snapshot{ProjectID: "p1", Decisions: []decision.Decision{
		{ID: "a1", Title: "Verdict 0001: SQLite", Status: "accepted"},
		{ID: "a2", Title: "Verdict 0002: Import", Status: "active"},
		{ID: "a3", Title: "Verdict 0003: Context", Status: "proposed"},
		{ID: "a4", Title: "Verdict 0004: Old", Status: "superseded", Meta: decision.Meta{SupersededBy: "a2"}},
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
	_, diags := Decode("---\npolter: 1\n---\n### Verdict-2\nstatus: dead\nowner: me\n")
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
	if title := ops[0].Fields["title"]; title != "Verdict 0005: Bounded output" {
		t.Fatalf("title = %v", title)
	}
	if ops[0].Fields["status"] != decision.StateProposed {
		t.Fatalf("status = %v", ops[0].Fields["status"])
	}
}

func TestPlanDecisionTransitions(t *testing.T) {
	ops, diags := planDecisionText(t, "### Verdict-0003\nstatus: active\n")
	if HasErrors(diags) || len(ops) != 1 || ops[0].EntityID != "a3" || ops[0].Fields["status"] != decision.StateActive {
		t.Fatalf("activate: ops = %+v diags = %+v", ops, diags)
	}
	// A legacy "accepted" row is already active: no change.
	ops, diags = planDecisionText(t, "### Verdict-0001\nstatus: active\n")
	if HasErrors(diags) || len(ops) != 0 {
		t.Fatalf("no-op: ops = %+v diags = %+v", ops, diags)
	}
	for _, body := range []string{
		"### Verdict-0003\nstatus: challenged · reason: x\n", // proposed cannot be challenged
		"### Verdict-0004\nstatus: active\n",                 // superseded is final
		"### Verdict-0002\nstatus: challenged\n",             // challenge needs a reason
		"### Verdict-0002\nstatus: superseded\n",             // superseded only via successor
		"### Verdict-0099\nstatus: active\n",                 // unknown
	} {
		if _, diags := planDecisionText(t, body); !HasErrors(diags) {
			t.Errorf("expected an error for %q", body)
		}
	}
	ops, diags = planDecisionText(t, "### Verdict-0002\nstatus: challenged · reason: multi-user sync arrived\n")
	if HasErrors(diags) || len(ops) != 1 || ops[0].Fields["status_reason"] != "multi-user sync arrived" {
		t.Fatalf("challenge: ops = %+v diags = %+v", ops, diags)
	}
}

func TestPlanSupersede(t *testing.T) {
	ops, diags := planDecisionText(t, "### new: Cloud store\nsupersedes: Verdict-0001 · reason: teams need shared state\n")
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
	ops, diags = planDecisionText(t, "### Verdict-0003\nsupersedes: Verdict-0001\n")
	if HasErrors(diags) || len(ops) != 2 || ops[0].Fields["status"] != decision.StateActive {
		t.Fatalf("existing successor: ops = %+v diags = %+v", ops, diags)
	}
	// A superseded decision cannot be the successor, and cannot be superseded twice.
	if _, diags := planDecisionText(t, "### Verdict-0004\nsupersedes: Verdict-0001\n"); !HasErrors(diags) {
		t.Error("superseded successor should fail")
	}
	if _, diags := planDecisionText(t, "### Verdict-0003\nsupersedes: Verdict-0004\n"); !HasErrors(diags) {
		t.Error("superseding a superseded decision should fail")
	}
}

func TestLintHintsOnStaleDecisions(t *testing.T) {
	refs := &References{Verdicts: []VerdictRef{
		{ID: "a2", Title: "Verdict 0002: Import", Status: "superseded"},
		{ID: "a3", Title: "Verdict 0003: Context", Status: "accepted"},
	}}
	_, diags := Lint("---\npolter: 1\n---\n## one: One\ndecisions: Verdict-0002, Verdict-0003\n", refs)
	var hints []string
	for _, d := range diags {
		if d.Severity == SeverityHint && strings.Contains(d.Message, "decision Verdict") {
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
	q, err = ParseQuery("decision Verdict 0007")
	if err != nil || q.Kind != QueryDecision || q.Slug != "Verdict 0007" {
		t.Fatalf("query = %+v err = %v", q, err)
	}
	if _, err := ParseQuery("decisions bogus"); err == nil {
		t.Fatal("unknown state should fail")
	}
}

func TestEncodeDecisions(t *testing.T) {
	out := EncodeDecisions(decisionSnapshot().Decisions, "")
	if !strings.Contains(out, "active 2") || !strings.Contains(out, "superseded by Verdict-0002") {
		t.Fatalf("out = %s", out)
	}
	detail := EncodeDecision(decisionSnapshot().Decisions[1], decisionSnapshot().Decisions, []string{"core/import"})
	if !strings.Contains(detail, "### Verdict-0002: Import") || !strings.Contains(detail, "supersedes: Verdict-0004") || !strings.Contains(detail, "governs: core/import") {
		t.Fatalf("detail = %s", detail)
	}
}

func TestComposeDecisionFlattensValues(t *testing.T) {
	text := ComposeDecision(DecisionInput{Ref: "Verdict-0002", Status: "challenged", Reason: "cost · latency - both"}, "Challenge", "why")
	doc, diags := Decode(text)
	if len(diags) != 0 || len(doc.Decisions) != 1 {
		t.Fatalf("doc = %+v diags = %+v\n%s", doc, diags, text)
	}
	if reason, _ := doc.Decisions[0].MetaValue("reason"); reason != "cost, latency – both" {
		t.Fatalf("reason = %q", reason)
	}
}
