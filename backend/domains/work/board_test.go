package work

import (
	"strings"
	"testing"
)

func TestValidateBoardName(t *testing.T) {
	if err := ValidateBoardName("  Sprint  "); err != nil {
		t.Fatal(err)
	}
	if err := ValidateBoardName("   "); err != ErrBoardNameRequired {
		t.Fatalf("blank name: %v", err)
	}
	if err := ValidateBoardName(""); err != ErrBoardNameRequired {
		t.Fatalf("empty name: %v", err)
	}
	exact := strings.Repeat("á", MaxBoardNameLen)
	if err := ValidateBoardName(exact); err != nil {
		t.Fatalf("name of %d runes must be valid: %v", MaxBoardNameLen, err)
	}
	if err := ValidateBoardName(exact + "x"); err != ErrBoardNameLength {
		t.Fatalf("name over the rune limit: %v", err)
	}
}

func TestValidateBoardConfigIsOpaqueJSONWithVersion(t *testing.T) {
	valid := []string{
		`{"version":1}`,
		`  {"version":2,"group":"owner","columns":[]}  `,
		DefaultBoardConfig,
	}
	for _, config := range valid {
		got, err := ResolveBoardConfig(config)
		if err != nil {
			t.Fatalf("ResolveBoardConfig(%q): %v", config, err)
		}
		if got != strings.TrimSpace(config) {
			t.Fatalf("config was rewritten: got %q", got)
		}
	}
	if got, err := ResolveBoardConfig("  "); err != nil || got != DefaultBoardConfig {
		t.Fatalf("empty config = %q, %v", got, err)
	}
	invalid := []string{
		"",
		`{}`,
		`[]`,
		`null`,
		`{"version":0}`,
		`{"version":-1}`,
		`{"version":1.5}`,
		`{"version":"1"}`,
		`{"version":null}`,
		`{"Version":1}`,
		`{"version":1}{"version":2}`,
		`not json`,
	}
	for _, config := range invalid {
		if err := ValidateBoardConfig(config); err != ErrBoardConfig {
			t.Errorf("ValidateBoardConfig(%q) = %v", config, err)
		}
	}
}

func TestBoardNamesAreUniquePerProject(t *testing.T) {
	existing := []Board{{ID: "b1", Name: "Stage"}, {ID: "b2", Name: " Mine "}}
	if !BoardNameTaken(" stage ", []Board{{ID: "b1", Name: "stage"}}, "") {
		t.Fatal("trimmed names match exactly")
	}
	if BoardNameTaken("stage", existing, "") {
		t.Fatal("uniqueness is case-sensitive, matching the table constraint")
	}
	if !BoardNameTaken("Mine", existing, "") {
		t.Fatal("stored and incoming names are compared trimmed")
	}
	if BoardNameTaken("Mine", existing, "b2") {
		t.Fatal("a board may keep its own name")
	}
	if _, err := PrepareBoardCreate(Board{Name: "Stage"}, existing); err != ErrBoardNameTaken {
		t.Fatalf("create duplicate: %v", err)
	}
	if _, _, err := PrepareBoardUpdate(Board{ID: "b2", Name: "Stage"}, existing); err != ErrBoardNameTaken {
		t.Fatalf("rename onto another board: %v", err)
	}
	next, changed, err := PrepareBoardUpdate(Board{ID: "b2"}, existing)
	if err != nil || changed || next.Name != " Mine " {
		t.Fatalf("an empty name must keep the stored name: %+v changed=%v err=%v", next, changed, err)
	}
}

func TestPrepareBoardCreateAppendsAndDefaultsConfig(t *testing.T) {
	first, err := PrepareBoardCreate(Board{Name: " Stage ", ProjectID: "p"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if first.Name != "Stage" || first.Position != 0 || first.ConfigJSON != DefaultBoardConfig || first.ProjectID != "p" {
		t.Fatalf("first = %+v", first)
	}
	second, err := PrepareBoardCreate(Board{Name: "Mine", ConfigJSON: `{"version":1,"group":"owner"}`}, []Board{first, {ID: "hole", Position: 4}})
	if err != nil {
		t.Fatal(err)
	}
	if second.Position != 5 || second.ConfigJSON != `{"version":1,"group":"owner"}` {
		t.Fatalf("second = %+v", second)
	}
	if _, err := PrepareBoardCreate(Board{Name: " ", ConfigJSON: `{"version":1}`}, nil); err != ErrBoardNameRequired {
		t.Fatalf("blank create: %v", err)
	}
	if _, err := PrepareBoardCreate(Board{Name: "Bad", ConfigJSON: `{}`}, nil); err != ErrBoardConfig {
		t.Fatalf("bad config: %v", err)
	}
}

func TestPrepareBoardUpdateRenamesAndReplacesConfig(t *testing.T) {
	existing := []Board{{
		ID: "b1", ProjectID: "p", Name: "Stage", Position: 3, ConfigJSON: DefaultBoardConfig,
	}}
	next, changed, err := PrepareBoardUpdate(Board{ID: "b1", Name: " Owners ", ConfigJSON: `{"version":2}`}, existing)
	if err != nil || !changed {
		t.Fatalf("update: %+v changed=%v err=%v", next, changed, err)
	}
	if next.Name != "Owners" || next.ConfigJSON != `{"version":2}` || next.Position != 3 || next.ProjectID != "p" {
		t.Fatalf("update changed identity or position: %+v", next)
	}
	kept, changed, err := PrepareBoardUpdate(Board{ID: "b1", ConfigJSON: ` {"version":4,"lane":"build"} `}, existing)
	if err != nil || !changed || kept.Name != "Stage" || kept.ConfigJSON != `{"version":4,"lane":"build"}` {
		t.Fatalf("config-only update: %+v changed=%v err=%v", kept, changed, err)
	}
	if _, _, err := PrepareBoardUpdate(Board{ID: "missing", Name: "X"}, existing); err != ErrBoardNotFound {
		t.Fatalf("missing board: %v", err)
	}
	if _, _, err := PrepareBoardUpdate(Board{ID: "b1", ConfigJSON: `{"version":"2"}`}, existing); err != ErrBoardConfig {
		t.Fatalf("bad config: %v", err)
	}
}

func TestBoardOrdering(t *testing.T) {
	boards := []Board{
		{ID: "b", Position: 1},
		{ID: "a", Position: 1},
		{ID: "c", Position: 0},
		{ID: "d", Position: 5},
	}
	ordered := OrderBoards(boards)
	got := make([]string, len(ordered))
	for i, board := range ordered {
		got[i] = board.ID
	}
	want := []string{"c", "a", "b", "d"}
	for i, id := range want {
		if got[i] != id {
			t.Fatalf("order = %v, want %v", got, want)
		}
	}
	if boards[0].ID != "b" || boards[0].Position != 1 {
		t.Fatal("ordering must not mutate the input")
	}
	compact := CompactBoardPositions(boards)
	for i, board := range compact {
		if board.Position != i {
			t.Fatalf("compact[%d] position = %d", i, board.Position)
		}
	}
	if NextBoardPosition(nil) != 0 || NextBoardPosition(compact) != len(compact) {
		t.Fatalf("next position after compact = %d", NextBoardPosition(compact))
	}
	if NextBoardPosition([]Board{{Position: -3}, {Position: -1}}) != 0 {
		t.Fatal("negative positions must not produce a negative next position")
	}

	reordered, err := ReorderBoards(compact, []string{"d", "c", "b", "a"})
	if err != nil {
		t.Fatal(err)
	}
	for i, id := range []string{"d", "c", "b", "a"} {
		if reordered[i].ID != id || reordered[i].Position != i {
			t.Fatalf("reordered[%d] = %+v", i, reordered[i])
		}
	}
	if !PositionsChanged(compact, reordered) {
		t.Fatal("a swapped order must count as a position change")
	}
	same, err := ReorderBoards(reordered, []string{"d", "c", "b", "a"})
	if err != nil || PositionsChanged(reordered, same) {
		t.Fatalf("same order must be unchanged: err=%v", err)
	}
	empty, err := ReorderBoards(nil, nil)
	if err != nil || len(empty) != 0 {
		t.Fatalf("empty reorder = %+v, %v", empty, err)
	}
	for _, ids := range [][]string{
		{"d", "c"},
		{"d", "c", "b", "a", "a"},
		{"d", "c", "b", "missing"},
		{"d", "d", "b", "a"},
		nil,
	} {
		if _, err := ReorderBoards(compact, ids); err != ErrBoardOrder {
			t.Errorf("ReorderBoards(%v) = %v", ids, err)
		}
	}
}
