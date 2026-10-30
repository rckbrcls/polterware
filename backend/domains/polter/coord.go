package polter

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

var taskRefPattern = regexp.MustCompile(`^([a-z0-9]+(?:-[a-z0-9]+)*)(?:#|\s+)[Tt]([1-9][0-9]{0,5})$`)

// ParseTaskRef reads a task id written as `slug#T2` or `slug T2` (the same
// citation commit subjects use).
func ParseTaskRef(text string) (CommitRef, error) {
	m := taskRefPattern.FindStringSubmatch(strings.TrimSpace(text))
	if m == nil {
		return CommitRef{}, fmt.Errorf("invalid task %q: use slug#T2 or slug T2", strings.TrimSpace(text))
	}
	number, _ := strconv.Atoi(m[2])
	return CommitRef{Slug: m[1], Number: number}, nil
}

// CoordText is the minimal Polter text for one coordination line on an
// existing card, with a generated summary and rationale.
func CoordText(action string, ref CommitRef, holder string) (string, error) {
	var summary, rationale string
	switch action {
	case CoordClaim:
		summary = fmt.Sprintf("Claim %s T%d for %s", ref.Slug, ref.Number, holder)
		rationale = "Reserve the task scope before editing so other agents do not write the same files"
	case CoordDone:
		summary = fmt.Sprintf("Mark %s T%d done by %s", ref.Slug, ref.Number, holder)
		rationale = "The agent finished the task"
	case CoordRelease:
		summary = fmt.Sprintf("Release %s T%d held by %s", ref.Slug, ref.Number, holder)
		rationale = "The agent stopped working on the task without finishing it"
	default:
		return "", fmt.Errorf("unknown action %q: use claim, done, or release", action)
	}
	return fmt.Sprintf("---\npolter: 1\nsummary: %s\nrationale: %s\n---\n\n## %s\n%s: T%d\n",
		summary, rationale, ref.Slug, action, ref.Number), nil
}
