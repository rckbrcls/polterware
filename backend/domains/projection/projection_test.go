package projection

import (
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
)

func testGraph() ([]structure.Node, []Decision) {
	nodes := []structure.Node{
		{ID: "s", Path: "shop", Level: structure.LevelSystem, Title: "Shop", Status: structure.NodeActive,
			Decisions:  []string{"Decision 0001"},
			Invariants: []structure.Invariant{{Text: "Money is integer cents", State: work.InvariantActive}}},
		{ID: "d", ParentID: "s", Path: "shop/auth", Level: structure.LevelDomain, Title: "Auth", Status: structure.NodeActive,
			Repo: "api", Folder: "src/auth", Decisions: []string{"decision-tokens"},
			Invariants: []structure.Invariant{
				{Text: "Tokens expire in 15 minutes", State: work.InvariantActive},
				{Text: "Old rule", State: work.InvariantRemoved},
			}},
	}
	decisions := []Decision{
		{ID: "decision-cents", Title: "Decision 0001: Integer cents", Body: "## Decision\n\nStore cents.", Status: "accepted"},
		{ID: "decision-tokens", Title: "Decision 0002: Short tokens", Body: "## Decision\n\nShort tokens."},
		{ID: "decision-free", Title: "Decision 0003: Free standing", Body: "Body."},
	}
	return nodes, decisions
}

func TestGovernByCitingNodeRepo(t *testing.T) {
	nodes, decisions := testGraph()
	governed := Govern(nodes, decisions)
	ids := func(list []Decision) string {
		var out []string
		for _, decision := range list {
			out = append(out, decision.ID)
		}
		return strings.Join(out, ",")
	}
	if got := ids(governed[""]); got != "decision-cents,decision-free" {
		t.Fatalf("root = %s", got)
	}
	if got := ids(governed["api"]); got != "decision-tokens" {
		t.Fatalf("api = %s", got)
	}
}

func TestDecisionFile(t *testing.T) {
	_, decisions := testGraph()
	name, content, ok := DecisionFile(decisions[0])
	if !ok || name != "0001-integer-cents.md" {
		t.Fatalf("name = %q ok=%v", name, ok)
	}
	if id, ok := DecisionMarker(content); !ok || id != "decision-cents" {
		t.Fatalf("marker = %q %v\n%s", id, ok, content)
	}
	if !strings.Contains(content, "# Decision 0001: Integer cents\n\nLifecycle status: accepted\n\n## Decision") {
		t.Fatalf("content = %s", content)
	}
	if _, _, ok := DecisionFile(Decision{ID: "x", Title: "Untitled decision"}); ok {
		t.Fatalf("an unnumbered title has no file")
	}
	if _, ok := DecisionMarker("# Decision 0001: Hand-written\n"); ok {
		t.Fatalf("hand-written files carry no marker")
	}
}

func TestBlockInheritsAncestors(t *testing.T) {
	nodes, decisions := testGraph()
	governed := Govern(nodes, decisions)
	api := Block("api", nodes, governed["api"], decisions)
	for _, want := range []string{
		"- shop/auth (domain) Auth · path: src/auth",
		"- Decision 0001: Integer cents (accepted)",
		"- Decision 0002: Short tokens",
		"- Money is integer cents (from shop)",
		"- Tokens expire in 15 minutes (from shop/auth)",
	} {
		if !strings.Contains(api, want) {
			t.Fatalf("api block missing %q:\n%s", want, api)
		}
	}
	if strings.Contains(api, "Old rule") || strings.Contains(api, "Decision 0003") || strings.Contains(api, "- shop (system)") {
		t.Fatalf("api block has foreign lines:\n%s", api)
	}
	root := Block("", nodes, governed[""], decisions)
	if strings.Contains(root, "Tokens expire") || !strings.Contains(root, "Decision 0003: Free standing") {
		t.Fatalf("root block:\n%s", root)
	}
	if !strings.HasPrefix(api, BlockBegin+"\n") || !strings.HasSuffix(api, BlockEnd+"\n") {
		t.Fatalf("sentinels:\n%s", api)
	}
}

func TestReplaceBlock(t *testing.T) {
	block := BlockBegin + "\nnew\n" + BlockEnd + "\n"

	got, err := ReplaceBlock("", block)
	if err != nil || got != block {
		t.Fatalf("empty file: %q %v", got, err)
	}
	got, err = ReplaceBlock("# Agents\n\nRules.\n", block)
	if err != nil || got != "# Agents\n\nRules.\n\n"+block {
		t.Fatalf("append: %q %v", got, err)
	}
	existing := "# Agents\n\n" + BlockBegin + "\nold\nhand edit\n" + BlockEnd + "\n\n## Tail\nKeep me.\n"
	got, err = ReplaceBlock(existing, block)
	if err != nil || got != "# Agents\n\n"+block+"\n## Tail\nKeep me.\n" {
		t.Fatalf("replace: %q %v", got, err)
	}
	again, err := ReplaceBlock(got, block)
	if err != nil || again != got {
		t.Fatalf("re-export must be stable: %q", again)
	}
	if _, err := ReplaceBlock("x\n"+BlockBegin+"\nno end\n", block); err == nil {
		t.Fatalf("missing end sentinel must fail")
	}
}
