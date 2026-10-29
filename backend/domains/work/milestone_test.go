package work

import (
	"errors"
	"testing"
)

func TestPrepareMilestoneCreate(t *testing.T) {
	existing := []Milestone{{ID: "a", Slug: "public-beta", Name: "Public beta", Position: 3}}
	got, err := PrepareMilestoneCreate(Milestone{Name: " public BETA "}, existing)
	if !errors.Is(err, ErrMilestoneNameTaken) {
		t.Fatalf("a duplicate name in another case: %+v, %v", got, err)
	}
	got, err = PrepareMilestoneCreate(Milestone{Name: "Public beta 2", ExitCriteria: []string{" ok ", ""}}, existing)
	if err != nil || got.Slug != "public-beta-2" || got.State != MilestonePlanned || got.Position != 4 || len(got.ExitCriteria) != 1 || got.ExitCriteria[0] != "ok" {
		t.Fatalf("create = %+v, %v", got, err)
	}
	if got := MilestoneSlug("Public beta", existing); got != "public-beta-2" {
		t.Fatalf("slug collision = %q", got)
	}
	if got := MilestoneSlug("!!!", nil); got != "milestone" {
		t.Fatalf("empty slug = %q", got)
	}
	for _, bad := range []Milestone{{Name: ""}, {Name: "x", State: "later"}, {Name: "x", TargetDate: "tomorrow"}} {
		if _, err := PrepareMilestoneCreate(bad, nil); err == nil {
			t.Fatalf("%+v should be refused", bad)
		}
	}
}

func TestPrepareMilestoneUpdateKeepsTheSlug(t *testing.T) {
	existing := []Milestone{{ID: "a", Slug: "beta", Name: "Beta", State: MilestonePlanned}, {ID: "b", Slug: "ga", Name: "GA", State: MilestonePlanned}}
	next, changed, err := PrepareMilestoneUpdate(Milestone{ID: "a", Name: "Open beta", State: MilestoneActive}, existing)
	if err != nil || !changed || next.Slug != "beta" || next.Name != "Open beta" {
		t.Fatalf("update = %+v %v %v", next, changed, err)
	}
	if _, changed, _ := PrepareMilestoneUpdate(Milestone{ID: "a", Name: "Beta", State: MilestonePlanned}, existing); changed {
		t.Fatal("an identical update changes nothing")
	}
	if _, _, err := PrepareMilestoneUpdate(Milestone{ID: "a", Name: "ga", State: MilestonePlanned}, existing); !errors.Is(err, ErrMilestoneNameTaken) {
		t.Fatalf("rename onto another name: %v", err)
	}
	if _, _, err := PrepareMilestoneUpdate(Milestone{ID: "z", Name: "Z", State: MilestonePlanned}, existing); !errors.Is(err, ErrMilestoneNotFound) {
		t.Fatalf("unknown id: %v", err)
	}
}

func TestReorderMilestones(t *testing.T) {
	items := []Milestone{{ID: "a", Position: 0}, {ID: "b", Position: 1}}
	next, err := ReorderMilestones(items, []string{"b", "a"})
	if err != nil || next[0].ID != "b" || next[0].Position != 0 || !MilestonePositionsChanged(items, next) {
		t.Fatalf("reorder = %+v %v", next, err)
	}
	if _, err := ReorderMilestones(items, []string{"a", "a"}); !errors.Is(err, ErrMilestoneOrder) {
		t.Fatalf("duplicate ids: %v", err)
	}
}
