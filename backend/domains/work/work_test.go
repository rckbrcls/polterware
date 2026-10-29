package work

import (
	"testing"
	"time"

	"github.com/polterware/polterware/backend/domains/structure"
)

func TestStagesAreInBoardOrder(t *testing.T) {
	want := []string{"shape", "plan", "build", "verify", "delivered"}
	if len(Stages) != len(want) {
		t.Fatalf("Stages = %v", Stages)
	}
	for i, stage := range want {
		if Stages[i] != stage {
			t.Fatalf("Stages[%d] = %q, want %q", i, Stages[i], stage)
		}
	}
}

func TestValidStage(t *testing.T) {
	for _, stage := range Stages {
		if !ValidStage(stage) {
			t.Errorf("%q must be valid", stage)
		}
	}
	for _, stage := range []string{"", "Shape", "done", "review", " build"} {
		if ValidStage(stage) {
			t.Errorf("%q must be invalid", stage)
		}
	}
}

func TestValidCardStatusAndKind(t *testing.T) {
	if !ValidCardStatus(CardActive) || !ValidCardStatus(CardRemoved) || ValidCardStatus("") || ValidCardStatus("archived") {
		t.Fatal("card status validation is wrong")
	}
	if !ValidKind(KindFeature) || !ValidKind(KindArchitecture) || ValidKind("") || ValidKind("bug") {
		t.Fatal("card kind validation is wrong")
	}
}

func TestValidSlug(t *testing.T) {
	valid := []string{"a", "git-import", "decision-0007", "v2", "a1-b2-c3"}
	for _, slug := range valid {
		if !ValidSlug(slug) {
			t.Errorf("%q must be valid", slug)
		}
	}
	long := make([]byte, 81)
	for i := range long {
		long[i] = 'a'
	}
	invalid := []string{"", "Git-Import", "-lead", "trail-", "double--dash", "under_score", "has space", "café", string(long)}
	for _, slug := range invalid {
		if ValidSlug(slug) {
			t.Errorf("%q must be invalid", slug)
		}
	}
	if !ValidSlug(string(long[:80])) {
		t.Error("80 characters is the limit and must be valid")
	}
}

func TestNormalizeTextFoldsCaseAccentsAndPunctuation(t *testing.T) {
	same := [][2]string{
		{"Upsert commit evidence", "  upsert   COMMIT evidence! "},
		{"Café résumé", "cafe resume"},
		{"Include merge commits?", "include merge commits"},
		{"wire-into ImportProjectSources", "wire into importprojectsources"},
	}
	for _, pair := range same {
		if a, b := NormalizeText(pair[0]), NormalizeText(pair[1]); a != b {
			t.Errorf("%q -> %q but %q -> %q", pair[0], a, pair[1], b)
		}
	}
	if NormalizeText("Task one") == NormalizeText("Task two") {
		t.Error("different text must stay different")
	}
	if got := NormalizeText("  ?!  "); got != "" {
		t.Errorf("punctuation only must normalize to empty, got %q", got)
	}
}

func TestCardLatestHandoff(t *testing.T) {
	base := time.Now()
	card := Card{Handoffs: []Handoff{
		{ID: "h1", Branch: "main", Goal: "first", CreatedAt: base},
		{ID: "h2", Branch: "feat/x", Goal: "other branch", CreatedAt: base.Add(time.Minute)},
		{ID: "h3", Branch: "main", Goal: "second", CreatedAt: base.Add(2 * time.Minute)},
	}}
	if got, ok := card.LatestHandoff("main"); !ok || got.ID != "h3" {
		t.Fatalf("LatestHandoff(main) = %+v, %v", got, ok)
	}
	if got, ok := card.LatestHandoff("feat/x"); !ok || got.ID != "h2" {
		t.Fatalf("LatestHandoff(feat/x) = %+v, %v", got, ok)
	}
	if _, ok := card.LatestHandoff("nope"); ok {
		t.Fatal("unknown branch must report not found")
	}
	if got, ok := card.LatestHandoffAny(); !ok || got.ID != "h3" {
		t.Fatalf("LatestHandoffAny = %+v, %v", got, ok)
	}
	if _, ok := (Card{}).LatestHandoffAny(); ok {
		t.Fatal("a card without handoffs must report not found")
	}
}

func TestSnapshotLookups(t *testing.T) {
	snapshot := Snapshot{
		ProjectID: "p",
		Cards:     []Card{{Slug: "git-import"}, {Slug: "structure"}},
		Nodes:     []structure.Node{{Path: "core/import", Status: "removed"}},
		Repos:     []string{"api"},
	}
	if card, ok := snapshot.Card("structure"); !ok || card.Slug != "structure" {
		t.Fatalf("Card(structure) = %+v, %v", card, ok)
	}
	if _, ok := snapshot.Card("missing"); ok {
		t.Fatal("unknown slug must not be found")
	}
	if node, ok := snapshot.NodeByPath("core/import"); !ok || node.Status != "removed" {
		t.Fatalf("NodeByPath must include removed nodes: %+v, %v", node, ok)
	}
	if _, ok := snapshot.NodeByPath("core"); ok {
		t.Fatal("paths match exactly")
	}
	if !snapshot.HasRepo("") || !snapshot.HasRepo("api") || snapshot.HasRepo("web") {
		t.Fatal("HasRepo: empty is the root, listed names match, others do not")
	}
}
