package polter

import (
	"fmt"
	"strings"

	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
)

// placed is one node path visible to later lines: stored, or earlier in the text.
type placed struct {
	line   int
	level  string
	status string
}

// ResolveNode places a heading against its under: value.
// headingPath is the text before the colon (`import` or `core/import`).
// Level is checked separately so an update can keep the stored level.
func ResolveNode(headingPath, under string, hasUnder bool) (path, parent, fromPath, message string) {
	if strings.Contains(headingPath, "/") {
		slash := strings.LastIndex(headingPath, "/")
		parent = headingPath[:slash]
		path = headingPath
		// A different under: moves the node; an empty one moves it to the project.
		if hasUnder && under != parent {
			slug := headingPath[slash+1:]
			if under == "" {
				return slug, "", headingPath, ""
			}
			return under + "/" + slug, under, headingPath, ""
		}
		return path, parent, "", ""
	}
	if hasUnder && under != "" {
		return under + "/" + headingPath, under, "", ""
	}
	return headingPath, "", "", ""
}

func checkPlacement(path, parent, level string) string {
	if level == "" {
		return fmt.Sprintf("node %q needs level: use %s", path, strings.Join(structure.Levels, "|"))
	}
	if !structure.ValidLevel(level) {
		return fmt.Sprintf("unknown level %q: use %s", level, strings.Join(structure.Levels, "|"))
	}
	if level == structure.LevelDomain && parent != "" {
		return fmt.Sprintf("domain %q sits under the project: remove under:", path)
	}
	return ""
}

// CheckGraph reports under: and level errors. A card under: is free text until
// the project or this text has a component; after that it must name one.
func CheckGraph(doc Document, stored []structure.Node, cards []work.Card) []Diagnostic {
	known := map[string]placed{}
	for _, node := range stored {
		known[node.Path] = placed{level: node.Level, status: node.Status}
	}
	var diags []Diagnostic
	for _, node := range doc.Nodes {
		level, _ := node.MetaValue("level")
		under, hasUnder := node.MetaValue("under")
		path, parent, fromPath, message := ResolveNode(node.Path, under, hasUnder)
		if message != "" {
			diags = append(diags, Diagnostic{Line: node.Line, Severity: SeverityError, Message: message})
			continue
		}
		if fromPath == "" && hasUnder {
			if _, ok := known[node.Path]; ok && path != node.Path {
				fromPath = node.Path
			}
		}
		source := path
		if fromPath != "" {
			source = fromPath
			prev, ok := known[fromPath]
			if !ok || prev.status == structure.NodeRemoved {
				diags = append(diags, Diagnostic{
					Line: node.Line, Severity: SeverityError,
					Message: fmt.Sprintf("unknown node %q: check the path", fromPath),
				})
				continue
			}
			if _, exists := known[path]; exists {
				diags = append(diags, Diagnostic{
					Line: node.Line, Severity: SeverityError,
					Message: fmt.Sprintf("path %q already exists: choose another parent", path),
				})
				continue
			}
		}
		if prev, ok := known[source]; ok && level == "" {
			level = prev.level
		}
		if message = checkPlacement(path, parent, level); message != "" {
			diags = append(diags, Diagnostic{Line: node.Line, Severity: SeverityError, Message: message})
			continue
		}
		if prev, ok := known[path]; ok && prev.line != 0 {
			diags = append(diags, Diagnostic{
				Line: node.Line, Severity: SeverityError,
				Message: fmt.Sprintf("duplicate path %q (also line %d): merge the two nodes", path, prev.line),
			})
			continue
		}
		status, hasStatus := node.MetaValue("status")
		if !hasStatus {
			if prev, ok := known[source]; ok {
				status = prev.status
			} else {
				status = structure.NodeActive
			}
		}
		if parent != "" && status != structure.NodeRemoved {
			prev, ok := known[parent]
			want, _ := structure.ParentLevel(level)
			switch {
			case !ok || prev.status == structure.NodeRemoved:
				diags = append(diags, Diagnostic{
					Line: node.Line, Severity: SeverityError,
					Message: fmt.Sprintf("unknown under %q: define the parent first", parent),
				})
				continue
			case !structure.AllowedParent(level, prev.level):
				diags = append(diags, Diagnostic{
					Line: node.Line, Severity: SeverityError,
					Message: fmt.Sprintf("under %q is a %s: a %s sits under a %s", parent, prev.level, level, want),
				})
				continue
			}
		}
		if status == structure.NodeRemoved {
			if n := countActiveChildren(known, path); n > 0 {
				diags = append(diags, Diagnostic{
					Line: node.Line, Severity: SeverityError,
					Message: fmt.Sprintf("node %q still has children: remove them first", path),
				})
				continue
			}
			if n := cardsUnder(cards, path); n > 0 {
				diags = append(diags, Diagnostic{
					Line: node.Line, Severity: SeverityError,
					Message: fmt.Sprintf("node %q still has cards: move their under: first", path),
				})
				continue
			}
		}
		entry := placed{line: node.Line, level: level, status: status}
		if prev, ok := known[source]; ok && level == "" {
			entry.level = prev.level
		}
		if fromPath != "" {
			delete(known, fromPath)
		}
		known[path] = entry
	}
	if countComponents(known) == 0 {
		return diags
	}
	for _, card := range doc.Cards {
		under, set := card.MetaValue("under")
		if !set || under == "" {
			continue
		}
		prev, ok := known[under]
		if !ok || prev.status == structure.NodeRemoved {
			diags = append(diags, Diagnostic{
				Line: card.Line, Severity: SeverityError,
				Message: fmt.Sprintf("unknown under %q: name a component path", under),
			})
			continue
		}
		if prev.level != structure.LevelComponent {
			diags = append(diags, Diagnostic{
				Line: card.Line, Severity: SeverityError,
				Message: fmt.Sprintf("under %q is a %s: cards sit under a component", under, prev.level),
			})
		}
	}
	return diags
}

func countComponents(known map[string]placed) int {
	n := 0
	for _, node := range known {
		if node.status != structure.NodeRemoved && node.level == structure.LevelComponent {
			n++
		}
	}
	return n
}

func countActiveChildren(known map[string]placed, parent string) int {
	n := 0
	prefix := parent + "/"
	for path, node := range known {
		if node.status == structure.NodeRemoved || !strings.HasPrefix(path, prefix) {
			continue
		}
		if !strings.Contains(strings.TrimPrefix(path, prefix), "/") {
			n++
		}
	}
	return n
}

func cardsUnder(cards []work.Card, path string) int {
	n := 0
	for _, card := range cards {
		if card.Status != work.CardRemoved && card.Under == path {
			n++
		}
	}
	return n
}
