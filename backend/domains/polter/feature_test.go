package polter

import (
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
)

func featureSnapshot(card work.Card) work.Snapshot {
	return work.Snapshot{
		ProjectID: "p1",
		Nodes: []structure.Node{
			{ID: "n-core", Level: structure.LevelDomain, Path: "core", Title: "Core", Status: structure.NodeActive,
				Decisions:  []string{"Verdict 0007"},
				Invariants: []structure.Invariant{{Text: "No network calls during scan", State: work.InvariantActive}}},
			{ID: "n-import", ParentID: "n-core", Level: structure.LevelComponent, Path: "core/import", Title: "Import",
				Intent: "Deterministic import of project files and git metadata", Status: structure.NodeActive},
			{ID: "n-auth", ParentID: "n-core", Level: structure.LevelComponent, Path: "core/auth", Title: "Auth",
				Intent: "Bearer sessions", Status: structure.NodeActive},
		},
		Cards: []work.Card{card},
	}
}

var featureVerdicts = []VerdictRef{
	{ID: "verdict-7", Title: "Verdict 0007: Deterministic import only", Status: "accepted"},
	{ID: "verdict-9", Title: "Verdict 0009: Checkouts", Status: "proposed"},
}

func TestReviewFeatureImpact(t *testing.T) {
	card := work.Card{
		Slug: "git-import", Title: "Git metadata import", Stage: work.StageShape, Status: work.CardActive,
		Intent: "Import git commits and branch as evidence", Under: "core/import", Decisions: []string{"Verdict-0009"},
		Questions: []work.Question{
			{ID: "q1", Text: "Include merge commits?", Blocking: true, State: work.QuestionOpen},
			{ID: "q2", Text: "How many commits?", State: work.QuestionOpen},
			{ID: "q3", Text: "Shallow clones?", State: work.QuestionAnswered, Answer: "skip"},
		},
		Invariants: []work.Invariant{{Text: "No network calls during the scan", State: work.InvariantActive}},
	}
	review, err := ReviewFeature(featureSnapshot(card), "git-import", featureVerdicts, map[string]string{"q2": RouteDelegated})
	if err != nil {
		t.Fatal(err)
	}
	if review.Under == nil || review.Under.Path != "core/import" || len(review.Suggested) != 0 {
		t.Fatalf("under = %+v suggested = %v", review.Under, review.Suggested)
	}
	var touches []string
	for _, node := range review.Touches {
		touches = append(touches, node.Path)
	}
	if strings.Join(touches, ",") != "core,core/import" {
		t.Fatalf("touches = %v", touches)
	}
	if len(review.Decisions) != 2 || review.Decisions[0].ID != "verdict-9" || review.Decisions[1].From != "core" {
		t.Fatalf("decisions = %+v", review.Decisions)
	}
	if len(review.Inherited) != 1 || review.Inherited[0].From != "core" {
		t.Fatalf("inherited = %+v", review.Inherited)
	}
	routes := map[string]string{}
	for _, q := range review.Questions {
		routes[q.ID] = q.Route
	}
	if routes["q1"] != RouteInbox || routes["q2"] != RouteDelegated || routes["q3"] != RouteAnswered {
		t.Fatalf("routes = %v", routes)
	}
	if !hasCheck(review, FeatureStepContract, SeverityError, "Include merge commits?") ||
		!hasCheck(review, FeatureStepPlan, SeverityError, "Include merge commits?") {
		t.Fatalf("blocking question should gate contract and plan: %+v", review.Checks)
	}
	if !hasCheck(review, FeatureStepContract, SeverityHint, "repeats") {
		t.Fatalf("near-duplicate inherited invariant should hint: %+v", review.Checks)
	}
	if !hasCheck(review, FeatureStepContract, SeverityHint, "is proposed, not active") {
		t.Fatalf("proposed decision should hint: %+v", review.Checks)
	}
	if !hasCheck(review, FeatureStepPlan, SeverityError, "no open tasks") {
		t.Fatalf("plan without tasks should be refused: %+v", review.Checks)
	}
	text := EncodeFeatureReview(review, FeatureStepShape)
	for _, want := range []string{"Under: core/import", "Touches: core, core/import", "Inherits: ! No network calls during scan (from core)", "→ delegated"} {
		if !strings.Contains(text, want) {
			t.Fatalf("encoded review misses %q:\n%s", want, text)
		}
	}
}

func TestReviewFeatureSuggestsUnder(t *testing.T) {
	card := work.Card{Slug: "commit-evidence", Title: "Commit evidence import", Stage: work.StageShape, Status: work.CardActive,
		Intent: "Import git commits"}
	review, err := ReviewFeature(featureSnapshot(card), "commit-evidence", nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(review.Suggested) == 0 || review.Suggested[0] != "core/import" {
		t.Fatalf("suggested = %v", review.Suggested)
	}
	if !hasCheck(review, FeatureStepShape, SeverityHint, "add under: core/import") {
		t.Fatalf("checks = %+v", review.Checks)
	}
	if _, err := ReviewFeature(featureSnapshot(card), "missing", nil, nil); err == nil {
		t.Fatal("unknown card should fail")
	}
}

func TestAdvanceTextGates(t *testing.T) {
	card := work.Card{Slug: "git-import", Title: "Git import", Stage: work.StageShape, Status: work.CardActive,
		Questions: []work.Question{{ID: "q1", Text: "Merge commits?", Blocking: true, State: work.QuestionOpen}}}
	review, _ := ReviewFeature(featureSnapshot(card), "git-import", nil, nil)
	if _, diags := AdvanceText(review, FeatureStepContract); !HasErrors(diags) {
		t.Fatal("blocking question should refuse the contract gate")
	}

	card.Questions[0].State, card.Questions[0].Answer = work.QuestionAnswered, "no"
	review, _ = ReviewFeature(featureSnapshot(card), "git-import", nil, nil)
	text, diags := AdvanceText(review, FeatureStepContract)
	if len(diags) != 0 || !strings.Contains(text, "## git-import\nstage: plan\n") {
		t.Fatalf("contract gate: text=%q diags=%+v", text, diags)
	}
	if _, diags := AdvanceText(review, FeatureStepPlan); !HasErrors(diags) {
		t.Fatal("plan gate from shape should be refused")
	}

	card.Stage = work.StagePlan
	review, _ = ReviewFeature(featureSnapshot(card), "git-import", nil, nil)
	if _, diags := AdvanceText(review, FeatureStepPlan); !HasErrors(diags) {
		t.Fatal("plan gate without open tasks should be refused")
	}
	card.Tasks = []work.Task{{Number: 1, Title: "Read HEAD", State: work.TaskOpen}}
	review, _ = ReviewFeature(featureSnapshot(card), "git-import", nil, nil)
	text, diags = AdvanceText(review, FeatureStepPlan)
	if len(diags) != 0 || !strings.Contains(text, "stage: build") {
		t.Fatalf("plan gate: text=%q diags=%+v", text, diags)
	}
	if !hasCheck(review, FeatureStepPlan, SeverityHint, "T1 has no scope") {
		t.Fatalf("task without scope should hint: %+v", review.Checks)
	}
}

func TestCreateFeatureText(t *testing.T) {
	snapshot := work.Snapshot{Cards: []work.Card{{Slug: "import-git-commits", Status: work.CardRemoved}}}
	slug, text, err := CreateFeatureText(snapshot, "Import git commits. Then\n- [ ] not a task", "", "core/import", "")
	if err != nil {
		t.Fatal(err)
	}
	if slug != "import-git-commits-2" {
		t.Fatalf("slug = %q (a removed card keeps its slug)", slug)
	}
	doc, diags := Decode(text)
	if HasErrors(diags) || len(doc.Cards) != 1 || len(doc.Cards[0].Tasks) != 0 {
		t.Fatalf("decode: %+v %+v", diags, doc.Cards)
	}
	if under, _ := doc.Cards[0].MetaValue("under"); under != "core/import" {
		t.Fatalf("under = %q", under)
	}
	if _, _, err := CreateFeatureText(snapshot, "   ", "", "", ""); err == nil {
		t.Fatal("empty intent should fail")
	}
}

func TestFeatureTitleAndSlug(t *testing.T) {
	if got := FeatureTitle("Import HEAD as evidence. Also commits."); got != "Import HEAD as evidence" {
		t.Fatalf("title = %q", got)
	}
	long := strings.Repeat("word ", 20)
	if got := FeatureTitle(long); len([]rune(got)) > 60 || strings.HasSuffix(got, " ") {
		t.Fatalf("long title = %q", got)
	}
	if got := UniqueCardSlug([]string{"cafe-import"}, "Café import"); got != "cafe-import-2" {
		t.Fatalf("slug = %q", got)
	}
	if got := UniqueCardSlug(nil, "!!!"); got != "card" {
		t.Fatalf("empty slug = %q", got)
	}
}

func TestParseFeatureQueries(t *testing.T) {
	q, err := ParseQuery("feature git-import contract")
	if err != nil || q.Kind != QueryFeature || q.Slug != "git-import" || q.Step != FeatureStepContract {
		t.Fatalf("feature query = %+v err=%v", q, err)
	}
	if q, err := ParseQuery("feature git-import"); err != nil || q.Step != FeatureStepShape {
		t.Fatalf("default step = %+v err=%v", q, err)
	}
	if _, err := ParseQuery("feature git-import build"); err == nil {
		t.Fatal("unknown step should fail")
	}
	if q, err := ParseQuery("verify git-import#T2"); err != nil || q.Kind != QueryVerify || q.Slug != "git-import#T2" {
		t.Fatalf("verify query = %+v err=%v", q, err)
	}
}

func TestLintStageHint(t *testing.T) {
	cards := []work.Card{{Slug: "git-import", Stage: work.StageShape, Status: work.CardActive,
		Questions: []work.Question{{Text: "Merge commits?", Blocking: true, State: work.QuestionOpen}}}}
	_, diags := Lint("---\npolter: 1\n---\n## git-import\nstage: build\n", &References{Cards: cards})
	if HasErrors(diags) || !hasDiag(diags, 5, "blocking question") {
		t.Fatalf("diags = %+v", diags)
	}
	_, diags = Lint("---\npolter: 1\n---\n## git-import\nstage: build\n? Merge commits? -> no\n", &References{Cards: cards})
	if hasDiag(diags, 5, "blocking question") {
		t.Fatalf("answered in the same text should not hint: %+v", diags)
	}
}

func TestVerifyFeature(t *testing.T) {
	card := work.Card{Slug: "git-import", Stage: work.StageBuild, Tasks: []work.Task{
		{Number: 1, Title: "Read HEAD", State: work.TaskDone},
		{Number: 2, Title: "Stamp facts", State: work.TaskOpen},
		{Number: 3, Title: "Old idea", State: work.TaskDropped},
		{Number: 4, Title: "Link commits", State: work.TaskDone},
	}}
	result, err := VerifyFeature(VerifyInput{Card: card, Unmatched: map[int]bool{4: true}, GitReady: true,
		Contract: []ReviewInvariant{{Text: "No network calls", From: "core"}}})
	if err != nil {
		t.Fatal(err)
	}
	if result.Passed {
		t.Fatalf("open task and unmatched done task should fail: %+v", result)
	}
	text := EncodeVerify(result)
	for _, want := range []string{"verify git-import  FAIL", "fail  T2 is open", "fail  T4 is done with no commit on main", "pass  T1 done", "check ! No network calls (from core)"} {
		if !strings.Contains(text, want) {
			t.Fatalf("verify text misses %q:\n%s", want, text)
		}
	}
	one, err := VerifyFeature(VerifyInput{Card: card, Task: 1, GitReady: true})
	if err != nil || !one.Passed || one.Target != "git-import#T1" {
		t.Fatalf("task verify = %+v err=%v", one, err)
	}
	if _, err := VerifyFeature(VerifyInput{Card: card, Task: 9}); err == nil {
		t.Fatal("unknown task should fail")
	}
}

func hasCheck(review FeatureReview, step, severity, fragment string) bool {
	for _, check := range review.Checks {
		if check.Step == step && check.Severity == severity && strings.Contains(check.Message, fragment) {
			return true
		}
	}
	return false
}

func TestCreateFeatureTextArchitecture(t *testing.T) {
	_, text, err := CreateFeatureText(work.Snapshot{}, "Move sync to Connect", "", "core", "architecture")
	if err != nil || !strings.Contains(text, "kind: architecture") {
		t.Fatalf("text = %q, err = %v", text, err)
	}
	if _, _, err := CreateFeatureText(work.Snapshot{}, "x", "", "", "bogus"); err == nil {
		t.Fatal("expected an error for an unknown kind")
	}
}

func TestParseMigration(t *testing.T) {
	for _, value := range []string{"REST -> Connect", "REST → Connect", " REST->Connect "} {
		from, to, ok := ParseMigration(value)
		if !ok || from != "REST" || to != "Connect" {
			t.Fatalf("ParseMigration(%q) = %q, %q, %v", value, from, to, ok)
		}
	}
	if _, _, ok := ParseMigration("REST"); ok {
		t.Fatal("a value without an arrow must be refused")
	}
	if from, to, ok := ParseMigration(""); !ok || from != "" || to != "" {
		t.Fatal("an empty value clears the state")
	}
}

func TestParseQueryStructureAt(t *testing.T) {
	q, err := ParseQuery("structure core/import at 2026-09-01")
	if err != nil || q.Kind != QueryStructure || q.Slug != "core/import" || q.At != "2026-09-01" {
		t.Fatalf("query = %+v, err = %v", q, err)
	}
	q, err = ParseQuery("structure history")
	if err != nil || !q.History {
		t.Fatalf("query = %+v, err = %v", q, err)
	}
}

func TestParseQueryCanvas(t *testing.T) {
	q, err := ParseQuery("canvas")
	if err != nil || q.Kind != QueryCanvas || q.Slug != "" {
		t.Fatalf("query = %+v, err = %v", q, err)
	}
	q, err = ParseQuery("canvas Shared map")
	if err != nil || q.Kind != QueryCanvas || q.Slug != "Shared map" {
		t.Fatalf("query = %+v, err = %v", q, err)
	}
}
