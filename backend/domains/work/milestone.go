package work

import (
	"cmp"
	"errors"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// Milestone states. More than one milestone may be active; the roadmap lists
// the active ones in position order.
const (
	MilestonePlanned = "planned"
	MilestoneActive  = "active"
	MilestoneDone    = "done"

	// MaxMilestoneNameLen is the longest milestone name, counted in runes.
	MaxMilestoneNameLen = 80
	// MaxMilestoneGoalLen bounds the goal so it stays one sentence or two.
	MaxMilestoneGoalLen = 400
)

// MilestoneStates lists the states in lifecycle order.
var MilestoneStates = []string{MilestonePlanned, MilestoneActive, MilestoneDone}

var (
	ErrMilestoneNameRequired = errors.New("milestone name is required")
	ErrMilestoneNameLength   = errors.New("milestone name is too long")
	ErrMilestoneNameTaken    = errors.New("milestone name is already used in this project")
	ErrMilestoneGoalLength   = errors.New("milestone goal is too long")
	ErrMilestoneState        = errors.New("milestone state must be planned, active, or done")
	ErrMilestoneTargetDate   = errors.New("milestone target date must be YYYY-MM-DD")
	ErrMilestoneOrder        = errors.New("milestone order must list each milestone of the project once")
	ErrMilestoneNotFound     = errors.New("milestone not found")
)

// Milestone groups the cards that ship together. A card belongs to at most
// one milestone (work_cards.milestone_id); a card with none is in the Backlog.
// Milestones are created in the Desktop; Polter assigns cards with milestone:.
type Milestone struct {
	ID        string
	ProjectID string
	// Slug is the stable name a card's milestone: line uses.
	Slug         string
	Name         string
	Goal         string
	ExitCriteria []string
	// TargetDate is YYYY-MM-DD or empty.
	TargetDate string
	State      string
	Position   int
	// ArchivedAt is empty while the milestone is listed.
	ArchivedAt string
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// ValidMilestoneState reports whether state is planned, active, or done.
func ValidMilestoneState(state string) bool {
	return slices.Contains(MilestoneStates, state)
}

// MilestoneSlug derives a card-friendly slug from a name, unique among
// existing: "Public beta" is public-beta, then public-beta-2.
func MilestoneSlug(name string, existing []Milestone) string {
	base := strings.ReplaceAll(NormalizeText(name), " ", "-")
	if runes := []rune(base); len(runes) > 60 {
		base = strings.TrimRight(string(runes[:60]), "-")
	}
	if base == "" || !ValidSlug(base) {
		base = "milestone"
	}
	taken := func(slug string) bool {
		return slices.ContainsFunc(existing, func(item Milestone) bool { return item.Slug == slug })
	}
	slug := base
	for n := 2; taken(slug); n++ {
		slug = base + "-" + strconv.Itoa(n)
	}
	return slug
}

// FindMilestone returns the listed milestone with slug or id ref.
func FindMilestone(milestones []Milestone, ref string) (Milestone, bool) {
	for _, item := range milestones {
		if item.ArchivedAt == "" && (item.Slug == ref || item.ID == ref) {
			return item, true
		}
	}
	return Milestone{}, false
}

// OrderMilestones returns milestones sorted by position, then id.
func OrderMilestones(milestones []Milestone) []Milestone {
	out := slices.Clone(milestones)
	slices.SortStableFunc(out, func(a, b Milestone) int {
		if c := cmp.Compare(a.Position, b.Position); c != 0 {
			return c
		}
		return strings.Compare(a.ID, b.ID)
	})
	return out
}

// ReorderMilestones checks that ids is a permutation of milestones and assigns
// positions 0..n-1 in that order.
func ReorderMilestones(milestones []Milestone, ids []string) ([]Milestone, error) {
	if len(ids) != len(milestones) {
		return nil, ErrMilestoneOrder
	}
	index := make(map[string]Milestone, len(milestones))
	for _, item := range milestones {
		index[item.ID] = item
	}
	seen := make(map[string]bool, len(ids))
	out := make([]Milestone, 0, len(ids))
	for i, id := range ids {
		item, ok := index[id]
		if !ok || seen[id] {
			return nil, ErrMilestoneOrder
		}
		seen[id] = true
		item.Position = i
		out = append(out, item)
	}
	return out, nil
}

// MilestonePositionsChanged reports whether any milestone's position differs.
func MilestonePositionsChanged(before, after []Milestone) bool {
	current := make(map[string]int, len(before))
	for _, item := range before {
		current[item.ID] = item.Position
	}
	for _, item := range after {
		if position, ok := current[item.ID]; !ok || position != item.Position {
			return true
		}
	}
	return len(before) != len(after)
}

// normalizeMilestone trims the fields and checks name, goal, state, and date.
func normalizeMilestone(item Milestone) (Milestone, error) {
	item.Name = strings.TrimSpace(item.Name)
	item.Goal = strings.TrimSpace(item.Goal)
	item.TargetDate = strings.TrimSpace(item.TargetDate)
	item.State = strings.TrimSpace(item.State)
	criteria := item.ExitCriteria[:0:0]
	for _, line := range item.ExitCriteria {
		if line = strings.TrimSpace(line); line != "" {
			criteria = append(criteria, line)
		}
	}
	item.ExitCriteria = criteria
	switch {
	case item.Name == "":
		return Milestone{}, ErrMilestoneNameRequired
	case utf8.RuneCountInString(item.Name) > MaxMilestoneNameLen:
		return Milestone{}, ErrMilestoneNameLength
	case utf8.RuneCountInString(item.Goal) > MaxMilestoneGoalLen:
		return Milestone{}, ErrMilestoneGoalLength
	case !ValidMilestoneState(item.State):
		return Milestone{}, ErrMilestoneState
	}
	if item.TargetDate != "" {
		if _, err := time.Parse(time.DateOnly, item.TargetDate); err != nil {
			return Milestone{}, ErrMilestoneTargetDate
		}
	}
	return item, nil
}

func milestoneNameTaken(name string, existing []Milestone, exceptID string) bool {
	return slices.ContainsFunc(existing, func(item Milestone) bool {
		return item.ID != exceptID && strings.EqualFold(strings.TrimSpace(item.Name), name)
	})
}

// PrepareMilestoneCreate normalizes a new milestone, gives it a unique slug,
// and appends it after existing. An empty state is planned.
func PrepareMilestoneCreate(item Milestone, existing []Milestone) (Milestone, error) {
	if strings.TrimSpace(item.State) == "" {
		item.State = MilestonePlanned
	}
	item, err := normalizeMilestone(item)
	if err != nil {
		return Milestone{}, err
	}
	if milestoneNameTaken(item.Name, existing, "") {
		return Milestone{}, ErrMilestoneNameTaken
	}
	item.Slug = MilestoneSlug(item.Name, existing)
	item.Position = 0
	for _, other := range existing {
		item.Position = max(item.Position, other.Position+1)
	}
	return item, nil
}

// PrepareMilestoneUpdate replaces the editable fields of the milestone with
// item.ID. The slug never changes, so card milestone: lines keep working.
// changed is false when the stored row is already in that state.
func PrepareMilestoneUpdate(item Milestone, existing []Milestone) (Milestone, bool, error) {
	index := slices.IndexFunc(existing, func(other Milestone) bool { return other.ID == item.ID })
	if index < 0 {
		return Milestone{}, false, ErrMilestoneNotFound
	}
	current := existing[index]
	next := current
	next.Name, next.Goal, next.ExitCriteria, next.TargetDate, next.State = item.Name, item.Goal, item.ExitCriteria, item.TargetDate, item.State
	next, err := normalizeMilestone(next)
	if err != nil {
		return Milestone{}, false, err
	}
	if milestoneNameTaken(next.Name, existing, current.ID) {
		return Milestone{}, false, ErrMilestoneNameTaken
	}
	changed := next.Name != current.Name || next.Goal != current.Goal || next.TargetDate != current.TargetDate ||
		next.State != current.State || !slices.Equal(next.ExitCriteria, current.ExitCriteria)
	return next, changed, nil
}
