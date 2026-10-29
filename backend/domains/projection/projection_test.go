package projection

import (
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
)

func testGraph() ([]structure.Node, []Verdict) {
	nodes := []structure.Node{
		{ID: "s", Path: "shop", Level: structure.LevelSystem, Title: "Shop", Status: structure.NodeActive,
			Decisions:  []string{"Verdict 0001"},
			Invariants: []structure.Invariant{{Text: "Money is integer cents", State: work.InvariantActive}}},
		{ID: "d", ParentID: "s", Path: "shop/auth", Level: structure.LevelDomain, Title: "Auth", Status: structure.NodeActive,
			Repo: "api", Folder: "src/auth", Decisions: []string{"verdict-tokens"},
			Invariants: []structure.Invariant{
				{Text: "Tokens expire in 15 minutes", State: work.InvariantActive},
				{Text: "Old rule", State: work.InvariantRemoved},
			}},
	}
	verdicts := []Verdict{
		{ID: "verdict-cents", Title: "Verdict 0001: Integer cents", Body: "## Decision\n\nStore cents.", Status: "accepted"},
		{ID: "verdict-tokens", Title: "Verdict 0002: Short tokens", Body: "## Decision\n\nShort tokens."},
		{ID: "verdict-free", Title: "Verdict 0003: Free standing", Body: "Body."},
	}
	return nodes, verdicts
}

func TestGovernByCitingNodeRepo(t *testing.T) {
	nodes, verdicts := testGraph()
	governed := Govern(nodes, verdicts)
	ids := func(list []Verdict) string {
		var out []string
		for _, verdict := range list {
			out = append(out, verdict.ID)
		}
		return strings.Join(out, ",")
	}
	if got := ids(governed[""]); got != "verdict-cents,verdict-free" {
		t.Fatalf("root = %s", got)
	}
	if got := ids(governed["api"]); got != "verdict-tokens" {
		t.Fatalf("api = %s", got)
	}
}

func TestVerdictFile(t *testing.T) {
	_, verdicts := testGraph()
	name, content, ok := VerdictFile(verdicts[0])
	if !ok || name != "0001-integer-cents.md" {
		t.Fatalf("name = %q ok=%v", name, ok)
	}
	if id, ok := VerdictMarker(content); !ok || id != "verdict-cents" {
		t.Fatalf("marker = %q %v\n%s", id, ok, content)
	}
	if !strings.Contains(content, "# Verdict 0001: Integer cents\n\nLifecycle status: accepted\n\n## Decision") {
		t.Fatalf("content = %s", content)
	}
	if _, _, ok := VerdictFile(Verdict{ID: "x", Title: "Untitled decision"}); ok {
		t.Fatalf("an unnumbered title has no file")
	}
	if _, ok := VerdictMarker("# Verdict 0001: Hand-written\n"); ok {
		t.Fatalf("hand-written files carry no marker")
	}
}

func TestBlockInheritsAncestors(t *testing.T) {
	nodes, verdicts := testGraph()
	governed := Govern(nodes, verdicts)
	api := Block("api", nodes, governed["api"], verdicts)
	for _, want := range []string{
		"- shop/auth (domain) Auth · path: src/auth",
		"- Verdict 0001: Integer cents (accepted)",
		"- Verdict 0002: Short tokens",
		"- Money is integer cents (from shop)",
		"- Tokens expire in 15 minutes (from shop/auth)",
	} {
		if !strings.Contains(api, want) {
			t.Fatalf("api block missing %q:\n%s", want, api)
		}
	}
	if strings.Contains(api, "Old rule") || strings.Contains(api, "Verdict 0003") || strings.Contains(api, "- shop (system)") {
		t.Fatalf("api block has foreign lines:\n%s", api)
	}
	root := Block("", nodes, governed[""], verdicts)
	if strings.Contains(root, "Tokens expire") || !strings.Contains(root, "Verdict 0003: Free standing") {
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
