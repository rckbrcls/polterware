package polter

import (
	"fmt"
	"slices"
	"strings"

	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
)

// EncodeStructure renders the graph, or one node and its children, as plain text.
func EncodeStructure(projectName string, rows []structure.Row, cards []work.Card, rules []work.Rule, focus string) string {
	if projectName == "" {
		projectName = "project"
	}
	byPath := map[string]structure.Row{}
	byID := map[string]structure.Row{}
	for _, row := range rows {
		byPath[row.Path] = row
		byID[row.ID] = row
	}
	var b strings.Builder
	if focus != "" {
		row, ok := byPath[focus]
		if !ok {
			row, ok = byID[focus]
		}
		if !ok {
			return fmt.Sprintf("unknown node %q: list the graph with polterware structure\n", focus)
		}
		writeStructureRow(&b, projectName, row, rows, cards, rules)
		return b.String()
	}
	fmt.Fprintf(&b, "%s\n", projectName)
	roots := 0
	for _, row := range rows {
		if row.ParentID != "" {
			continue
		}
		roots++
		fmt.Fprintf(&b, "%s  %s  %s%s  %q\n", row.Path, row.Level, statusLabel(row.Derived), migrationSuffix(row.Node), row.Title)
	}
	if roots == 0 {
		b.WriteString("No Structure nodes.\n")
	}
	return b.String()
}

func writeStructureRow(b *strings.Builder, projectName string, row structure.Row, rows []structure.Row, cards []work.Card, rules []work.Rule) {
	fmt.Fprintf(b, "%s\n", structureBreadcrumb(projectName, row, rows))
	fmt.Fprintf(b, "%s  %s  %s\n", row.Path, row.Level, statusLabel(row.Derived))
	if line := kindTechLine(&row.Node); line != "" {
		fmt.Fprintf(b, "%s\n", line)
	}
	if row.Intent != "" {
		fmt.Fprintf(b, "Intent: %s\n", row.Intent)
	}
	wroteRules := false
	for _, rule := range rules {
		if !slices.Contains(rule.Scopes, row.Path) {
			continue
		}
		if !wroteRules {
			b.WriteString("Rules:\n")
			wroteRules = true
		}
		fmt.Fprintf(b, "- %s\n", rule.Statement)
	}
	if len(row.Decisions) > 0 {
		fmt.Fprintf(b, "Decisions: %s\n", strings.Join(row.Decisions, ", "))
	}
	if row.Migrating() {
		fmt.Fprintf(b, "Migrating: %s -> %s\n", row.MigrationFrom, row.MigrationTo)
	}
	if checkout := checkoutLine(&row.Node); checkout != "" {
		fmt.Fprintf(b, "Checkout: %s\n", checkout)
	}
	fmt.Fprintf(b, "Reality: %d features · %d open questions\n", row.FeatureCount, row.OpenQuestions)
	b.WriteString("Children:\n")
	children := 0
	for _, child := range rows {
		if child.ParentID != row.ID {
			continue
		}
		children++
		fmt.Fprintf(b, "  %s  %s  %s  %q\n", child.Path, child.Level, statusLabel(child.Derived), child.Title)
	}
	for _, card := range cards {
		if card.Status != work.CardActive || card.Under != row.Path {
			continue
		}
		children++
		fmt.Fprintf(b, "  %s  %s  %q\n", card.Slug, card.Stage, card.Title)
	}
	if children == 0 {
		b.WriteString("  (none)\n")
	}
}

func structureBreadcrumb(projectName string, row structure.Row, rows []structure.Row) string {
	byID := map[string]structure.Row{}
	for _, item := range rows {
		byID[item.ID] = item
	}
	var parts []string
	current := row
	for {
		parts = append([]string{current.Title}, parts...)
		parent, ok := byID[current.ParentID]
		if !ok {
			break
		}
		current = parent
	}
	return projectName + " › " + strings.Join(parts, " › ")
}

func statusLabel(status string) string {
	switch status {
	case "":
		return "n/a"
	case structure.StatusInProgress:
		return "in progress"
	case structure.StatusDelivered:
		return "delivered"
	case structure.StatusDrift:
		return "drift"
	default:
		return "proposed"
	}
}

func migrationSuffix(node structure.Node) string {
	if !node.Migrating() {
		return ""
	}
	return "  migrating " + node.MigrationFrom + " -> " + node.MigrationTo
}

// kindTechLine is `kind: database · tech: Postgres`, or empty when the node
// has neither.
func kindTechLine(node *structure.Node) string {
	var parts []string
	if node.Kind != "" {
		parts = append(parts, "kind: "+node.Kind)
	}
	if node.Tech != "" {
		parts = append(parts, "tech: "+node.Tech)
	}
	return strings.Join(parts, " · ")
}

// checkoutLine is `repo: api · path: src/auth`, or empty when the node sits
// at the root of the project checkout.
func checkoutLine(node *structure.Node) string {
	var parts []string
	if node.Repo != "" {
		parts = append(parts, "repo: "+node.Repo)
	}
	if node.Folder != "" {
		parts = append(parts, "path: "+node.Folder)
	}
	return strings.Join(parts, " · ")
}

func ancestorChain(nodes []structure.Node, node *structure.Node) []structure.Node {
	if node == nil {
		return nil
	}
	byID := map[string]structure.Node{}
	for _, item := range nodes {
		byID[item.ID] = item
	}
	var chain []structure.Node
	current := *node
	for current.ParentID != "" {
		parent, ok := byID[current.ParentID]
		if !ok || parent.Status == structure.NodeRemoved {
			break
		}
		chain = append(chain, parent)
		current = parent
	}
	return chain
}
