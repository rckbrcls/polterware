// Package decision is the Verdict lifecycle: states, legal transitions, and the
// supersede chain. It is pure (no store); the codec and the store share it.
package decision

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

const (
	StateProposed   = "proposed"
	StateActive     = "active"
	StateChallenged = "challenged"
	StateSuperseded = "superseded"
)

// States lists the lifecycle states in display order.
var States = []string{StateActive, StateChallenged, StateProposed, StateSuperseded}

// Normalize maps a stored Verdict status to a lifecycle state. Older rows use
// "accepted" for what is now active; anything unknown reads as proposed.
func Normalize(status string) string {
	switch s := strings.ToLower(strings.TrimSpace(status)); s {
	case "accepted", StateActive:
		return StateActive
	case StateChallenged, StateSuperseded, StateProposed:
		return s
	default:
		return StateProposed
	}
}

// ValidState reports whether s is a lifecycle state.
func ValidState(s string) bool {
	switch s {
	case StateProposed, StateActive, StateChallenged, StateSuperseded:
		return true
	}
	return false
}

// Binding reports whether a decision in this status constrains work: active
// and challenged decisions still govern until a review resolves them.
func Binding(status string) bool {
	switch Normalize(status) {
	case StateActive, StateChallenged:
		return true
	}
	return false
}

// CanTransition reports whether from → to is a legal lifecycle move.
// A move to the same state is a no-op and legal.
func CanTransition(from, to string) bool {
	from, to = Normalize(from), Normalize(to)
	if from == to {
		return true
	}
	switch from {
	case StateProposed:
		return to == StateActive
	case StateActive:
		return to == StateChallenged || to == StateSuperseded
	case StateChallenged:
		return to == StateActive || to == StateSuperseded
	}
	return false
}

// Meta is the lifecycle data kept in a knowledge item's extra_json.
type Meta struct {
	SupersededBy  string `json:"supersededBy,omitempty"`
	ReviewTrigger string `json:"reviewTrigger,omitempty"`
	StatusReason  string `json:"statusReason,omitempty"`
}

// ParseMeta reads lifecycle data from extra_json; other keys are ignored.
func ParseMeta(extraJSON string) Meta {
	var meta Meta
	_ = json.Unmarshal([]byte(extraJSON), &meta)
	return meta
}

// MergeMeta writes meta into extra_json, keeping unrelated keys. Empty meta
// fields remove their key.
func MergeMeta(extraJSON string, meta Meta) string {
	fields := map[string]any{}
	_ = json.Unmarshal([]byte(extraJSON), &fields)
	set := func(key, value string) {
		if value == "" {
			delete(fields, key)
		} else {
			fields[key] = value
		}
	}
	set("supersededBy", meta.SupersededBy)
	set("reviewTrigger", meta.ReviewTrigger)
	set("statusReason", meta.StatusReason)
	body, err := json.Marshal(fields)
	if err != nil {
		return "{}"
	}
	return string(body)
}

// Decision is one Verdict as the lifecycle sees it.
type Decision struct {
	ID     string
	Title  string
	Status string
	Body   string
	// Scope is the path of the Atlas node the decision applies to; empty is the
	// whole project.
	Scope string
	Meta
}

var verdictNumber = regexp.MustCompile(`(?i)\b(?:adr|verdict)[\s\-_]*0*(\d+)\b`)

// Number reads the Verdict number from a title or reference ("Verdict 0008", "Verdict-8").
func Number(value string) (int, bool) {
	m := verdictNumber.FindStringSubmatch(value)
	if m == nil {
		return 0, false
	}
	n, err := strconv.Atoi(m[1])
	return n, err == nil
}

// Find returns the decision that ref names by id, exact title, or Verdict number.
func Find(decisions []Decision, ref string) (Decision, bool) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return Decision{}, false
	}
	for _, d := range decisions {
		if strings.EqualFold(d.ID, ref) || strings.EqualFold(d.Title, ref) {
			return d, true
		}
	}
	if n, ok := Number(ref); ok {
		for _, d := range decisions {
			if m, ok := Number(d.Title); ok && m == n {
				return d, true
			}
		}
	}
	return Decision{}, false
}

// NextNumber returns the next free Verdict number.
func NextNumber(decisions []Decision) int {
	next := 1
	for _, d := range decisions {
		if n, ok := Number(d.Title); ok && n >= next {
			next = n + 1
		}
	}
	return next
}

// TitleFor renders a numbered Verdict title: "Verdict 0010: Title".
func TitleFor(number int, title string) string {
	return fmt.Sprintf("Verdict %04d: %s", number, strings.TrimSpace(title))
}

// CheckSupersede validates that by may supersede target: distinct, both known
// to exist, by is not itself superseded, and the chain has no cycle.
func CheckSupersede(decisions []Decision, target, by string) error {
	if target == by {
		return fmt.Errorf("a decision cannot supersede itself")
	}
	byID := map[string]Decision{}
	for _, d := range decisions {
		byID[d.ID] = d
	}
	if _, ok := byID[target]; !ok {
		return fmt.Errorf("unknown decision %q", target)
	}
	newer, ok := byID[by]
	if !ok {
		return fmt.Errorf("unknown decision %q", by)
	}
	if Normalize(newer.Status) == StateSuperseded {
		return fmt.Errorf("%s is already superseded: point at its successor", newer.Title)
	}
	// Walking from by along superseded_by must never reach target.
	seen := map[string]bool{}
	for cur := newer; cur.SupersededBy != ""; {
		if cur.SupersededBy == target || seen[cur.ID] {
			return fmt.Errorf("supersede cycle between %s and %s", newer.Title, byID[target].Title)
		}
		seen[cur.ID] = true
		next, ok := byID[cur.SupersededBy]
		if !ok {
			break
		}
		cur = next
	}
	return nil
}

// Chain returns the ids from id forward through superseded_by (id first).
func Chain(decisions []Decision, id string) []string {
	byID := map[string]Decision{}
	for _, d := range decisions {
		byID[d.ID] = d
	}
	var chain []string
	seen := map[string]bool{}
	for cur, ok := byID[id]; ok && !seen[cur.ID]; cur, ok = byID[cur.SupersededBy] {
		seen[cur.ID] = true
		chain = append(chain, cur.ID)
		if cur.SupersededBy == "" {
			break
		}
	}
	return chain
}
