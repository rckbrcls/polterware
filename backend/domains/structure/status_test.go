package structure

import "testing"

func TestDeriveStatus(t *testing.T) {
	if got := DeriveStatus(nil); got != StatusProposed {
		t.Fatalf("empty = %s", got)
	}
	if got := DeriveStatus([]string{"delivered", "delivered"}); got != StatusDelivered {
		t.Fatalf("delivered = %s", got)
	}
	if got := DeriveStatus([]string{"build"}); got != StatusInProgress {
		t.Fatalf("progress = %s", got)
	}
}

func TestDecorateCountsDescendantFeatures(t *testing.T) {
	nodes := []Node{
		{ID: "s", Path: "app", Level: LevelDomain, Title: "App", Status: NodeActive},
		{ID: "d", ParentID: "s", Path: "app/core", Level: LevelDomain, Title: "Core", Status: NodeActive},
		{ID: "c", ParentID: "d", Path: "app/core/import", Level: LevelComponent, Title: "Import", Status: NodeActive},
	}
	features := []Feature{{Slug: "git-import", Under: "app/core/import", Stage: "build", OpenQuestions: 2}}
	rows := Decorate(nodes, features)
	if len(rows) != 3 {
		t.Fatalf("rows = %d", len(rows))
	}
	byPath := map[string]Row{}
	for _, row := range rows {
		byPath[row.Path] = row
	}
	if byPath["app"].FeatureCount != 1 || byPath["app"].Derived != StatusInProgress || byPath["app"].OpenQuestions != 2 {
		t.Fatalf("system = %+v", byPath["app"])
	}
	if byPath["app/core/import"].ChildCount != 0 || byPath["app/core"].ChildCount != 1 {
		t.Fatalf("children import=%d domain=%d", byPath["app/core/import"].ChildCount, byPath["app/core"].ChildCount)
	}
}
