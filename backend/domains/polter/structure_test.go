package polter

import (
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
)

func TestDecodeStructureNode(t *testing.T) {
	text := `---
polter: 1
---
# core: Core
level: domain

The core.

! No network calls during scan

# core/import: Import
level: component
under: core

## git-import: Git import
under: core/import
`
	doc, diags := Decode(text)
	if HasErrors(diags) {
		t.Fatalf("decode: %+v", diags)
	}
	if len(doc.Nodes) != 2 || doc.Nodes[0].Slug != "core" || doc.Nodes[0].Path != "core" {
		t.Fatalf("nodes = %+v", doc.Nodes)
	}
	if level, _ := doc.Nodes[1].MetaValue("level"); level != "component" || len(doc.Nodes[0].Invariants) != 1 {
		t.Fatalf("meta/invariants = %+v", doc.Nodes)
	}
	if len(doc.Cards) != 1 || doc.Cards[0].Slug != "git-import" {
		t.Fatalf("cards = %+v", doc.Cards)
	}
	again := Format(doc)
	round, diags := Decode(again)
	if HasErrors(diags) || len(round.Nodes) != 2 || len(round.Cards) != 1 {
		t.Fatalf("round trip: %+v nodes=%d", diags, len(round.Nodes))
	}
}

func TestLintUnderRequiresComponent(t *testing.T) {
	nodes := []structure.Node{{
		ID: "n1", Path: "core/import", Level: structure.LevelComponent, Status: structure.NodeActive,
	}}
	bad := "---\npolter: 1\n---\n## git-import: Git import\nunder: missing\n"
	_, diags := Lint(bad, &References{Nodes: nodes})
	if !hasDiag(diags, 4, "unknown under") {
		t.Fatalf("diags = %+v", diags)
	}
	ok := "---\npolter: 1\n---\n## git-import: Git import\nunder: core/import\n"
	_, diags = Lint(ok, &References{Nodes: nodes})
	if HasErrors(diags) {
		t.Fatalf("component under should pass: %+v", diags)
	}
	legacy := "---\npolter: 1\n---\n## git-import: Git import\nunder: core/import\n"
	_, diags = Lint(legacy, &References{})
	if HasErrors(diags) {
		t.Fatalf("legacy under should pass with no components: %+v", diags)
	}
}

func TestPlanMoveNode(t *testing.T) {
	snapshot := work.Snapshot{
		ProjectID: "p1",
		Nodes: []structure.Node{
			{ID: "desktop", Path: "desktop", Level: structure.LevelDomain, Title: "Desktop", Status: structure.NodeActive},
			{ID: "mobile", Path: "mobile", Level: structure.LevelDomain, Title: "Mobile", Status: structure.NodeActive},
			{ID: "core", ParentID: "desktop", Path: "desktop/core", Level: structure.LevelComponent, Title: "Core", Status: structure.NodeActive},
		},
		Cards: []work.Card{{
			ID: "card-1", Slug: "import", Title: "Import", Under: "desktop/core", Status: work.CardActive,
		}},
	}
	text := "---\npolter: 1\n---\n# desktop/core: Core\nlevel: component\nunder: mobile\n"
	doc, diags := Decode(text)
	if HasErrors(diags) {
		t.Fatalf("decode: %+v", diags)
	}
	ops, diags := Plan(doc, snapshot)
	if HasErrors(diags) {
		t.Fatalf("plan: %+v", diags)
	}
	moved := map[string]string{}
	for _, op := range ops {
		if op.Kind != work.OpUpdate {
			continue
		}
		if path, ok := op.Fields["path"].(string); ok {
			moved[op.EntityID] = path
		}
		if under, ok := op.Fields["under"].(string); ok {
			moved[op.EntityID] = under
		}
		if parent, ok := op.Fields["parent_id"].(string); ok && op.EntityID == "core" && parent != "mobile" {
			t.Fatalf("parent = %s", parent)
		}
	}
	if moved["core"] != "mobile/core" || moved["card-1"] != "mobile/core" {
		t.Fatalf("moved = %+v ops = %+v", moved, ops)
	}
}

func TestLintNodeParent(t *testing.T) {
	text := `---
polter: 1
---
# core/import: Import
level: component
under: core
`
	_, diags := Lint(text, &References{})
	if !hasDiag(diags, 4, "unknown under") {
		t.Fatalf("diags = %+v", diags)
	}
}

func TestBriefBudgetCutsFromTheEnd(t *testing.T) {
	system := structure.Node{ID: "s", Path: "polterware", Level: structure.LevelDomain, Title: "Polterware", Status: structure.NodeActive}
	domain := structure.Node{
		ID: "d", ParentID: "s", Path: "core", Level: structure.LevelDomain, Title: "Core", Status: structure.NodeActive,
	}
	component := structure.Node{ID: "c", ParentID: "d", Path: "core/import", Level: structure.LevelComponent, Title: "Import", Status: structure.NodeActive}
	card := work.Card{
		Slug: "git-import", Title: "Git import", Stage: work.StageBuild, Status: work.CardActive, Under: "core/import",
		Intent: "Import HEAD as evidence.",
		Tasks:  []work.Task{{Number: 1, Title: "Upsert commit evidence", State: work.TaskOpen}},
		Questions: []work.Question{{
			Text: "Include merge commits?", Blocking: true, State: work.QuestionOpen, Options: []string{"yes", "no"},
		}},
	}
	nodes := []structure.Node{system, domain, component}
	rules := []work.Rule{{ID: "r1", Statement: "No network calls during scan", Scopes: []string{"core"}}}
	in := BriefInput{Snapshot: work.Snapshot{Nodes: nodes, Cards: []work.Card{card}, Rules: rules}}
	full, err := Brief(in, "git-import", 800)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(full, "- No network calls during scan (from core)") || !strings.Contains(full, "? Include merge commits? [blocking] (yes | no)") || strings.Contains(full, "cut to fit") {
		t.Fatalf("full brief = %s", full)
	}
	tight, err := Brief(in, "git-import", 30)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(tight, "(from core)") || strings.Contains(tight, "Include merge commits") || !strings.HasPrefix(tight, "## git-import: Git import\nstage: build · under: core/import\n") || !strings.Contains(tight, "lines cut to fit budget:30") {
		t.Fatalf("a tight budget keeps the heading and the Rules and cuts the rest: %s", tight)
	}
}

func TestPlanMovesComponentToTheProjectRoot(t *testing.T) {
	snapshot := work.Snapshot{
		ProjectID: "p1",
		Nodes: []structure.Node{
			{ID: "desktop", Path: "desktop", Level: structure.LevelDomain, Title: "Desktop", Status: structure.NodeActive},
			{ID: "core", ParentID: "desktop", Path: "desktop/core", Level: structure.LevelComponent, Title: "Core", Status: structure.NodeActive},
		},
	}
	doc, diags := Decode("---\npolter: 1\n---\n# desktop/core: Core\nlevel: component\nunder:\n")
	if HasErrors(diags) {
		t.Fatalf("decode: %+v", diags)
	}
	ops, diags := Plan(doc, snapshot)
	if HasErrors(diags) || len(ops) != 1 || ops[0].Fields["path"] != "core" || ops[0].Fields["parent_id"] != "" {
		t.Fatalf("ops = %+v diags = %+v", ops, diags)
	}
}

func TestPlanRefusesSystemAndNestedDomains(t *testing.T) {
	snapshot := work.Snapshot{ProjectID: "p1", Nodes: []structure.Node{
		{ID: "core", Path: "core", Level: structure.LevelDomain, Title: "Core", Status: structure.NodeActive},
	}}
	for text, want := range map[string]string{
		"# app: App\nlevel: system\n":                   "level",
		"# core/sub: Sub\nlevel: domain\nunder: core\n": "sits under the project",
	} {
		doc, diags := Decode("---\npolter: 1\n---\n" + text)
		if !HasErrors(diags) {
			_, diags = Plan(doc, snapshot)
		}
		if !HasErrors(diags) || !strings.Contains(diags[0].Message, want) {
			t.Fatalf("%q: diags = %+v", text, diags)
		}
	}
}
