package wedge_test

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/polter"
	"github.com/polterware/polterware/backend/domains/work"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestFeatureFlowEndToEnd(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "feature.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	project, err := wedge.InitProject(store, wedge.InitInput{Name: "Demo"})
	if err != nil {
		t.Fatal(err)
	}
	apply := func(in wedge.ApplyInput) {
		t.Helper()
		in.AutoStartLabel = "cli"
		if _, err := wedge.ApplyPolter(store, in); err != nil {
			t.Fatalf("apply %q: %v", in.Text, err)
		}
	}

	slug, in, err := wedge.ComposeFeature(store, wedge.CreateFeatureInput{
		ProjectID: project.ID, Intent: "Import git commits as evidence. No network.",
	})
	if err != nil || slug != "import-git-commits-as-evidence" || in.Summary == "" || in.Rationale == "" {
		t.Fatalf("compose: slug=%q in=%+v err=%v", slug, in, err)
	}
	apply(in)
	review, err := wedge.ReviewFeature(store, project.ID, slug)
	if err != nil || review.Card.Stage != work.StageShape || review.Card.Intent != "Import git commits as evidence. No network." {
		t.Fatalf("review = %+v err=%v", review.Card, err)
	}

	apply(wedge.ApplyInput{ProjectID: project.ID, Summary: "Ask", Rationale: "Shape",
		Text: "---\npolter: 1\n---\n## " + slug + "\n? Include merge commits? [blocking]\n! No network calls during scan\n"})
	_, _, diags, err := wedge.ComposeAdvance(store, project.ID, slug, polter.FeatureStepContract)
	if err != nil || !polter.HasErrors(diags) || !strings.Contains(diags[0].Message, "Include merge commits?") {
		t.Fatalf("blocked contract gate: diags=%+v err=%v", diags, err)
	}

	apply(wedge.ApplyInput{ProjectID: project.ID, Summary: "Decide", Rationale: "Shape",
		Text: "---\npolter: 1\n---\n## " + slug + "\n? Include merge commits? -> no\n"})
	advance, _, diags, err := wedge.ComposeAdvance(store, project.ID, slug, polter.FeatureStepContract)
	if err != nil || len(diags) != 0 {
		t.Fatalf("contract gate: diags=%+v err=%v", diags, err)
	}
	apply(advance)
	if review, _ = wedge.ReviewFeature(store, project.ID, slug); review.Card.Stage != work.StagePlan {
		t.Fatalf("stage after contract = %q", review.Card.Stage)
	}

	apply(wedge.ApplyInput{ProjectID: project.ID, Summary: "Plan", Rationale: "Plan",
		Text: "---\npolter: 1\n---\n## " + slug + "\n- [ ] Read HEAD `backend/git/*`\n- [ ] Stamp facts\n"})
	advance, _, diags, err = wedge.ComposeAdvance(store, project.ID, slug, polter.FeatureStepPlan)
	if err != nil || len(diags) != 0 {
		t.Fatalf("plan gate: diags=%+v err=%v", diags, err)
	}
	apply(advance)
	if review, _ = wedge.ReviewFeature(store, project.ID, slug); review.Card.Stage != work.StageBuild {
		t.Fatalf("stage after plan = %q", review.Card.Stage)
	}

	text, err := wedge.QueryPolter(store, project.ID, "feature "+slug+" plan")
	if err != nil || !strings.Contains(text, "Task: [ ] T1 Read HEAD `backend/git/*`") || !strings.Contains(text, "hint: T2 has no scope") {
		t.Fatalf("feature query = %q err=%v", text, err)
	}

	result, err := wedge.VerifyFeature(store, project.ID, slug)
	if err != nil || result.Passed {
		t.Fatalf("verify with open tasks should fail: %+v err=%v", result, err)
	}
	apply(wedge.ApplyInput{ProjectID: project.ID, Summary: "Done", Rationale: "Build",
		Text: "---\npolter: 1\n---\n## " + slug + "\n- [x] T1 Read HEAD `backend/git/*`\n"})
	one, err := wedge.VerifyFeature(store, project.ID, slug+"#T1")
	if err != nil || !one.Passed {
		t.Fatalf("verify T1 = %+v err=%v", one, err)
	}
	if review, _ = wedge.ReviewFeature(store, project.ID, slug); review.Card.Stage != work.StageBuild {
		t.Fatalf("verify must not move the stage: %q", review.Card.Stage)
	}
	if text, err := wedge.QueryPolter(store, project.ID, "verify "+slug); err != nil || !strings.Contains(text, "FAIL") {
		t.Fatalf("verify query = %q err=%v", text, err)
	}
}
