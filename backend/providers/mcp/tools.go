package mcp

import (
	"fmt"

	"github.com/polterware/polterware/backend/domains/polter"
)

// Stable wedge MCP tools (B4 reads + B6 AgentRun audit + B7 audited writes).
const (
	ToolContextGet       = "context.get"
	ToolEntityGet        = "entity.get"
	ToolEvidenceGet      = "evidence.get"
	ToolDriftCheck       = "drift.check"
	ToolAgentRunStart    = "agent_run.start"
	ToolAgentRunAppend   = "agent_run.append"
	ToolAgentRunComplete = "agent_run.complete"
	ToolAgentRunGet      = "agent_run.get"
	ToolAgentRunList     = "agent_run.list"
	ToolFactUpsert       = "fact.upsert"
	ToolEvidenceUpsert   = "evidence.upsert"
	ToolEvidenceLink     = "evidence.link"
	ToolKnowledgeUpsert  = "knowledge.upsert"
	ToolKnowledgeLink    = "knowledge.link"
	// Polter channel (Verdict 0006): Work cards in Polter format.
	ToolPolterApply  = "polter.apply"
	ToolPolterQuery  = "polter.query"
	ToolPolterFormat = "polter.format"
)

func scopeArgumentSchema() map[string]any {
	return map[string]any{
		"description": "Structure node path, slug, or id, or a list of them. The read keeps the union of each node, its descendants, and its ancestors. Omit for the whole project.",
		"oneOf": []any{
			map[string]any{"type": "string"},
			map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
		},
	}
}

func auditedWriteProperties(extra map[string]any) map[string]any {
	props := map[string]any{
		"project_id":   map[string]any{"type": "string"},
		"agent_run_id": map[string]any{"type": "string"},
		"summary":      map[string]any{"type": "string", "description": "Change envelope summary (required)"},
		"rationale":    map[string]any{"type": "string", "description": "Change envelope rationale (required)"},
		"paths":        map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
	}
	for key, value := range extra {
		props[key] = value
	}
	return props
}

func auditedWriteRequired(extra ...string) []string {
	required := []string{"project_id", "agent_run_id", "summary", "rationale"}
	return append(required, extra...)
}

func toolDefinitions() []map[string]any {
	return []map[string]any{
		{
			"name":        ToolPolterFormat,
			"description": "Return the Polter format spec (about 150 tokens). Read it once before writing Work cards with polter.apply.",
			"inputSchema": map[string]any{"type": "object", "properties": map[string]any{}},
		},
		{
			"name":        ToolPolterQuery,
			"description": "Read Work state in Polter format: \"cards\", \"card <slug>\", \"status\" (current card, branch, last handoff), \"handoff <slug>\", \"canvas\" (agent-visible canvases), or \"canvas <name|id>\" (node-link export). A canvas that is not agent-visible is not listed and is not found.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"project_id":  map[string]any{"type": "string"},
					"query":       map[string]any{"type": "string", "description": "\"cards\" (default), \"card <slug>\", \"status\", \"inbox\", \"handoff <slug>\", \"decisions [state]\", \"decision <verdict>\", \"feature <slug> [shape|contract|plan]\", \"verify <slug|slug#T2>\", \"canvas\", or \"canvas <name|id>\" (agent-visible only)"},
					"scope":       scopeArgumentSchema(),
					"scope_exact": map[string]any{"type": "boolean", "description": "With scope, leave out each node's ancestors."},
				},
				"required": []string{"project_id"},
			},
		},
		{
			"name":        ToolPolterApply,
			"description": "Create or update Work cards, tasks, questions, invariants, and handoff blocks from Polter text in one audited write; claim: T2, done: T2, and release: T2 inside a card reserve or free a task for this session's client. Needs summary and rationale (frontmatter or arguments). Without agent_run_id the write joins this session's run; no agent_run.start/complete needed. dry_run returns the plan.",
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
			"name":        ToolContextGet,
			"description": "Compile a bounded, provenance-aware project context package with machine reasons and evidence refs. Pass agent_run_id to append a context step on an open AgentRun.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"project_id":   map[string]any{"type": "string"},
					"query":        map[string]any{"type": "string"},
					"entity_id":    map[string]any{"type": "string"},
					"token_budget": map[string]any{"type": "integer"},
					"agent_run_id": map[string]any{"type": "string"},
					"scope":        scopeArgumentSchema(),
					"scope_exact":  map[string]any{"type": "boolean", "description": "With scope, leave out each node's ancestors."},
				},
				"required": []string{"project_id"},
			},
		},
		{
			"name":        ToolEntityGet,
			"description": "Fetch one Canon entity by id.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"id": map[string]any{"type": "string"},
				},
				"required": []string{"id"},
			},
		},
		{
			"name":        ToolEvidenceGet,
			"description": "Fetch one Canon evidence record by id.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"id": map[string]any{"type": "string"},
				},
				"required": []string{"id"},
			},
		},
		{
			"name":        ToolDriftCheck,
			"description": "Run the narrow Drift Checker: import dependency diffs, edges under accepted Verdicts without evidence, and declared-versus-observed fact conflicts. Pass agent_run_id to append a drift step on an open AgentRun.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"project_id":   map[string]any{"type": "string"},
					"entity_id":    map[string]any{"type": "string"},
					"agent_run_id": map[string]any{"type": "string"},
				},
				"required": []string{"project_id"},
			},
		},
		{
			"name":        ToolAgentRunStart,
			"description": "Start a minimal AgentRun audit trail (context → task → change → evidence → drift).",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"project_id":  map[string]any{"type": "string"},
					"task":        map[string]any{"type": "string"},
					"agent_label": map[string]any{"type": "string"},
				},
				"required": []string{"project_id", "task"},
			},
		},
		{
			"name":        ToolAgentRunAppend,
			"description": "Append a declared-only change or evidence step to an open AgentRun. Change requires summary and rationale but does not mutate the Canon. Prefer fact.upsert / evidence.* / knowledge.* for real mutations.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"agent_run_id": map[string]any{"type": "string"},
					"kind":         map[string]any{"type": "string", "enum": []string{"change", "evidence"}},
					"summary":      map[string]any{"type": "string"},
					"rationale":    map[string]any{"type": "string"},
					"paths":        map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
					"evidence_ids": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
				},
				"required": []string{"agent_run_id", "kind"},
			},
		},
		{
			"name":        ToolAgentRunComplete,
			"description": "Mark an open AgentRun as completed.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"agent_run_id": map[string]any{"type": "string"},
				},
				"required": []string{"agent_run_id"},
			},
		},
		{
			"name":        ToolAgentRunGet,
			"description": "Fetch one AgentRun with ordered steps for audit reconstruction.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"id":           map[string]any{"type": "string"},
					"agent_run_id": map[string]any{"type": "string"},
				},
				"required": []string{"id"},
			},
		},
		{
			"name":        ToolAgentRunList,
			"description": "List AgentRuns for a project (newest first).",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"project_id": map[string]any{"type": "string"},
					"limit":      map[string]any{"type": "integer"},
				},
				"required": []string{"project_id"},
			},
		},
		{
			"name":        ToolFactUpsert,
			"description": "Audited write: upsert a Canon fact. Requires summary, rationale, and an open agent_run_id. Actor is always agent/mcp.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": auditedWriteProperties(map[string]any{
					"statement":   map[string]any{"type": "string"},
					"id":          map[string]any{"type": "string"},
					"truth_class": map[string]any{"type": "string"},
					"entity_id":   map[string]any{"type": "string"},
				}),
				"required": auditedWriteRequired("statement"),
			},
		},
		{
			"name":        ToolEvidenceUpsert,
			"description": "Audited write: upsert Canon evidence. Requires summary, rationale, and an open agent_run_id. Use evidence_summary for the evidence body (envelope summary is the change title).",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": auditedWriteProperties(map[string]any{
					"kind":             map[string]any{"type": "string"},
					"id":               map[string]any{"type": "string"},
					"evidence_summary": map[string]any{"type": "string"},
					"path":             map[string]any{"type": "string"},
				}),
				"required": auditedWriteRequired("kind"),
			},
		},
		{
			"name":        ToolEvidenceLink,
			"description": "Audited write: link existing evidence to a fact. Requires summary, rationale, and an open agent_run_id.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": auditedWriteProperties(map[string]any{
					"fact_id":     map[string]any{"type": "string"},
					"evidence_id": map[string]any{"type": "string"},
				}),
				"required": auditedWriteRequired("fact_id", "evidence_id"),
			},
		},
		{
			"name":        ToolKnowledgeUpsert,
			"description": "Audited write: upsert a knowledge item. Requires summary, rationale, and an open agent_run_id.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": auditedWriteProperties(map[string]any{
					"title":        map[string]any{"type": "string"},
					"kind":         map[string]any{"type": "string"},
					"id":           map[string]any{"type": "string"},
					"body":         map[string]any{"type": "string"},
					"tags":         map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
					"item_summary": map[string]any{"type": "string"},
					"status":       map[string]any{"type": "string"},
					"extra_json":   map[string]any{"type": "string"},
				}),
				"required": auditedWriteRequired("title", "kind"),
			},
		},
		{
			"name":        ToolKnowledgeLink,
			"description": "Audited write: link a knowledge item to a Canon entity. Requires summary, rationale, and an open agent_run_id.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": auditedWriteProperties(map[string]any{
					"knowledge_id": map[string]any{"type": "string"},
					"entity_id":    map[string]any{"type": "string"},
					"predicate":    map[string]any{"type": "string"},
					"truth_class":  map[string]any{"type": "string"},
				}),
				"required": auditedWriteRequired("knowledge_id", "entity_id", "predicate"),
			},
		},
	}
}

func (s *Server) invokeTool(name string, args map[string]any) (string, error) {
	switch name {
	case ToolPolterFormat:
		return polter.Spec, nil
	case ToolPolterQuery:
		return s.polterQuery(args)
	case ToolPolterApply:
		return s.polterApply(args)
	case ToolContextGet:
		return s.contextGet(args)
	case ToolEntityGet:
		return s.entityGet(args)
	case ToolEvidenceGet:
		return s.evidenceGet(args)
	case ToolDriftCheck:
		return s.driftCheck(args)
	case ToolAgentRunStart:
		return s.agentRunStart(args)
	case ToolAgentRunAppend:
		return s.agentRunAppend(args)
	case ToolAgentRunComplete:
		return s.agentRunComplete(args)
	case ToolAgentRunGet:
		return s.agentRunGet(args)
	case ToolAgentRunList:
		return s.agentRunList(args)
	case ToolFactUpsert:
		return s.factUpsert(args)
	case ToolEvidenceUpsert:
		return s.evidenceUpsert(args)
	case ToolEvidenceLink:
		return s.evidenceLink(args)
	case ToolKnowledgeUpsert:
		return s.knowledgeUpsert(args)
	case ToolKnowledgeLink:
		return s.knowledgeLink(args)
	default:
		return "", fmt.Errorf("unknown tool %q", name)
	}
}
