package polter

import (
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/domains/canon"
	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
)

func TestFactDecodeAndFormat(t *testing.T) {
	text := Header + "\n## work: Work\nstage: plan\n### new: Decision\nstatus: proposed\n\nDecision body.\n#### local-core: One process owns SQLite.\nkind: inferred · scope: core\n#### rule no-network: Never call the network.\nscope: core\n# core: Core\nlevel: domain\n"
	doc, diags := Decode(text)
	if HasErrors(diags) || len(doc.Facts) != 1 || len(doc.Rules) != 1 || len(doc.Cards) != 1 || len(doc.Decisions) != 1 || len(doc.Nodes) != 1 {
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
		{"#### local-core: Local core\nkind: observed\n", 5, "unknown fact kind"},
		{"#### local-core: Local core\nevidence: file:go.mod\n", 5, "evidence: is retired"},
		{"#### local-core: Local core\nowner: me\n", 5, "unknown fact key"},
		{"#### local-core: Local core\n#### local-core: Duplicate\n", 5, "duplicate fact"},
	} {
		_, diags := Lint(Header+tc.body, &References{})
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
	snapshot := work.Snapshot{ProjectID: "p", Nodes: []structure.Node{{ID: "n", Path: "core", Level: "domain", Status: structure.NodeActive}}}
	for _, kind := range []string{"", "declared", "inferred", "verified"} {
		text := Header + "#### local-core: Local core\nscope: core\n"
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
	snapshot.Facts = []work.Fact{{Fact: canon.Fact{ID: "fact-1", Statement: "Local core", TruthClass: "declared"}, Slug: "local-core", Scopes: []string{"core"}}}
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
	doc, _ := Decode(Header + "#### fact-1\nscope:\n")
	ops, diags := Plan(doc, snapshot)
	if HasErrors(diags) || len(ops) != 1 || len(ops[0].Fields) != 1 {
		t.Fatalf("clear: %+v %+v", ops, diags)
	}
	doc, _ = Decode(Header + "#### local-core\nscope: missing\n")
	_, diags = Plan(doc, snapshot)
	if !HasErrors(diags) || diags[0].Line != 5 {
		t.Fatalf("scope: %+v", diags)
	}
}

func TestRulePlanCreateUpdateRemoveAndNodeLines(t *testing.T) {
	snapshot := work.Snapshot{ProjectID: "p", Nodes: []structure.Node{{ID: "n", Slug: "core", Path: "core", Title: "Core", Level: "domain", Status: structure.NodeActive}}}
	doc, diags := Decode(Header + "#### rule no-network: Never call the network.\nscope: core\n#### rule small-prs: Keep changes small.\n")
	if HasErrors(diags) {
		t.Fatal(diags)
	}
	ops, diags := Plan(doc, snapshot)
	if HasErrors(diags) || len(ops) != 2 || ops[0].Entity != work.EntityRule || ops[0].Kind != work.OpCreate {
		t.Fatalf("ops=%+v diags=%+v", ops, diags)
	}
	if scopes, _ := ops[0].Fields["scope"].([]string); len(scopes) != 1 || scopes[0] != "core" {
		t.Fatalf("scope = %+v", ops[0].Fields)
	}
	if _, scoped := ops[1].Fields["scope"]; scoped {
		t.Fatalf("a rule without scope is for the whole project: %+v", ops[1].Fields)
	}

	snapshot.Rules = []work.Rule{{ID: "r1", Slug: "no-network", Statement: "Never call the network.", Scopes: []string{"core"}, Status: work.RuleActive}}
	doc, _ = Decode(Header + "#### rule no-network\nstatus: removed\n")
	ops, diags = Plan(doc, snapshot)
	if HasErrors(diags) || len(ops) != 1 || ops[0].Kind != work.OpRemove {
		t.Fatalf("remove: %+v %+v", ops, diags)
	}
	doc, _ = Decode(Header + "#### rule ghost\nstatus: removed\n")
	if _, diags = Plan(doc, snapshot); !HasErrors(diags) {
		t.Fatal("removing an unknown rule must fail")
	}

	// A node's ! line is a Rule for that node; the same text is the same Rule.
	doc, _ = Decode(Header + "# core: Core\nlevel: domain\n\n! Never call the network.\n! Log every write\n")
	ops, diags = Plan(doc, snapshot)
	if HasErrors(diags) || len(ops) != 1 || ops[0].Entity != work.EntityRule || ops[0].Label != "Log every write" {
		t.Fatalf("node lines: %+v %+v", ops, diags)
	}
}
