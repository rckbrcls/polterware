package work

import (
	"strings"
	"time"
)

// Claim reserves one task's write scope for one agent. There is at most one
// active claim per task; release and done delete it, and the history stays in
// the change operation log.
type Claim struct {
	ID        string
	ProjectID string
	TaskID    string
	Holder    string
	// Scope is the task's glob copied when the claim was taken, prefixed
	// with the task's checkout (`api:src/auth/*`) when it is not the project
	// root. An empty scope reserves only the task, not any files.
	Scope     string
	CreatedAt time.Time
}

// QualifyScope writes a task glob with its checkout: `api:src/auth/*`. The
// project root has no prefix, and an empty glob stays empty.
func QualifyScope(repo, glob string) string {
	glob = strings.TrimSpace(glob)
	if glob == "" || repo == "" {
		return glob
	}
	return repo + ":" + glob
}

// SplitScope separates a `repo:glob` scope. A scope without a slug prefix
// belongs to the project root, so claims written before repositories keep
// their meaning.
func SplitScope(scope string) (repo, glob string) {
	scope = strings.TrimSpace(scope)
	if i := strings.Index(scope, ":"); i > 0 && ValidSlug(scope[:i]) {
		return scope[:i], strings.TrimSpace(scope[i+1:])
	}
	return "", scope
}

// ScopesOverlap reports whether some path is covered by both scopes. Scopes
// in different checkouts never overlap. Inside one checkout, segments are
// split on "/"; "*" and "?" stay inside one segment and "**" matches any
// number of segments. A pattern also covers everything below a path it
// matches, so "backend/*" overlaps "backend/domains/canon/*". Character classes
// are treated as any single character, which can only over-report overlap.
// An empty pattern overlaps nothing.
func ScopesOverlap(a, b string) bool {
	repoA, a := SplitScope(a)
	repoB, b := SplitScope(b)
	if repoA != repoB {
		return false
	}
	a, b = strings.Trim(a, "/"), strings.Trim(b, "/")
	if a == "" || b == "" {
		return false
	}
	return segmentsOverlap(strings.Split(a, "/"), strings.Split(b, "/"))
}

func segmentsOverlap(a, b []string) bool {
	// An exhausted pattern matched a directory that the other pattern can
	// still extend below.
	if len(a) == 0 || len(b) == 0 {
		return true
	}
	if a[0] == "**" {
		return segmentsOverlap(a[1:], b) || segmentsOverlap(a, b[1:])
	}
	if b[0] == "**" {
		return segmentsOverlap(a, b[1:]) || segmentsOverlap(a[1:], b)
	}
	return segmentOverlap(globTokens(a[0]), globTokens(b[0])) && segmentsOverlap(a[1:], b[1:])
}

// globToken is one element of a segment pattern: '*', '?', or a literal rune.
type globToken struct {
	kind rune
	char rune
}

func globTokens(segment string) []globToken {
	var out []globToken
	runes := []rune(segment)
	for i := 0; i < len(runes); i++ {
		switch r := runes[i]; r {
		case '*':
			if len(out) == 0 || out[len(out)-1].kind != '*' {
				out = append(out, globToken{kind: '*'})
			}
		case '?':
			out = append(out, globToken{kind: '?'})
		case '[':
			j := i + 1
			for j < len(runes) && runes[j] != ']' {
				j++
			}
			out = append(out, globToken{kind: '?'})
			i = j
		case '\\':
			if i+1 < len(runes) {
				i++
			}
			out = append(out, globToken{char: runes[i]})
		default:
			out = append(out, globToken{char: r})
		}
	}
	return out
}

// segmentOverlap reports whether one string matches both segment patterns.
func segmentOverlap(a, b []globToken) bool {
	memo := map[[2]int]bool{}
	var walk func(i, j int) bool
	walk = func(i, j int) bool {
		key := [2]int{i, j}
		if done, ok := memo[key]; ok {
			return done
		}
		var result bool
		switch {
		case i == len(a) && j == len(b):
			result = true
		case i < len(a) && a[i].kind == '*':
			result = walk(i+1, j) || (j < len(b) && walk(i, j+1))
		case j < len(b) && b[j].kind == '*':
			result = walk(i, j+1) || (i < len(a) && walk(i+1, j))
		case i == len(a) || j == len(b):
			result = false
		default:
			same := a[i].kind == '?' || b[j].kind == '?' || a[i].char == b[j].char
			result = same && walk(i+1, j+1)
		}
		memo[key] = result
		return result
	}
	return walk(0, 0)
}
