package contextpkg

import (
	"strings"
	"unicode/utf8"
)

const DefaultTokenBudget = 1200
const MaxTokenBudget = 8000

// Stable reason codes for why an item entered a compiled package.
const (
	ReasonExactEntity     = "exact_entity"
	ReasonKnowledgeLink   = "knowledge_link"
	ReasonRelationshipHop = "relationship_hop"
	ReasonFTSHit          = "fts_hit"
	ReasonTitleMatch      = "title_match"
	ReasonProjectSample   = "project_sample"
	ReasonFactForEntity   = "fact_for_entity"
	ReasonFactQueryMatch  = "fact_query_match"
	ReasonImportedFact    = "imported_fact"
)

type Request struct {
	ProjectID   string
	Query       string
	EntityID    string
	TokenBudget int
	// ScopeNodeID narrows candidates to one Structure node, its descendants and,
	// unless ScopeExact, its ancestors. ScopeNodeIDs adds more nodes; the
	// package keeps the union. Empty is the whole project.
	ScopeNodeID  string
	ScopeNodeIDs []string
	ScopeExact   bool
}

// ScopeIDs returns the legacy node plus ScopeNodeIDs, without blanks or duplicates.
func (r Request) ScopeIDs() []string {
	seen := map[string]bool{}
	var out []string
	add := func(id string) {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			return
		}
		seen[id] = true
		out = append(out, id)
	}
	add(r.ScopeNodeID)
	for _, id := range r.ScopeNodeIDs {
		add(id)
	}
	return out
}

// EvidenceRef is a compact pointer to Canon evidence supporting a context item.
type EvidenceRef struct {
	ID      string
	Kind    string
	Summary string
	Path    string
	Source  string
}

type Item struct {
	Kind       string
	ID         string
	Title      string
	Excerpt    string
	TruthClass string
	Source     string
	Path       string
	Reasons    []string
	Evidence   []EvidenceRef
}

type Package struct {
	ProjectID   string
	Query       string
	EntityID    string
	TokenBudget int
	TokensUsed  int
	Items       []Item
	Truncated   bool
}

func NormalizeBudget(budget int) int {
	if budget <= 0 {
		return DefaultTokenBudget
	}
	if budget > MaxTokenBudget {
		return MaxTokenBudget
	}
	return budget
}

func EstimateTokens(text string) int {
	n := utf8.RuneCountInString(text)
	if n == 0 {
		return 0
	}
	// Rough English heuristic: ~4 characters per token.
	tokens := (n + 3) / 4
	if tokens < 1 {
		return 1
	}
	return tokens
}

func Excerpt(body string, maxRunes int) string {
	body = strings.TrimSpace(body)
	if maxRunes <= 0 {
		maxRunes = 240
	}
	runes := []rune(body)
	if len(runes) <= maxRunes {
		return body
	}
	return string(runes[:maxRunes]) + "…"
}

func itemTokenCost(item Item) int {
	cost := EstimateTokens(item.Title) + EstimateTokens(item.Excerpt) + 8
	for _, reason := range item.Reasons {
		cost += EstimateTokens(reason)
	}
	for _, ev := range item.Evidence {
		cost += EstimateTokens(ev.Summary) + EstimateTokens(ev.Path) + 4
	}
	return cost
}

// Compile packs candidates under a token budget. Exact entity matches rank first,
// then facts, linked knowledge, then search hits. Declared truth outranks inferred.
func Compile(req Request, candidates []Item) Package {
	budget := NormalizeBudget(req.TokenBudget)
	ranked := rank(candidates)
	out := Package{
		ProjectID:   req.ProjectID,
		Query:       req.Query,
		EntityID:    req.EntityID,
		TokenBudget: budget,
		Items:       make([]Item, 0, len(ranked)),
	}
	used := 0
	for _, item := range ranked {
		cost := itemTokenCost(item)
		if used+cost > budget && len(out.Items) > 0 {
			out.Truncated = true
			break
		}
		if used+cost > budget {
			item.Excerpt = Excerpt(item.Excerpt, 80)
			if len(item.Evidence) > 2 {
				item.Evidence = item.Evidence[:2]
			}
			cost = itemTokenCost(item)
			if used+cost > budget {
				out.Truncated = true
				break
			}
		}
		out.Items = append(out.Items, item)
		used += cost
	}
	out.TokensUsed = used
	return out
}

func rank(items []Item) []Item {
	out := append([]Item(nil), items...)
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if rankScore(out[j]) > rankScore(out[i]) {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out
}

func rankScore(item Item) int {
	score := 0
	switch item.TruthClass {
	case "verified":
		score += 45
	case "declared":
		score += 40
	case "observed":
		score += 30
	case "operational":
		score += 20
	case "inferred":
		score += 10
	}
	switch item.Kind {
	case "entity":
		score += 50
	case "fact":
		score += 45
	case "verdict":
		score += 35
	case "evidence":
		score += 30
	}
	return score
}

// MergeReasons appends unique reason codes in order.
func MergeReasons(existing []string, added ...string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(existing)+len(added))
	for _, r := range existing {
		if r == "" {
			continue
		}
		if _, ok := seen[r]; ok {
			continue
		}
		seen[r] = struct{}{}
		out = append(out, r)
	}
	for _, r := range added {
		if r == "" {
			continue
		}
		if _, ok := seen[r]; ok {
			continue
		}
		seen[r] = struct{}{}
		out = append(out, r)
	}
	return out
}
