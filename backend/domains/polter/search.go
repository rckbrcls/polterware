package polter

import (
	"fmt"
	"strings"
	"unicode/utf8"

	contextpkg "github.com/polterware/polterware/backend/domains/context"
	"github.com/polterware/polterware/backend/domains/decision"
	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
)

// Search lists, one line each, the Structure nodes, cards, decisions, docs,
// and facts whose text holds every term (case-insensitive), in that order.
// Each line names what brief, decision, or card reads in full. A tight
// budget drops lines from the end and says how many.
func Search(in BriefInput, terms string, budget int) string {
	if budget < 1 {
		budget = contextpkg.DefaultTokenBudget
	}
	if budget > contextpkg.MaxTokenBudget {
		budget = contextpkg.MaxTokenBudget
	}
	words := strings.Fields(strings.ToLower(terms))
	if len(words) == 0 {
		return "no terms: use search <terms>\n"
	}
	matches := func(texts ...string) bool {
		haystack := strings.ToLower(strings.Join(texts, "\n"))
		for _, word := range words {
			if !strings.Contains(haystack, word) {
				return false
			}
		}
		return true
	}
	var lines []string
	for _, node := range in.Snapshot.Nodes {
		if node.Status != structure.NodeRemoved && matches(node.Path, node.Title, node.Intent, node.Kind, node.Tech) {
			lines = append(lines, fmt.Sprintf("node %s  %s  %q", node.Path, node.Level, node.Title))
		}
	}
	for _, card := range in.Snapshot.Cards {
		if card.Status == work.CardActive && matches(card.Slug, card.Title, card.Intent) {
			lines = append(lines, fmt.Sprintf("card %s  %s  %q", card.Slug, card.Stage, card.Title))
		}
	}
	for _, d := range in.Snapshot.Decisions {
		if matches(d.Title, d.Body) {
			lines = append(lines, fmt.Sprintf("decision %s  %s  %q", decisionHandle(d), decision.Normalize(d.Status), decision.StripNumber(d.Title)))
		}
	}
	for _, doc := range in.Docs {
		if !matches(doc.Title, doc.Body) {
			continue
		}
		line := fmt.Sprintf("doc %s  %q", doc.ID, doc.Title)
		if excerpt := excerptAround(doc.Body, words); excerpt != "" {
			line += ": " + excerpt
		}
		lines = append(lines, line)
	}
	for _, fact := range in.Snapshot.Facts {
		if matches(fact.Statement) {
			lines = append(lines, fmt.Sprintf("fact %s: %s", fact.TruthClass, fact.Statement))
		}
	}
	if len(lines) == 0 {
		return fmt.Sprintf("no matches for %q\n", strings.TrimSpace(terms))
	}
	return packBrief([][]string{lines}, budget)
}

// excerptAround is up to 100 runes of body around the first term it holds.
func excerptAround(body string, words []string) string {
	text := strings.Join(strings.Fields(body), " ")
	lower := strings.ToLower(text)
	at := -1
	for _, word := range words {
		if i := strings.Index(lower, word); i >= 0 && (at < 0 || i < at) {
			at = i
		}
	}
	if at < 0 {
		return ""
	}
	if len(lower) != len(text) {
		// Lowercasing changed byte offsets; start at the top instead.
		at = 0
	}
	start := at - 40
	if start < 0 {
		start = 0
	}
	for start > 0 && !utf8.RuneStart(text[start]) {
		start--
	}
	excerpt := contextpkg.Excerpt(text[start:], 100)
	if start > 0 {
		excerpt = "…" + excerpt
	}
	return excerpt
}
