package polter

import (
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/domains/work"
)

const sample = `---
polter: 1
summary: Plan git import
rationale: Slice 5 needs cards
---

# Roadmap

## git-metadata-import: Git metadata import
stage: plan · owner: erick · decisions: Decision-0007

Import HEAD, branch and recent commits as evidence.

- [ ] T1 Commit evidence upsert ` + "`backend/domains/canon/*`" + `
- [X] Stamp revision on observed facts
? Include merge commits? [blocking] (yes | no | first-parent)
! No network calls during scan
`

func TestDecodeSample(t *testing.T) {
	doc, diags := Decode(sample)
	if len(diags) > 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if doc.Summary != "Plan git import" || len(doc.Cards) != 1 {
		t.Fatalf("doc = %+v", doc)
	}
	card := doc.Cards[0]
	if card.Slug != "git-metadata-import" || card.Title != "Git metadata import" {
		t.Fatalf("card = %+v", card)
	}
	if stage, _ := card.MetaValue("stage"); stage != "plan" {
		t.Fatalf("stage = %q", stage)
	}
	if card.Intent != "Import HEAD, branch and recent commits as evidence." {
		t.Fatalf("intent = %q", card.Intent)
	}
	if len(card.Tasks) != 2 || card.Tasks[0].Number != 1 || card.Tasks[0].Scope != "backend/domains/canon/*" {
		t.Fatalf("tasks = %+v", card.Tasks)
	}
	if card.Tasks[1].State != work.TaskDone {
		t.Fatalf("[X] should be done: %+v", card.Tasks[1])
	}
	q := card.Questions[0]
	if !q.Blocking || len(q.Options) != 3 || q.Text != "Include merge commits?" {
		t.Fatalf("question = %+v", q)
	}
	if card.Invariants[0].Text != "No network calls during scan" {
		t.Fatalf("invariant = %+v", card.Invariants[0])
	}
}

func TestFormatRoundTrip(t *testing.T) {
	doc, _ := Decode(sample)
	once := Format(doc)
	again, diags := Decode(once)
	if len(diags) > 0 {
		t.Fatalf("canonical text has diagnostics: %+v\n%s", diags, once)
	}
	if twice := Format(again); twice != once {
		t.Fatalf("round trip differs:\n%s\n---\n%s", once, twice)
	}
}

func TestDecodeDiagnostics(t *testing.T) {
	text := "---\npolter: 1\n---\n- [ ] orphan\n## Bad Slug: x\n## ok: One\nstage: doing\n- [] broken\n## ok: Two\n"
	_, diags := Decode(text)
	want := map[int]string{
		4: "task outside a card",
		5: "invalid slug",
		7: "unknown stage",
		8: "malformed checkbox",
		9: "duplicate slug",
	}
	for line, fragment := range want {
		if !hasDiag(diags, line, fragment) {
			t.Errorf("missing line %d %q in %+v", line, fragment, diags)
		}
	}
}

func TestDecodeMissingHeader(t *testing.T) {
	_, diags := Decode("## a: A\n")
	if !hasDiag(diags, 1, "missing version header") {
		t.Fatalf("diags = %+v", diags)
	}
}

func TestPlanIsIdempotent(t *testing.T) {
	doc, _ := Decode(sample)
	ops, diags := Plan(doc, work.Snapshot{})
	if len(diags) > 0 || len(ops) != 5 {
		t.Fatalf("ops=%d diags=%+v", len(ops), diags)
	}
	snapshot := snapshotFromOps(ops)
	again, diags := Plan(doc, snapshot)
	if len(diags) > 0 || len(again) != 0 {
		t.Fatalf("re-apply should be a no-op, got %s", FormatPlan(again))
	}
	// Encoding the stored card and planning it back is also a no-op.
	encoded, _ := Decode(EncodeCard(snapshot.Cards[0]))
	if back, _ := Plan(encoded, snapshot); len(back) != 0 {
		t.Fatalf("encode round trip should be a no-op, got %s", FormatPlan(back))
	}
}

func TestPlanPartialAndRemoval(t *testing.T) {
	doc, _ := Decode(sample)
	ops, _ := Plan(doc, work.Snapshot{})
	snapshot := snapshotFromOps(ops)

	update := "---\npolter: 1\n---\n## git-metadata-import\nstage: build\n- [x] T1 Commit evidence upsert\n- [ ] New follow-up\n! No network calls during scan [removed]\n"
	parsed, diags := Decode(update)
	if len(diags) > 0 {
		t.Fatalf("diags = %+v", diags)
	}
	ops, diags = Plan(parsed, snapshot)
	if len(diags) > 0 {
		t.Fatalf("plan diags = %+v", diags)
	}
	plan := FormatPlan(ops)
	for _, fragment := range []string{
		"~ card git-metadata-import stage: plan → build",
		"~ task git-metadata-import T1 state: open → done",
		`+ task git-metadata-import T3 "New follow-up"`,
		"- invariant git-metadata-import",
	} {
		if !strings.Contains(plan, fragment) {
			t.Errorf("plan missing %q:\n%s", fragment, plan)
		}
	}
	if strings.Contains(plan, "intent") || strings.Contains(plan, "question") {
		t.Errorf("partial text must not touch unmentioned fields:\n%s", plan)
	}
}

func TestPlanUnknownReferences(t *testing.T) {
	doc, _ := Decode(sample)
	ops, _ := Plan(doc, work.Snapshot{})
	snapshot := snapshotFromOps(ops)

	_, diags := Plan(mustDecode(t, "---\npolter: 1\n---\n## missing\n"), snapshot)
	if !hasDiag(diags, 4, "unknown card") {
		t.Errorf("diags = %+v", diags)
	}
	_, diags = Plan(mustDecode(t, "---\npolter: 1\n---\n## git-metadata-import\n- [ ] T9 Ghost\n"), snapshot)
	if !hasDiag(diags, 5, "unknown task T9") {
		t.Errorf("diags = %+v", diags)
	}
}

func TestLintReferences(t *testing.T) {
	_, diags := Lint(sample, &References{Decisions: []DecisionRef{{ID: "decision-x", Title: "Decision 0007: Deterministic import"}}})
	if HasErrors(diags) {
		t.Fatalf("Decision-0007 should resolve: %+v", diags)
	}
	_, diags = Lint(sample, &References{})
	if !hasDiag(diags, 10, "unknown decision") {
		t.Fatalf("diags = %+v", diags)
	}
}

func TestHandoffDecodePlanRoundTrip(t *testing.T) {
	text := `---
polter: 1
summary: Handoff for git import
rationale: Session handoff
---

## git-metadata-import: Git metadata import
stage: build

handoff:
branch: feat/git-import
agent: codex
goal: import HEAD as evidence
done: commit upsert
in_progress: stamp revision
next: wire import
touched: backend/import.go, docs/spec.md

- [ ] T1 Wire import
? Include merge commits? [blocking]
`
	doc, diags := Decode(text)
	if HasErrors(diags) {
		t.Fatalf("diags = %+v", diags)
	}
	h := doc.Cards[0].Handoff
	if h == nil || h.Branch != "feat/git-import" || h.Agent != "codex" || h.InProgress != "stamp revision" {
		t.Fatalf("handoff = %+v", h)
	}
	if len(h.Touched) != 2 || h.Touched[1] != "docs/spec.md" {
		t.Fatalf("touched = %+v", h.Touched)
	}
	ops, planDiags := Plan(doc, work.Snapshot{})
	if len(planDiags) > 0 {
		t.Fatalf("plan diags = %+v", planDiags)
	}
	var handoffs int
	for _, op := range ops {
		if op.Entity == work.EntityHandoff && op.Kind == work.OpCreate {
			handoffs++
		}
	}
	if handoffs != 1 {
		t.Fatalf("ops = %s", FormatPlan(ops))
	}
	snapshot := snapshotFromOps(ops)
	again, planDiags := Plan(doc, snapshot)
	if len(planDiags) > 0 || len(again) != 0 {
		t.Fatalf("re-apply should be a no-op: %s diags=%+v", FormatPlan(again), planDiags)
	}
	encoded, diags := Decode(EncodeCard(snapshot.Cards[0]))
	if HasErrors(diags) {
		t.Fatalf("encode diags = %+v\n%s", diags, EncodeCard(snapshot.Cards[0]))
	}
	if back, _ := Plan(encoded, snapshot); len(back) != 0 {
		t.Fatalf("encode round trip should be a no-op, got %s", FormatPlan(back))
	}
	once := Format(doc)
	twice := Format(mustDecode(t, once))
	if twice != once {
		t.Fatalf("round trip differs:\n%s\n---\n%s", once, twice)
	}
}

func TestHandoffDiagnostics(t *testing.T) {
	_, diags := Decode("---\npolter: 1\n---\n## a: A\nhandoff:\ngoal: missing branch\n")
	if !hasDiag(diags, 5, "handoff needs branch") {
		t.Fatalf("diags = %+v", diags)
	}
	_, diags = Decode("---\npolter: 1\n---\n## a: A\nhandoff:\nbranch: feat\nowner: erick\n")
	if !hasDiag(diags, 7, "unknown handoff key") {
		t.Fatalf("diags = %+v", diags)
	}
	_, diags = Decode("---\npolter: 1\n---\nhandoff:\nbranch: feat\n")
	if !hasDiag(diags, 4, "handoff outside a card") {
		t.Fatalf("diags = %+v", diags)
	}
}

func TestLintHints(t *testing.T) {
	cards := []work.Card{
		{
			Slug: "git-import", Title: "Git import", Status: work.CardActive, Under: "core/import",
			Questions:  []work.Question{{Text: "Include merge commits?", State: work.QuestionOpen}},
			Invariants: []work.Invariant{{Text: "No network calls during scan", State: work.InvariantActive}},
		},
		{Slug: "commits-panel", Title: "Commits panel", Status: work.CardActive, Under: "desktop/reality"},
	}
	text := `---
polter: 1
---
## import-git-metadata: Import Git metadata
? Should we include merge commits?
! No network calls during the scan

## import-cache: Import cache
`
	_, diags := Lint(text, &References{Cards: cards})
	if HasErrors(diags) {
		t.Fatalf("hints must not be errors: %+v", diags)
	}
	for _, want := range []struct {
		line int
		text string
	}{
		{4, `similar to card "git-import"`},
		{5, `similar to open question on "git-import"`},
		{6, `similar to invariant on "git-import"`},
		{8, `add under: core/import`},
	} {
		if !hasDiag(diags, want.line, want.text) {
			t.Errorf("missing hint %d %q in %+v", want.line, want.text, diags)
		}
	}
	if hasDiag(diags, 4, "add under:") && !hasDiag(diags, 4, "core/import") {
		t.Errorf("placement for line 4 should be core/import: %+v", diags)
	}
	if hasDiag(diags, 8, "similar to card") {
		t.Errorf("import-cache is not a duplicate: %+v", diags)
	}

	// Known cards and matching items stay silent.
	_, diags = Lint("---\npolter: 1\n---\n## git-import: Git import\n? Include merge commits?\n", &References{Cards: cards})
	if len(diags) != 0 {
		t.Errorf("known card should be silent: %+v", diags)
	}
}

func mustDecode(t *testing.T, text string) Document {
	t.Helper()
	doc, diags := Decode(text)
	if HasErrors(diags) {
		t.Fatalf("decode %q: %+v", text, diags)
	}
	return doc
}

func hasDiag(diags []Diagnostic, line int, fragment string) bool {
	for _, d := range diags {
		if d.Line == line && strings.Contains(d.Message, fragment) {
			return true
		}
	}
	return false
}

// snapshotFromOps simulates the store applying create ops.
func snapshotFromOps(ops []work.Op) work.Snapshot {
	var snapshot work.Snapshot
	index := map[string]int{}
	for _, op := range ops {
		f := op.Fields
		switch op.Entity {
		case work.EntityCard:
			index[op.CardID] = len(snapshot.Cards)
			snapshot.Cards = append(snapshot.Cards, work.Card{
				ID: op.CardID, Slug: f["slug"].(string), Title: f["title"].(string), Intent: f["intent"].(string),
				Stage: f["stage"].(string), Status: f["status"].(string), Owner: f["owner"].(string),
				Under: f["under"].(string), Decisions: f["decisions"].([]string), Position: f["position"].(int),
			})
		case work.EntityTask:
			c := &snapshot.Cards[index[op.CardID]]
			c.Tasks = append(c.Tasks, work.Task{
				ID: op.EntityID, CardID: op.CardID, Number: f["number"].(int), Title: f["title"].(string),
				State: f["state"].(string), Scope: f["scope"].(string), Position: f["position"].(int),
			})
		case work.EntityQuestion:
			c := &snapshot.Cards[index[op.CardID]]
			c.Questions = append(c.Questions, work.Question{
				ID: op.EntityID, CardID: op.CardID, Text: f["text"].(string), Blocking: f["blocking"].(bool),
				Options: f["options"].([]string), State: f["state"].(string), Position: f["position"].(int),
			})
		case work.EntityInvariant:
			c := &snapshot.Cards[index[op.CardID]]
			c.Invariants = append(c.Invariants, work.Invariant{
				ID: op.EntityID, CardID: op.CardID, Text: f["text"].(string), State: f["state"].(string),
				Position: f["position"].(int),
			})
		case work.EntityHandoff:
			c := &snapshot.Cards[index[op.CardID]]
			c.Handoffs = append(c.Handoffs, work.Handoff{
				ID: op.EntityID, CardID: op.CardID, Branch: f["branch"].(string), Agent: f["agent"].(string),
				Goal: f["goal"].(string), Done: f["done"].(string), InProgress: f["in_progress"].(string),
				Next: f["next"].(string), Touched: f["touched"].([]string),
			})
		}
	}
	return snapshot
}
