package mcp

import (
	"fmt"

	"github.com/polterware/polterware/backend/domains/polter"
)

// The MCP surface is four tools: reads and Polter writes, the format, and
// docs, whose Markdown bodies do not fit Polter text.
const (
	ToolPolterQuery  = "polter.query"
	ToolPolterApply  = "polter.apply"
	ToolPolterFormat = "polter.format"
	ToolDocUpsert    = "doc.upsert"
)

// retiredTools maps each removed tool to what replaces it, so an agent with a
// stale tool list gets a pointer instead of "unknown tool".
var retiredTools = map[string]string{
	"context.get":        `polter.query "brief <slug|path|file>" or "search <terms>"`,
	"entity.get":         `polter.query "show <id>"`,
	"evidence.get":       "nothing: evidence is retired",
	"drift.check":        `polter.query "drift"`,
	"agent_run.start":    "nothing: polter.apply and doc.upsert join this session's run on their own",
	"agent_run.append":   "nothing: polter.apply and doc.upsert join this session's run on their own",
	"agent_run.complete": "nothing: the session run completes when the session closes",
	"agent_run.get":      `polter.query "show <run id>"`,
	"agent_run.list":     "the Activity page in the Desktop",
	"fact.upsert":        "polter.apply with a #### slug: Statement block (polter.format topic facts)",
	"evidence.upsert":    "nothing: evidence is retired; a Fact is a statement with its scope",
	"evidence.link":      "nothing: evidence is retired; a Fact is a statement with its scope",
	"knowledge.upsert":   "doc.upsert for docs, or polter.apply with a ### block for Decisions",
	"knowledge.link":     "doc.upsert with scope: <Structure path>",
}

func scopeArgumentSchema() map[string]any {
	return map[string]any{
		"description": "Structure node path, slug, or id, or a list of them. The read keeps the union of each node, its descendants, and its ancestors. Omit for the whole project.",
		"oneOf": []any{
			map[string]any{"type": "string"},
			map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
		},
	}
}

func toolDefinitions() []map[string]any {
	return []map[string]any{
		{
			"name":        ToolPolterQuery,
			"description": "Read project state as compact text. Read \"brief <slug|path|file>\" before working on a card, node, or file; \"search <terms>\" finds anything. The query field lists the other reads.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"project_id":  map[string]any{"type": "string"},
					"query":       map[string]any{"type": "string", "description": "\"brief <slug|path|file> [budget:N]\", \"search <terms>\", \"show <id>\", \"drift\", \"cards\" (default), \"card <slug>\", \"status\", \"inbox\", \"handoff <slug>\", \"structure [<path>]\", \"decisions [state]\", \"decision <id>\", \"feature <slug> [shape|contract|plan]\", \"verify <slug|slug#T2>\", \"milestones\", \"roadmap\", or \"canvas [<name|id>]\""},
					"scope":       scopeArgumentSchema(),
					"scope_exact": map[string]any{"type": "boolean", "description": "With scope, leave out each node's ancestors."},
				},
				"required": []string{"project_id"},
			},
		},
		{
			"name":        ToolPolterApply,
			"description": "Write Work cards, Structure nodes, Decisions, and Facts from Polter text in one audited write that joins this session's run. Needs summary and rationale (frontmatter or arguments). dry_run returns the plan.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"project_id":   map[string]any{"type": "string"},
					"text":         map[string]any{"type": "string", "description": "Polter format text"},
					"dry_run":      map[string]any{"type": "boolean"},
					"summary":      map[string]any{"type": "string", "description": "Overrides the frontmatter summary"},
					"rationale":    map[string]any{"type": "string", "description": "Overrides the frontmatter rationale"},
					"agent_run_id": map[string]any{"type": "string", "description": "Optional open AgentRun"},
				},
				"required": []string{"project_id", "text"},
			},
		},
		{
			"name":        ToolPolterFormat,
			"description": fmt.Sprintf("Polter format core (about %d tokens); read once before polter.apply. topic adds one part.", polter.SpecCoreTokens),
			"inputSchema": map[string]any{"type": "object", "properties": map[string]any{
				"topic": map[string]any{"type": "string", "enum": polter.SpecTopicNames},
			}},
		},
		{
			"name":        ToolDocUpsert,
			"description": "Create or update a doc (Markdown body) in one audited write that joins this session's run. Pass id to update; omitted fields stay. scope lists the Structure paths the doc is about, comma separated (empty clears).",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"project_id": map[string]any{"type": "string"},
					"id":         map[string]any{"type": "string"},
					"title":      map[string]any{"type": "string"},
					"body":       map[string]any{"type": "string"},
					"tags":       map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
					"scope":      map[string]any{"type": "string"},
					"summary":    map[string]any{"type": "string"},
					"rationale":  map[string]any{"type": "string"},
				},
				"required": []string{"project_id", "summary", "rationale"},
			},
		},
	}
}

func (s *Server) invokeTool(name string, args map[string]any) (string, error) {
	switch name {
	case ToolPolterFormat:
		return polter.FormatSpec(stringFrom(args["topic"]))
	case ToolPolterQuery:
		return s.polterQuery(args)
	case ToolPolterApply:
		return s.polterApply(args)
	case ToolDocUpsert:
		return s.docUpsert(args)
	}
	if replacement, ok := retiredTools[name]; ok {
		return "", fmt.Errorf("%s was removed: use %s", name, replacement)
	}
	return "", fmt.Errorf("unknown tool %q: use polter.query, polter.apply, polter.format, or doc.upsert", name)
}
