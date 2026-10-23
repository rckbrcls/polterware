package decision

import "testing"

func TestNormalize(t *testing.T) {
	cases := map[string]string{"accepted": StateActive, "Active": StateActive, "": StateProposed, "weird": StateProposed, "superseded": StateSuperseded}
	for in, want := range cases {
		if got := Normalize(in); got != want {
			t.Errorf("Normalize(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestCanTransition(t *testing.T) {
	ok := [][2]string{{"proposed", "active"}, {"active", "challenged"}, {"challenged", "active"}, {"challenged", "superseded"}, {"active", "superseded"}, {"accepted", "active"}}
	for _, c := range ok {
		if !CanTransition(c[0], c[1]) {
			t.Errorf("%s -> %s should be legal", c[0], c[1])
		}
	}
	bad := [][2]string{{"superseded", "active"}, {"proposed", "challenged"}, {"proposed", "superseded"}, {"active", "proposed"}}
	for _, c := range bad {
		if CanTransition(c[0], c[1]) {
			t.Errorf("%s -> %s should be illegal", c[0], c[1])
		}
	}
}

func TestMetaRoundTrip(t *testing.T) {
	extra := MergeMeta(`{"decisionStatus":"active"}`, Meta{SupersededBy: "b", ReviewTrigger: "multi-user"})
	meta := ParseMeta(extra)
	if meta.SupersededBy != "b" || meta.ReviewTrigger != "multi-user" {
		t.Fatalf("meta = %+v", meta)
	}
	extra = MergeMeta(extra, Meta{})
	if got := ParseMeta(extra); got != (Meta{}) {
		t.Fatalf("meta not cleared: %+v", got)
	}
}

func TestSupersedeChecks(t *testing.T) {
	ds := []Decision{
		{ID: "a", Title: "Verdict 0001: A", Status: "superseded", Meta: Meta{SupersededBy: "b"}},
		{ID: "b", Title: "Verdict 0002: B", Status: "active"},
		{ID: "c", Title: "Verdict 0003: C", Status: "active"},
	}
	if err := CheckSupersede(ds, "b", "b"); err == nil {
		t.Error("self supersede must fail")
	}
	if err := CheckSupersede(ds, "c", "a"); err == nil {
		t.Error("superseding by a superseded decision must fail")
	}
	if err := CheckSupersede(ds, "b", "c"); err != nil {
		t.Errorf("valid supersede failed: %v", err)
	}
	if got := Chain(ds, "a"); len(got) != 2 || got[1] != "b" {
		t.Errorf("chain = %v", got)
	}
	if d, ok := Find(ds, "Verdict-2"); !ok || d.ID != "b" {
		t.Errorf("Find by number = %v %v", d, ok)
	}
	if NextNumber(ds) != 4 {
		t.Errorf("NextNumber = %d", NextNumber(ds))
	}
}
