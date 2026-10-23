package contextpkg

import "testing"

func TestCompileRespectsBudget(t *testing.T) {
	items := []Item{
		{Kind: "entity", ID: "e1", Title: "API Gateway", Excerpt: stringsRepeat("x", 400), TruthClass: "declared", Source: "layout", Reasons: []string{ReasonExactEntity}},
		{Kind: "doc", ID: "d1", Title: "Architecture", Excerpt: stringsRepeat("y", 400), TruthClass: "declared", Source: "knowledge", Reasons: []string{ReasonFTSHit}},
		{Kind: "doc", ID: "d2", Title: "Extra", Excerpt: stringsRepeat("z", 400), TruthClass: "inferred", Source: "knowledge", Reasons: []string{ReasonFTSHit}},
	}
	pkg := Compile(Request{ProjectID: "p1", TokenBudget: 200}, items)
	if len(pkg.Items) == 0 {
		t.Fatal("expected at least one item")
	}
	if pkg.TokensUsed > pkg.TokenBudget {
		t.Fatalf("over budget: %d > %d", pkg.TokensUsed, pkg.TokenBudget)
	}
	if pkg.Items[0].Kind != "entity" {
		t.Fatalf("expected entity first, got %s", pkg.Items[0].Kind)
	}
}

func TestCompilePreservesReasonsAndEvidence(t *testing.T) {
	items := []Item{
		{
			Kind: "fact", ID: "f1", Title: "Uses Go modules", Excerpt: "module example",
			TruthClass: "observed", Source: "import:go.mod", Path: "canon/fact/f1",
			Reasons: []string{ReasonImportedFact},
			Evidence: []EvidenceRef{{ID: "ev1", Kind: "file", Summary: "go.mod", Path: "go.mod", Source: "import:go.mod"}},
		},
	}
	pkg := Compile(Request{ProjectID: "p1", TokenBudget: 500}, items)
	if len(pkg.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(pkg.Items))
	}
	if len(pkg.Items[0].Reasons) != 1 || pkg.Items[0].Reasons[0] != ReasonImportedFact {
		t.Fatalf("reasons not preserved: %#v", pkg.Items[0].Reasons)
	}
	if len(pkg.Items[0].Evidence) != 1 || pkg.Items[0].Evidence[0].ID != "ev1" {
		t.Fatalf("evidence not preserved: %#v", pkg.Items[0].Evidence)
	}
}

func TestFactOutranksDoc(t *testing.T) {
	items := []Item{
		{Kind: "doc", ID: "d1", Title: "Doc", Excerpt: "body", TruthClass: "declared", Source: "knowledge"},
		{Kind: "fact", ID: "f1", Title: "Fact", Excerpt: "claim", TruthClass: "declared", Source: "polterware"},
	}
	pkg := Compile(Request{ProjectID: "p1", TokenBudget: 800}, items)
	if len(pkg.Items) < 2 {
		t.Fatal("expected both items")
	}
	if pkg.Items[0].Kind != "fact" {
		t.Fatalf("expected fact first, got %s", pkg.Items[0].Kind)
	}
}

func TestBudgetTrimsEvidenceHeavyItems(t *testing.T) {
	heavy := Item{
		Kind: "fact", ID: "f1", Title: "Heavy", Excerpt: stringsRepeat("a", 200),
		TruthClass: "observed", Source: "import",
		Reasons: []string{ReasonImportedFact},
		Evidence: []EvidenceRef{
			{ID: "e1", Kind: "file", Summary: stringsRepeat("s", 80), Path: "a.md"},
			{ID: "e2", Kind: "file", Summary: stringsRepeat("s", 80), Path: "b.md"},
			{ID: "e3", Kind: "file", Summary: stringsRepeat("s", 80), Path: "c.md"},
			{ID: "e4", Kind: "file", Summary: stringsRepeat("s", 80), Path: "d.md"},
		},
	}
	light := Item{
		Kind: "entity", ID: "e1", Title: "API", Excerpt: "svc",
		TruthClass: "declared", Source: "layout", Reasons: []string{ReasonExactEntity},
	}
	pkg := Compile(Request{ProjectID: "p1", TokenBudget: itemTokenCost(light) + 40}, []Item{heavy, light})
	if len(pkg.Items) == 0 {
		t.Fatal("expected at least the light item")
	}
	if pkg.Items[0].Kind != "entity" {
		t.Fatalf("expected entity packed first under tight budget, got %s", pkg.Items[0].Kind)
	}
}

func TestMergeReasonsDedupes(t *testing.T) {
	got := MergeReasons([]string{ReasonFTSHit, ReasonTitleMatch}, ReasonFTSHit, ReasonImportedFact)
	if len(got) != 3 {
		t.Fatalf("expected 3 unique reasons, got %#v", got)
	}
	if got[0] != ReasonFTSHit || got[1] != ReasonTitleMatch || got[2] != ReasonImportedFact {
		t.Fatalf("unexpected order: %#v", got)
	}
}

func stringsRepeat(s string, n int) string {
	out := make([]byte, 0, n*len(s))
	for i := 0; i < n; i++ {
		out = append(out, s...)
	}
	return string(out)
}
