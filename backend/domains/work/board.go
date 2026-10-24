package work

import (
	"cmp"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	// MaxBoardNameLen is the longest board name, counted in runes.
	MaxBoardNameLen = 80
	// DefaultBoardConfig is stored when a create omits config. The version
	// field lives inside the JSON the UI owns; the server does not read the rest.
	DefaultBoardConfig = `{"version":1}`
)

var (
	ErrBoardNameRequired = errors.New("board name is required")
	ErrBoardNameLength   = errors.New("board name is too long")
	ErrBoardConfig       = errors.New("board config must be a JSON object with an integer version")
	ErrBoardNameTaken    = errors.New("board name is already used in this project")
	ErrBoardOrder        = errors.New("board order must list each board of the project once")
	ErrBoardNotFound     = errors.New("board not found")
)

// Board is one saved view over a project's work cards. The card stage
// lifecycle stays canonical; a board does not copy or move cards. ConfigJSON
// is opaque JSON the UI owns and must contain an integer version. A project
// with no boards uses the implicit default view grouped by stage.
type Board struct {
	ID         string
	ProjectID  string
	Name       string
	Position   int
	ConfigJSON string
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// NormalizeBoardName trims the display name stored for a board.
func NormalizeBoardName(name string) string {
	return strings.TrimSpace(name)
}

// ValidateBoardName reports whether name is non-empty and within MaxBoardNameLen.
func ValidateBoardName(name string) error {
	name = NormalizeBoardName(name)
	if name == "" {
		return ErrBoardNameRequired
	}
	if utf8.RuneCountInString(name) > MaxBoardNameLen {
		return ErrBoardNameLength
	}
	return nil
}

// ResolveBoardConfig trims config and fills the default when it is empty.
// The returned text is otherwise the UI's JSON, unchanged.
func ResolveBoardConfig(config string) (string, error) {
	config = strings.TrimSpace(config)
	if config == "" {
		config = DefaultBoardConfig
	}
	if err := ValidateBoardConfig(config); err != nil {
		return "", err
	}
	return config, nil
}

// ValidateBoardConfig reports whether config is a JSON object with an integer
// version of at least 1. Every other field stays opaque.
func ValidateBoardConfig(config string) error {
	dec := json.NewDecoder(strings.NewReader(config))
	dec.UseNumber()
	var obj map[string]any
	if err := dec.Decode(&obj); err != nil || obj == nil {
		return ErrBoardConfig
	}
	if dec.More() {
		return ErrBoardConfig
	}
	raw, ok := obj["version"]
	if !ok || raw == nil {
		return ErrBoardConfig
	}
	number, ok := raw.(json.Number)
	if !ok {
		return ErrBoardConfig
	}
	version, err := number.Int64()
	if err != nil || version < 1 {
		return ErrBoardConfig
	}
	return nil
}

// BoardNameTaken reports whether another board in the project already uses name.
func BoardNameTaken(name string, boards []Board, exceptID string) bool {
	name = NormalizeBoardName(name)
	for _, board := range boards {
		if board.ID == exceptID {
			continue
		}
		if NormalizeBoardName(board.Name) == name {
			return true
		}
	}
	return false
}

// NextBoardPosition is one past the highest position, or 0 when there are none.
func NextBoardPosition(boards []Board) int {
	if len(boards) == 0 {
		return 0
	}
	max := boards[0].Position
	for _, board := range boards[1:] {
		if board.Position > max {
			max = board.Position
		}
	}
	if max < 0 {
		return 0
	}
	return max + 1
}

// OrderBoards returns boards sorted by position, then id.
func OrderBoards(boards []Board) []Board {
	out := slices.Clone(boards)
	slices.SortStableFunc(out, func(a, b Board) int {
		if c := cmp.Compare(a.Position, b.Position); c != 0 {
			return c
		}
		return strings.Compare(a.ID, b.ID)
	})
	return out
}

// CompactBoardPositions sorts boards and rewrites positions to 0..n-1.
func CompactBoardPositions(boards []Board) []Board {
	out := OrderBoards(boards)
	for i := range out {
		out[i].Position = i
	}
	return out
}

// ReorderBoards checks that ids is a permutation of boards and assigns
// positions 0..n-1 in that order.
func ReorderBoards(boards []Board, ids []string) ([]Board, error) {
	if len(ids) != len(boards) {
		return nil, ErrBoardOrder
	}
	index := make(map[string]Board, len(boards))
	for _, board := range boards {
		if board.ID == "" {
			return nil, ErrBoardOrder
		}
		if _, dup := index[board.ID]; dup {
			return nil, ErrBoardOrder
		}
		index[board.ID] = board
	}
	seen := make(map[string]struct{}, len(ids))
	out := make([]Board, 0, len(ids))
	for i, id := range ids {
		board, ok := index[id]
		if !ok {
			return nil, ErrBoardOrder
		}
		if _, dup := seen[id]; dup {
			return nil, ErrBoardOrder
		}
		seen[id] = struct{}{}
		board.Position = i
		out = append(out, board)
	}
	return out, nil
}

// PositionsChanged reports whether any board's position differs.
func PositionsChanged(before, after []Board) bool {
	if len(before) != len(after) {
		return true
	}
	current := make(map[string]int, len(before))
	for _, board := range before {
		current[board.ID] = board.Position
	}
	for _, board := range after {
		position, ok := current[board.ID]
		if !ok || position != board.Position {
			return true
		}
	}
	return false
}

// PrepareBoardCreate normalizes a new board and appends it after existing.
func PrepareBoardCreate(board Board, existing []Board) (Board, error) {
	board.Name = NormalizeBoardName(board.Name)
	if err := ValidateBoardName(board.Name); err != nil {
		return Board{}, err
	}
	config, err := ResolveBoardConfig(board.ConfigJSON)
	if err != nil {
		return Board{}, err
	}
	board.ConfigJSON = config
	if BoardNameTaken(board.Name, existing, "") {
		return Board{}, ErrBoardNameTaken
	}
	board.Position = NextBoardPosition(existing)
	return board, nil
}

// PrepareBoardUpdate applies a rename and/or a new config onto the board with
// board.ID. An empty name or config keeps the stored value. changed is false
// when the stored row is already in that state.
func PrepareBoardUpdate(board Board, existing []Board) (Board, bool, error) {
	var current Board
	found := false
	for _, item := range existing {
		if item.ID == board.ID {
			current = item
			found = true
			break
		}
	}
	if !found {
		return Board{}, false, ErrBoardNotFound
	}
	next := current
	if strings.TrimSpace(board.Name) != "" {
		next.Name = NormalizeBoardName(board.Name)
		if err := ValidateBoardName(next.Name); err != nil {
			return Board{}, false, err
		}
		if BoardNameTaken(next.Name, existing, current.ID) {
			return Board{}, false, ErrBoardNameTaken
		}
	}
	if strings.TrimSpace(board.ConfigJSON) != "" {
		config, err := ResolveBoardConfig(board.ConfigJSON)
		if err != nil {
			return Board{}, false, err
		}
		next.ConfigJSON = config
	}
	changed := next.Name != current.Name || next.ConfigJSON != current.ConfigJSON
	return next, changed, nil
}
