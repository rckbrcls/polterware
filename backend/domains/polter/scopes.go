package polter

import (
	"slices"
	"strings"

	"github.com/polterware/polterware/backend/domains/structure"
)

// ParseScopes reads a `scope:` value: Structure node paths separated by commas.
// Blanks and duplicates are dropped and the list is sorted, so two writes of
// the same contexts compare equal. An empty value is an empty list (the whole
// project).
func ParseScopes(value string) []string {
	var out []string
	for _, part := range strings.Split(value, ",") {
		if part = strings.TrimSpace(part); part != "" && !slices.Contains(out, part) {
			out = append(out, part)
		}
	}
	slices.Sort(out)
	return out
}

// checkScopes reports each path that is not an active Structure node.
func (p *planner) checkScopes(line int, paths []string) bool {
	ok := true
	for _, path := range paths {
		if node, exists := p.nodes[path]; !exists || node.Status == structure.NodeRemoved {
			p.errorf(line, "unknown scope %q: use a Structure node path", path)
			ok = false
		}
	}
	return ok
}
