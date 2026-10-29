package mcp

import (
	"fmt"
	"time"

	"github.com/polterware/polterware/backend/domains/agentrun"
	"github.com/polterware/polterware/backend/domains/canon"
	"github.com/polterware/polterware/backend/domains/knowledge"
)

func (s *Server) factUpsert(args map[string]any) (string, error) {
	env, err := parseAuditedEnvelope(args)
	if err != nil {
		return "", err
	}
	statement := stringFrom(args["statement"])
	if statement == "" {
		return "", fmt.Errorf("statement is required")
	}
	return s.withAuditedWrite(env, ToolFactUpsert, func(run agentrun.Run) ([]string, any, error) {
		_ = run
		id := stringFrom(args["id"])
		truthClass := stringFrom(args["truth_class"])
		entityID := stringFrom(args["entity_id"])
		var fact canon.Fact
		if id == "" {
			fact, err = canon.NewFact(env.ProjectID, statement, truthClass, agentrun.SourceMCP, agentrun.ActorAgent, entityID)
			if err != nil {
				return nil, nil, err
			}
		} else {
			now := time.Now().UTC()
			fact = canon.Fact{
				ID:         id,
				ProjectID:  env.ProjectID,
				Statement:  statement,
				TruthClass: truthClass,
				Source:     agentrun.SourceMCP,
				Actor:      agentrun.ActorAgent,
				EntityID:   entityID,
				ObservedAt: now,
				CreatedAt:  now,
				UpdatedAt:  now,
			}
			if fact.TruthClass == "" {
				fact.TruthClass = canon.TruthDeclared
			}
			if existing, getErr := s.Store.GetCanonFact(id); getErr == nil {
				fact.CreatedAt = existing.CreatedAt
				if existing.ProjectID != env.ProjectID {
					return nil, nil, canon.ErrUnknownFact
				}
			}
			if err := canon.ValidateFact(fact); err != nil {
				return nil, nil, err
			}
		}
		if fact.EntityID != "" {
			if _, err := s.Store.GetCanonEntity(fact.EntityID); err != nil {
				return nil, nil, fmt.Errorf("entity not found")
			}
		}
		if err := s.Store.UpsertCanonFact(fact); err != nil {
			return nil, nil, err
		}
		return []string{fact.ID}, factJSON(fact), nil
	})
}

func (s *Server) evidenceUpsert(args map[string]any) (string, error) {
	env, err := parseAuditedEnvelope(args)
	if err != nil {
		return "", err
	}
	kind := stringFrom(args["kind"])
	if kind == "" {
		return "", fmt.Errorf("kind is required")
	}
	return s.withAuditedWrite(env, ToolEvidenceUpsert, func(run agentrun.Run) ([]string, any, error) {
		_ = run
		id := stringFrom(args["id"])
		summary := stringFrom(args["evidence_summary"])
		if summary == "" {
			summary = env.Summary
		}
		path := stringFrom(args["path"])
		var evidence canon.Evidence
		if id == "" {
			evidence, err = canon.NewEvidence(env.ProjectID, kind, summary, agentrun.SourceMCP, path, agentrun.ActorAgent)
			if err != nil {
				return nil, nil, err
			}
		} else {
			now := time.Now().UTC()
			evidence = canon.Evidence{
				ID:         id,
				ProjectID:  env.ProjectID,
				Kind:       kind,
				Summary:    summary,
				Source:     agentrun.SourceMCP,
				Path:       path,
				Actor:      agentrun.ActorAgent,
				ObservedAt: now,
				CreatedAt:  now,
				UpdatedAt:  now,
			}
			if existing, getErr := s.Store.GetCanonEvidence(id); getErr == nil {
				evidence.CreatedAt = existing.CreatedAt
				if existing.ProjectID != env.ProjectID {
					return nil, nil, canon.ErrUnknownEvidence
				}
			}
			if err := canon.ValidateEvidence(evidence); err != nil {
				return nil, nil, err
			}
		}
		if err := s.Store.UpsertCanonEvidence(evidence); err != nil {
			return nil, nil, err
		}
		return []string{evidence.ID}, evidenceJSON(evidence), nil
	})
}

func (s *Server) evidenceLink(args map[string]any) (string, error) {
	env, err := parseAuditedEnvelope(args)
	if err != nil {
		return "", err
	}
	factID := stringFrom(args["fact_id"])
	evidenceID := stringFrom(args["evidence_id"])
	if factID == "" || evidenceID == "" {
		return "", fmt.Errorf("fact_id and evidence_id are required")
	}
	return s.withAuditedWrite(env, ToolEvidenceLink, func(run agentrun.Run) ([]string, any, error) {
		_ = run
		if err := s.Store.LinkCanonEvidenceToFact(env.ProjectID, factID, evidenceID); err != nil {
			return nil, nil, err
		}
		return []string{factID, evidenceID}, map[string]any{
			"fact_id":     factID,
			"evidence_id": evidenceID,
		}, nil
	})
}

func (s *Server) knowledgeUpsert(args map[string]any) (string, error) {
	env, err := parseAuditedEnvelope(args)
	if err != nil {
		return "", err
	}
	title := stringFrom(args["title"])
	kind := stringFrom(args["kind"])
	if title == "" || kind == "" {
		return "", fmt.Errorf("title and kind are required")
	}
	return s.withAuditedWrite(env, ToolKnowledgeUpsert, func(run agentrun.Run) ([]string, any, error) {
		_ = run
		id := stringFrom(args["id"])
		if id == "" {
			id = knowledge.NewItemID()
		}
		body := stringFrom(args["body"])
		item, err := knowledge.NewItem(id, env.ProjectID, title, body, kind, stringSliceFrom(args["tags"]))
		if err != nil {
			return nil, nil, err
		}
		item.Summary = stringFrom(args["item_summary"])
		item.Owner = agentrun.ActorAgent
		item.Status = stringFrom(args["status"])
		if extra := stringFrom(args["extra_json"]); extra != "" {
			item.ExtraJSON = extra
		}
		if err := s.Store.SaveKnowledge(item); err != nil {
			return nil, nil, err
		}
		return []string{item.ID}, knowledgeJSON(item), nil
	})
}

func (s *Server) knowledgeLink(args map[string]any) (string, error) {
	env, err := parseAuditedEnvelope(args)
	if err != nil {
		return "", err
	}
	knowledgeID := stringFrom(args["knowledge_id"])
	entityID := stringFrom(args["entity_id"])
	predicate := stringFrom(args["predicate"])
	if knowledgeID == "" || entityID == "" || predicate == "" {
		return "", fmt.Errorf("knowledge_id, entity_id, and predicate are required")
	}
	if !canon.ValidPredicate(predicate) {
		return "", fmt.Errorf("invalid predicate")
	}
	return s.withAuditedWrite(env, ToolKnowledgeLink, func(run agentrun.Run) ([]string, any, error) {
		_ = run
		link, err := knowledge.NewEntityLink(
			env.ProjectID,
			knowledgeID,
			entityID,
			predicate,
			stringFrom(args["truth_class"]),
			agentrun.SourceMCP,
			agentrun.ActorAgent,
		)
		if err != nil {
			return nil, nil, err
		}
		if _, err := s.Store.GetCanonEntity(link.EntityID); err != nil {
			return nil, nil, fmt.Errorf("entity not found")
		}
		if err := s.Store.SaveKnowledgeLink(link); err != nil {
			return nil, nil, err
		}
		return []string{link.ID, link.KnowledgeID, link.EntityID}, knowledgeLinkJSON(link), nil
	})
}

func factJSON(fact canon.Fact) map[string]any {
	out := map[string]any{
		"id":          fact.ID,
		"project_id":  fact.ProjectID,
		"statement":   fact.Statement,
		"truth_class": fact.TruthClass,
		"source":      fact.Source,
		"actor":       fact.Actor,
		"observed_at": fact.ObservedAt.UTC().Format(time.RFC3339),
		"created_at":  fact.CreatedAt.UTC().Format(time.RFC3339),
		"updated_at":  fact.UpdatedAt.UTC().Format(time.RFC3339),
	}
	if fact.EntityID != "" {
		out["entity_id"] = fact.EntityID
	}
	return out
}

func evidenceJSON(evidence canon.Evidence) map[string]any {
	return map[string]any{
		"id":          evidence.ID,
		"project_id":  evidence.ProjectID,
		"kind":        evidence.Kind,
		"summary":     evidence.Summary,
		"source":      evidence.Source,
		"path":        evidence.Path,
		"actor":       evidence.Actor,
		"observed_at": evidence.ObservedAt.UTC().Format(time.RFC3339),
		"created_at":  evidence.CreatedAt.UTC().Format(time.RFC3339),
		"updated_at":  evidence.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func knowledgeJSON(item knowledge.Item) map[string]any {
	return map[string]any{
		"id":         item.ID,
		"project_id": item.ProjectID,
		"title":      item.Title,
		"body":       item.Body,
		"kind":       item.Kind,
		"tags":       item.Tags,
		"summary":    item.Summary,
		"owner":      item.Owner,
		"status":     item.Status,
		"extra_json": item.ExtraJSON,
		"created_at": item.CreatedAt.UTC().Format(time.RFC3339),
		"updated_at": item.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func knowledgeLinkJSON(link knowledge.EntityLink) map[string]any {
	return map[string]any{
		"id":           link.ID,
		"project_id":   link.ProjectID,
		"knowledge_id": link.KnowledgeID,
		"entity_id":    link.EntityID,
		"predicate":    link.Predicate,
		"truth_class":  link.TruthClass,
		"source":       link.Source,
		"actor":        link.Actor,
		"observed_at":  link.ObservedAt.UTC().Format(time.RFC3339),
		"created_at":   link.CreatedAt.UTC().Format(time.RFC3339),
	}
}
