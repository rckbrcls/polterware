package mcp

import (
	"errors"
	"fmt"
	"strings"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/agentrun"
	"github.com/polterware/polterware/backend/domains/knowledge"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// docUpsert creates or updates one doc as an audited write in this session's
// run. On update, omitted fields keep their value.
func (s *Server) docUpsert(args map[string]any) (string, error) {
	projectID := stringFrom(args["project_id"])
	if projectID == "" {
		return "", fmt.Errorf("project_id is required")
	}
	summary, rationale := stringFrom(args["summary"]), stringFrom(args["rationale"])
	if err := agentrun.ValidateChange(summary, rationale); err != nil {
		return "", fmt.Errorf("%w: pass summary and rationale", err)
	}
	id := strings.TrimSpace(stringFrom(args["id"]))
	var item knowledge.Item
	if id != "" {
		existing, err := s.Store.GetKnowledge(id)
		if err != nil || existing.ProjectID != projectID || existing.Kind != knowledge.KindDoc {
			return "", fmt.Errorf("unknown doc %q: search <terms> finds docs, or omit id to create one", id)
		}
		if existing.Archived() {
			return "", knowledge.ErrArchived
		}
		item = existing
	} else {
		created, err := knowledge.NewItem(knowledge.NewItemID(), projectID, stringFrom(args["title"]), stringFrom(args["body"]), knowledge.KindDoc, stringSliceFrom(args["tags"]))
		if err != nil {
			return "", fmt.Errorf("a new doc needs a title: %w", err)
		}
		item = created
		item.Owner = agentrun.ActorAgent
	}
	if title, ok := args["title"].(string); ok && strings.TrimSpace(title) != "" {
		item.Title = strings.TrimSpace(title)
	}
	if body, ok := args["body"].(string); ok {
		item.Body = body
	}
	if _, ok := args["tags"]; ok {
		item.Tags = stringSliceFrom(args["tags"])
	}
	// Docs have no types; an older doc_type argument may only not name the retired source.
	if docType, ok := args["doc_type"].(string); ok {
		if err := knowledge.CheckDocType(docType); err != nil {
			return "", err
		}
	}
	item.DocType = knowledge.DocTypeDoc
	var scopeNodes []string
	setScope := false
	if scope, ok := args["scope"].(string); ok {
		setScope = true
		if refs := wedge.ScopeRefs("", []string{scope}); len(refs) > 0 {
			resolved, err := wedge.ResolveScopeRefs(s.Store, projectID, refs, true)
			if err != nil {
				return "", fmt.Errorf("unknown scope %q: use Structure node paths, comma separated", scope)
			}
			scopeNodes = resolved.NodeIDs
		}
	}
	runID := stringFrom(args["agent_run_id"])
	if runID == "" {
		var err error
		if runID, err = s.session.RunFor(s.Store, projectID, summary); err != nil {
			return "", err
		}
	}
	_, err := wedge.ExecuteAuditedWrite(s.Store,
		wedge.ChangeEnvelope{Summary: summary, Rationale: rationale, AgentRunID: runID, ProjectID: projectID},
		agentrun.ActorKindAgent, ToolDocUpsert,
		func(agentrun.Run) ([]string, any, error) {
			if err := s.Store.SaveKnowledge(item); err != nil {
				return nil, nil, err
			}
			if setScope {
				if err := s.Store.SetScope(projectID, storepkg.ScopeKnowledge, item.ID, scopeNodes); err != nil {
					return nil, nil, err
				}
			}
			return []string{item.ID}, nil, nil
		})
	if err != nil {
		if errors.Is(err, knowledge.ErrInvalid) {
			return "", fmt.Errorf("invalid doc: %w", err)
		}
		return "", err
	}
	verb := "updated"
	if id == "" {
		verb = "created"
	}
	return fmt.Sprintf("%s doc %s %q (agent_run_id %s)\n", verb, item.ID, item.Title, runID), nil
}
