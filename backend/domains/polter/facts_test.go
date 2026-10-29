package polter

import (
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/domains/canon"
	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
)

func TestFactDecodeAndFormat(t *testing.T) {
	text := Header + "\n## work: Work\nstage: plan\n### new: Decision\nstatus: proposed\n\nDecision body.\n#### local-core: One process owns SQLite.\nkind: observed · scope: core · evidence: ev-1\n# core: Core\nlevel: system\n"
	doc, diags := Decode(text)
	if HasErrors(diags) || len(doc.Facts) != 1 || len(doc.Cards) != 1 || len(doc.Decisions) != 1 || len(doc.Nodes) != 1 {
		t.Fatalf("doc=%+v diags=%+v", doc, diags)
	}
	fact := doc.Facts[0]
	if fact.Ref != "local-core" || fact.Statement != "One process owns SQLite." {
		t.Fatalf("fact=%+v", fact)
	}
	again, diags := Decode(Format(doc))
	if HasErrors(diags) || Format(again) != Format(doc) {
		t.Fatalf("round trip: %s %+v", Format(again), diags)
	}
}

func TestFactLintLineNumbers(t *testing.T) {
	for _, tc := range []struct {
		body    string
		line    int
		message string
	}{
		{"#### local-core: Local core\nkind: operational\n", 5, "unknown fact kind"},
		{"#### local-core: Local core\nevidence: ev-other\n", 5, "unknown evidence"},
		{"#### local-core: Local core\nowner: me\n", 5, "unknown fact key"},
		{"#### local-core: Local core\n#### local-core: Duplicate\n", 5, "duplicate fact"},
	} {
		_, diags := Lint(Header+tc.body, &References{Evidence: []canon.Evidence{{ID: "ev-1"}}})
		found := false
		for _, diag := range diags {
			if diag.Line == tc.line && diag.Severity == SeverityError && strings.Contains(diag.Message, tc.message) {
				found = true
			}
		}
		if !found {
			t.Errorf("%s: %+v", tc.body, diags)
		}
	}
}

func TestFactPlanCreateUpdateAndOmission(t *testing.T) {
	snapshot := work.Snapshot{ProjectID: "p", Nodes: []structure.Node{{ID: "n", Path: "core", Level: "system", Status: structure.NodeActive}}, Evidence: []canon.Evidence{{ID: "ev-1"}}}
	for _, kind := range []string{"", "declared", "observed", "inferred", "verified"} {
		text := Header + "#### local-core: Local core\nscope: core\nevidence: ev-1, ev-1\n"
		if kind != "" {
			text += "kind: " + kind + "\n"
		}
		doc, diags := Decode(text)
		if HasErrors(diags) {
			t.Fatal(diags)
		}
		ops, diags := Plan(doc, snapshot)
		if HasErrors(diags) || len(ops) != 1 || ops[0].Entity != work.EntityFact || ops[0].Kind != work.OpCreate {
			t.Fatalf("ops=%+v diags=%+v", ops, diags)
		}
		want := kind
		if want == "" {
			want = "declared"
		}
		if ops[0].Fields["kind"] != want || !strings.HasPrefix(FormatPlan(ops), "+ fact "+ops[0].EntityID+` "Local core"`) || Summarize(ops) != "1 op (1 fact)" {
			t.Fatalf("plan=%s fields=%+v", FormatPlan(ops), ops[0].Fields)
		}
	}
	snapshot.Facts = []work.Fact{{Fact: canon.Fact{ID: "fact-1", Statement: "Local core", TruthClass: "observed"}, Slug: "local-core", Scope: "core", Evidence: []string{"ev-1"}}}
	for _, ref := range []string{"local-core", "fact-1"} {
		doc, _ := Decode(Header + "#### " + ref + ": Renamed\n")
		ops, diags := Plan(doc, snapshot)
		if HasErrors(diags) || len(ops) != 1 || ops[0].Kind != work.OpUpdate || len(ops[0].Fields) != 1 || ops[0].Before["statement"] != "Local core" {
			t.Fatalf("ops=%+v diags=%+v", ops, diags)
		}
		doc, _ = Decode(Header + "#### " + ref + "\n")
		ops, diags = Plan(doc, snapshot)
		if HasErrors(diags) || len(ops) != 0 {
			t.Fatalf("omission ops=%+v diags=%+v", ops, diags)
		}
	}
	doc, _ := Decode(Header + "#### fact-1\nscope:\nevidence:\n")
	ops, diags := Plan(doc, snapshot)
	if HasErrors(diags) || len(ops) != 1 || len(ops[0].Fields) != 2 {
		t.Fatalf("clear: %+v %+v", ops, diags)
	}
	doc, _ = Decode(Header + "#### local-core\nscope: missing\n")
	_, diags = Plan(doc, snapshot)
	if !HasErrors(diags) || diags[0].Line != 5 {
		t.Fatalf("scope: %+v", diags)
	}
	doc, _ = Decode(Header + "#### new-fact: Statement\nevidence: missing\n")
	ops, diags = Plan(doc, snapshot)
	if !HasErrors(diags) || len(ops) != 0 || diags[0].Line != 5 {
		t.Fatalf("evidence: %+v %+v", ops, diags)
	}
}
