package polter

import (
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/domains/work"
)

func TestConflictRaiseDecideWithdraw(t *testing.T) {
	snapshot := work.Snapshot{ProjectID: "p", Rules: []work.Rule{{ID: "r1", Slug: "local-only", Statement: "Never call the network.", Status: work.RuleActive}}}
	doc, diags := Decode(Header + "#### conflict use-redis: Add a Redis cache - for the sessions\nrule: local-only\noptions: Keep local | Allow Redis\n")
	if HasErrors(diags) {
		t.Fatal(diags)
	}
	ops, diags := Plan(doc, snapshot)
	if HasErrors(diags) || len(ops) != 1 || ops[0].Entity != work.EntityConflict || ops[0].Kind != work.OpCreate {
		t.Fatalf("raise: %+v %+v", ops, diags)
	}
	if ops[0].Fields["rule_id"] != "r1" || ops[0].Fields["request"] != "Add a Redis cache - for the sessions" {
		t.Fatalf("raise fields: %+v", ops[0].Fields)
	}
	if options, _ := ops[0].Fields["options"].([]string); len(options) != 2 || options[1] != "Allow Redis" {
		t.Fatalf("options: %+v", ops[0].Fields["options"])
	}

	doc, _ = Decode(Header + "#### conflict lonely: Do something\n")
	if _, diags = Plan(doc, snapshot); !HasErrors(diags) {
		t.Fatal("a conflict must name the rule or decision it goes against")
	}

	snapshot.Conflicts = []work.Conflict{{ID: "c1", Slug: "use-redis", Request: "Add a Redis cache", RuleID: "r1", State: work.ConflictOpen}}
	doc, _ = Decode(ConflictText("use-redis", "Keep local - for now", "Decide", "A person decided"))
	ops, diags = Plan(doc, snapshot)
	if HasErrors(diags) || len(ops) != 1 || ops[0].Fields["state"] != work.ConflictDecided || ops[0].Fields["answer"] != "Keep local - for now" {
		t.Fatalf("decide: %+v %+v", ops, diags)
	}
	doc, _ = Decode(Header + "#### conflict use-redis\nstatus: withdrawn\n")
	if ops, diags = Plan(doc, snapshot); HasErrors(diags) || len(ops) != 1 || ops[0].Kind != work.OpRemove {
		t.Fatalf("withdraw: %+v %+v", ops, diags)
	}

	snapshot.Conflicts[0].State, snapshot.Conflicts[0].Answer = work.ConflictDecided, "Keep local"
	if text := EncodeConflict(snapshot.Conflicts[0], snapshot); !strings.Contains(text, "rule: local-only (Never call the network.)") || !strings.Contains(text, "answer: Keep local") {
		t.Fatalf("encode: %s", text)
	}
}
