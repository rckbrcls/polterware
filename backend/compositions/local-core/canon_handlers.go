package localcore

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/agentaccess"
	"github.com/polterware/polterware/backend/domains/agentrun"
	"github.com/polterware/polterware/backend/domains/canon"
	contextpkg "github.com/polterware/polterware/backend/domains/context"
	"github.com/polterware/polterware/backend/domains/knowledge"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func (core *Core) ListEntities(_ context.Context, request *connect.Request[localv1.ListEntitiesRequest]) (*connect.Response[localv1.ListEntitiesResponse], error) {
	if request.Msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	_, _ = core.Store.SyncProjectModel(request.Msg.ProjectId)
	items, err := core.Store.ListCanonEntities(request.Msg.ProjectId, request.Msg.Kind)
	if err != nil {
		return nil, internal(err)
	}
	out := make([]*localv1.CanonEntity, 0, len(items))
	for _, item := range items {
		out = append(out, canonEntityProto(item))
	}
	return connect.NewResponse(&localv1.ListEntitiesResponse{Entities: out}), nil
}

func (core *Core) ListRelationships(_ context.Context, request *connect.Request[localv1.ListRelationshipsRequest]) (*connect.Response[localv1.ListRelationshipsResponse], error) {
	if request.Msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	items, err := core.Store.ListCanonRelationships(request.Msg.ProjectId, request.Msg.EntityId)
	if err != nil {
		return nil, internal(err)
	}
	out := make([]*localv1.CanonRelationship, 0, len(items))
	for _, item := range items {
		out = append(out, canonRelationshipProto(item))
	}
	return connect.NewResponse(&localv1.ListRelationshipsResponse{Relationships: out}), nil
}

func (core *Core) GetEntity(_ context.Context, request *connect.Request[localv1.GetEntityRequest]) (*connect.Response[localv1.GetEntityResponse], error) {
	if request.Msg.Id == "" {
		return nil, invalid("entity id is required")
	}
	item, err := core.Store.GetCanonEntity(request.Msg.Id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, connect.NewError(connect.CodeNotFound, canon.ErrUnknownEntity)
	}
	if err != nil {
		return nil, internal(err)
	}
	return connect.NewResponse(&localv1.GetEntityResponse{Entity: canonEntityProto(item)}), nil
}

func (core *Core) SyncProjectModel(_ context.Context, request *connect.Request[localv1.SyncProjectModelRequest]) (*connect.Response[localv1.SyncProjectModelResponse], error) {
	if request.Msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	count, err := core.Store.SyncProjectModel(request.Msg.ProjectId)
	if err != nil {
		return nil, internal(err)
	}
	return connect.NewResponse(&localv1.SyncProjectModelResponse{EntityCount: int32(count)}), nil
}

func (core *Core) ListFacts(_ context.Context, request *connect.Request[localv1.ListFactsRequest]) (*connect.Response[localv1.ListFactsResponse], error) {
	if request.Msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	items, err := core.Store.ListCanonFacts(request.Msg.ProjectId, request.Msg.EntityId)
	if err != nil {
		return nil, internal(err)
	}
	resolved, err := wedge.LoadNodeScopes(core.Store, request.Msg.ProjectId, wedge.ScopeRefs(request.Msg.ScopeNode, request.Msg.ScopeNodes), request.Msg.ScopeExact)
	if err != nil {
		return nil, invalid(err.Error())
	}
	scopes, err := core.Store.ScopeMap(request.Msg.ProjectId, storepkg.ScopeFact)
	if err != nil {
		return nil, internal(err)
	}
	out := make([]*localv1.CanonFact, 0, len(items))
	for _, item := range wedge.FilterFactsByScope(resolved, scopes, items) {
		msg := canonFactProto(item)
		msg.ScopeNodeId = scopes[item.ID]
		out = append(out, msg)
	}
	return connect.NewResponse(&localv1.ListFactsResponse{Facts: out}), nil
}

func (core *Core) GetFact(_ context.Context, request *connect.Request[localv1.GetFactRequest]) (*connect.Response[localv1.GetFactResponse], error) {
	if request.Msg.Id == "" {
		return nil, invalid("fact id is required")
	}
	fact, err := core.Store.GetCanonFact(request.Msg.Id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, connect.NewError(connect.CodeNotFound, canon.ErrUnknownFact)
	}
	if err != nil {
		return nil, internal(err)
	}
	evidence, err := core.Store.ListCanonEvidenceForFact(fact.ID)
	if err != nil {
		return nil, internal(err)
	}
	out := make([]*localv1.CanonEvidence, 0, len(evidence))
	for _, item := range evidence {
		out = append(out, canonEvidenceProto(item))
	}
	return connect.NewResponse(&localv1.GetFactResponse{Fact: canonFactProto(fact), Evidence: out}), nil
}

func (core *Core) UpsertFact(_ context.Context, request *connect.Request[localv1.UpsertFactRequest]) (*connect.Response[localv1.UpsertFactResponse], error) {
	msg := request.Msg.GetFact()
	if msg == nil {
		return nil, invalid("fact is required")
	}
	env, err := changeEnvelopeFromProto(request.Msg.GetChange())
	if err != nil {
		return nil, mapAuditedErr(err)
	}
	fact, err := canonFactFromProto(msg)
	if err != nil {
		return nil, invalid(err.Error())
	}
	env.ProjectID = fact.ProjectID
	fact.Actor = agentrun.ActorHuman
	fact.Source = agentrun.SourceDesktop
	if fact.EntityID != "" {
		if _, err := core.Store.GetCanonEntity(fact.EntityID); err != nil {
			return nil, invalid("entity not found")
		}
	}
	_, err = wedge.ExecuteAuditedWrite(
		core.Store,
		env,
		agentrun.ActorKindHuman,
		"desktop.fact.upsert",
		func(run agentrun.Run) ([]string, any, error) {
			_ = run
			if err := core.Store.UpsertCanonFact(fact); err != nil {
				return nil, nil, err
			}
			return []string{fact.ID}, fact, nil
		},
	)
	if err != nil {
		return nil, mapAuditedErr(err)
	}
	return connect.NewResponse(&localv1.UpsertFactResponse{Fact: canonFactProto(fact)}), nil
}

func (core *Core) ListEvidence(_ context.Context, request *connect.Request[localv1.ListEvidenceRequest]) (*connect.Response[localv1.ListEvidenceResponse], error) {
	if request.Msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	items, err := core.Store.ListCanonEvidence(request.Msg.ProjectId)
	if err != nil {
		return nil, internal(err)
	}
	resolved, err := wedge.LoadNodeScopes(core.Store, request.Msg.ProjectId, wedge.ScopeRefs(request.Msg.ScopeNode, request.Msg.ScopeNodes), request.Msg.ScopeExact)
	if err != nil {
		return nil, invalid(err.Error())
	}
	scopes, err := core.Store.ScopeMap(request.Msg.ProjectId, storepkg.ScopeEvidence)
	if err != nil {
		return nil, internal(err)
	}
	out := make([]*localv1.CanonEvidence, 0, len(items))
	for _, item := range wedge.FilterEvidenceByScope(resolved, scopes, items) {
		msg := canonEvidenceProto(item)
		msg.ScopeNodeId = scopes[item.ID]
		out = append(out, msg)
	}
	return connect.NewResponse(&localv1.ListEvidenceResponse{Evidence: out}), nil
}

func (core *Core) GetEvidence(_ context.Context, request *connect.Request[localv1.GetEvidenceRequest]) (*connect.Response[localv1.GetEvidenceResponse], error) {
	if request.Msg.Id == "" {
		return nil, invalid("evidence id is required")
	}
	item, err := core.Store.GetCanonEvidence(request.Msg.Id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, connect.NewError(connect.CodeNotFound, canon.ErrUnknownEvidence)
	}
	if err != nil {
		return nil, internal(err)
	}
	return connect.NewResponse(&localv1.GetEvidenceResponse{Evidence: canonEvidenceProto(item)}), nil
}

func (core *Core) UpsertEvidence(_ context.Context, request *connect.Request[localv1.UpsertEvidenceRequest]) (*connect.Response[localv1.UpsertEvidenceResponse], error) {
	msg := request.Msg.GetEvidence()
	if msg == nil {
		return nil, invalid("evidence is required")
	}
	env, err := changeEnvelopeFromProto(request.Msg.GetChange())
	if err != nil {
		return nil, mapAuditedErr(err)
	}
	evidence, err := canonEvidenceFromProto(msg)
	if err != nil {
		return nil, invalid(err.Error())
	}
	env.ProjectID = evidence.ProjectID
	evidence.Actor = agentrun.ActorHuman
	evidence.Source = agentrun.SourceDesktop
	_, err = wedge.ExecuteAuditedWrite(
		core.Store,
		env,
		agentrun.ActorKindHuman,
		"desktop.evidence.upsert",
		func(run agentrun.Run) ([]string, any, error) {
			_ = run
			if err := core.Store.UpsertCanonEvidence(evidence); err != nil {
				return nil, nil, err
			}
			return []string{evidence.ID}, evidence, nil
		},
	)
	if err != nil {
		return nil, mapAuditedErr(err)
	}
	return connect.NewResponse(&localv1.UpsertEvidenceResponse{Evidence: canonEvidenceProto(evidence)}), nil
}

func (core *Core) LinkEvidenceToFact(_ context.Context, request *connect.Request[localv1.LinkEvidenceToFactRequest]) (*connect.Response[localv1.LinkEvidenceToFactResponse], error) {
	if request.Msg.ProjectId == "" || request.Msg.FactId == "" || request.Msg.EvidenceId == "" {
		return nil, invalid("project id, fact id, and evidence id are required")
	}
	env, err := changeEnvelopeFromProto(request.Msg.GetChange())
	if err != nil {
		return nil, mapAuditedErr(err)
	}
	env.ProjectID = request.Msg.ProjectId
	_, err = wedge.ExecuteAuditedWrite(
		core.Store,
		env,
		agentrun.ActorKindHuman,
		"desktop.evidence.link",
		func(run agentrun.Run) ([]string, any, error) {
			_ = run
			linkErr := core.Store.LinkCanonEvidenceToFact(request.Msg.ProjectId, request.Msg.FactId, request.Msg.EvidenceId)
			if linkErr != nil {
				return nil, nil, linkErr
			}
			return []string{request.Msg.FactId, request.Msg.EvidenceId}, nil, nil
		},
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) || errors.Is(err, canon.ErrUnknownFact) || errors.Is(err, canon.ErrUnknownEvidence) {
			return nil, connect.NewError(connect.CodeNotFound, err)
		}
		return nil, mapAuditedErr(err)
	}
	return connect.NewResponse(&localv1.LinkEvidenceToFactResponse{}), nil
}

func (core *Core) ImportProjectSources(_ context.Context, request *connect.Request[localv1.ImportProjectSourcesRequest]) (*connect.Response[localv1.ImportProjectSourcesResponse], error) {
	result, err := wedge.ScanProject(core.Store, request.Msg.ProjectId)
	if err != nil {
		msg := err.Error()
		switch {
		case msg == "project id is required",
			msg == "project root path is empty",
			msg == "project root path does not exist":
			return nil, invalid(msg)
		case msg == "unknown project":
			return nil, connect.NewError(connect.CodeNotFound, err)
		default:
			return nil, internal(err)
		}
	}
	return connect.NewResponse(&localv1.ImportProjectSourcesResponse{
		FactCount:     result.FactCount,
		EvidenceCount: result.EvidenceCount,
		SourceCount:   result.SourceCount,
		SkippedCount:  result.SkippedCount,
		Message:       result.Message,
	}), nil
}

func (core *Core) SearchKnowledge(_ context.Context, request *connect.Request[localv1.SearchKnowledgeRequest]) (*connect.Response[localv1.SearchKnowledgeResponse], error) {
	if request.Msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	hits, err := core.Store.SearchKnowledge(request.Msg.ProjectId, request.Msg.Query, request.Msg.Kind, int(request.Msg.Limit))
	if err != nil {
		return nil, internal(err)
	}
	out := make([]*localv1.KnowledgeSearchHit, 0, len(hits))
	for _, hit := range hits {
		out = append(out, &localv1.KnowledgeSearchHit{
			Item: knowledgeProto(hit.Item), Score: hit.Score, Snippet: hit.Snippet,
			TruthClass: hit.TruthClass, Source: hit.Source,
		})
	}
	return connect.NewResponse(&localv1.SearchKnowledgeResponse{Hits: out}), nil
}

func (core *Core) ListKnowledgeLinks(_ context.Context, request *connect.Request[localv1.ListKnowledgeLinksRequest]) (*connect.Response[localv1.ListKnowledgeLinksResponse], error) {
	if request.Msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	items, err := core.Store.ListKnowledgeLinks(request.Msg.ProjectId, request.Msg.KnowledgeId, request.Msg.EntityId)
	if err != nil {
		return nil, internal(err)
	}
	out := make([]*localv1.KnowledgeEntityLink, 0, len(items))
	for _, item := range items {
		out = append(out, knowledgeLinkProto(item))
	}
	return connect.NewResponse(&localv1.ListKnowledgeLinksResponse{Links: out}), nil
}

func (core *Core) SaveKnowledgeLink(_ context.Context, request *connect.Request[localv1.SaveKnowledgeLinkRequest]) (*connect.Response[localv1.SaveKnowledgeLinkResponse], error) {
	msg := request.Msg.GetLink()
	if msg == nil {
		return nil, invalid("link is required")
	}
	env, err := changeEnvelopeFromProto(request.Msg.GetChange())
	if err != nil {
		return nil, mapAuditedErr(err)
	}
	if !canon.ValidPredicate(msg.Predicate) {
		return nil, invalid("invalid predicate")
	}
	actor := msg.Actor
	if actor == "" {
		actor = agentrun.ActorHuman
	}
	source := msg.Source
	if source == "" {
		source = agentrun.SourceDesktop
	}
	link, err := knowledge.NewEntityLink(msg.ProjectId, msg.KnowledgeId, msg.EntityId, msg.Predicate, msg.TruthClass, source, actor)
	if err != nil {
		return nil, invalid(err.Error())
	}
	if msg.Id != "" {
		link.ID = msg.Id
	}
	env.ProjectID = link.ProjectID
	if _, err := core.Store.GetCanonEntity(link.EntityID); err != nil {
		return nil, invalid("entity not found")
	}
	_, err = wedge.ExecuteAuditedWrite(
		core.Store,
		env,
		agentrun.ActorKindHuman,
		"desktop.knowledge.link",
		func(run agentrun.Run) ([]string, any, error) {
			_ = run
			if err := core.Store.SaveKnowledgeLink(link); err != nil {
				return nil, nil, err
			}
			return []string{link.ID}, link, nil
		},
	)
	if err != nil {
		return nil, mapAuditedErr(err)
	}
	return connect.NewResponse(&localv1.SaveKnowledgeLinkResponse{Link: knowledgeLinkProto(link)}), nil
}

func (core *Core) DeleteKnowledgeLink(_ context.Context, request *connect.Request[localv1.DeleteKnowledgeLinkRequest]) (*connect.Response[localv1.DeleteKnowledgeLinkResponse], error) {
	if request.Msg.Id == "" {
		return nil, invalid("link id is required")
	}
	env, err := changeEnvelopeFromProto(request.Msg.GetChange())
	if err != nil {
		return nil, mapAuditedErr(err)
	}
	existing, err := core.Store.GetKnowledgeLink(request.Msg.Id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("unknown knowledge link"))
	}
	if err != nil {
		return nil, internal(err)
	}
	env.ProjectID = existing.ProjectID
	_, err = wedge.ExecuteAuditedWrite(
		core.Store,
		env,
		agentrun.ActorKindHuman,
		"desktop.knowledge.unlink",
		func(run agentrun.Run) ([]string, any, error) {
			_ = run
			if err := core.Store.DeleteKnowledgeLink(request.Msg.Id); err != nil {
				return nil, nil, err
			}
			return []string{request.Msg.Id}, nil, nil
		},
	)
	if err != nil {
		return nil, mapAuditedErr(err)
	}
	return connect.NewResponse(&localv1.DeleteKnowledgeLinkResponse{}), nil
}

func (core *Core) CompileContext(_ context.Context, request *connect.Request[localv1.CompileContextRequest]) (*connect.Response[localv1.CompileContextResponse], error) {
	if request.Msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	var pkg contextpkg.Package
	scope, err := wedge.ResolveScopeRefs(core.Store, request.Msg.ProjectId, wedge.ScopeRefs(request.Msg.ScopeNode, request.Msg.ScopeNodes), request.Msg.ScopeExact)
	if err != nil {
		return nil, invalid(err.Error())
	}
	if request.Msg.AgentRunId != "" {
		// Same path as the CLI and MCP: appends a context step to the run.
		pkg, err = wedge.CompileContext(core.Store, wedge.ContextInput{
			ProjectID:    request.Msg.ProjectId,
			Query:        request.Msg.Query,
			EntityID:     request.Msg.EntityId,
			TokenBudget:  int(request.Msg.TokenBudget),
			AgentRunID:   request.Msg.AgentRunId,
			ScopeNodeIDs: scope.NodeIDs,
			ScopeExact:   scope.Exact,
		})
		if err != nil {
			return nil, mapAuditedErr(err)
		}
	} else {
		_, _ = core.Store.SyncProjectModel(request.Msg.ProjectId)
		pkg, err = core.Store.CompileContext(contextpkg.Request{
			ProjectID:    request.Msg.ProjectId,
			Query:        request.Msg.Query,
			EntityID:     request.Msg.EntityId,
			TokenBudget:  int(request.Msg.TokenBudget),
			ScopeNodeIDs: scope.NodeIDs,
			ScopeExact:   scope.Exact,
		})
	}
	summary := "compile failed"
	ok := err == nil
	if err == nil {
		summary = agentaccess.SummarizeResult(
			fmt.Sprintf("items=%d tokens=%d truncated=%v", len(pkg.Items), pkg.TokensUsed, pkg.Truncated),
			240,
		)
	} else {
		summary = agentaccess.SummarizeResult(err.Error(), 240)
	}
	_ = core.Store.AppendAgentToolCall(agentaccess.ToolCall{
		ProjectID:     request.Msg.ProjectId,
		AgentRunID:    request.Msg.AgentRunId,
		ToolName:      "context.get",
		ArgumentsJSON: fmt.Sprintf(`{"query":%q,"entity_id":%q,"token_budget":%d}`, request.Msg.Query, request.Msg.EntityId, request.Msg.TokenBudget),
		ResultSummary: summary,
		OK:            ok,
		Source:        clientOf(request.Header()),
	})
	if err != nil {
		return nil, internal(err)
	}
	items := make([]*localv1.ContextItem, 0, len(pkg.Items))
	for _, item := range pkg.Items {
		evidence := make([]*localv1.ContextEvidenceRef, 0, len(item.Evidence))
		for _, ev := range item.Evidence {
			evidence = append(evidence, &localv1.ContextEvidenceRef{
				Id: ev.ID, Kind: ev.Kind, Summary: ev.Summary, Path: ev.Path, Source: ev.Source,
			})
		}
		items = append(items, &localv1.ContextItem{
			Kind: item.Kind, Id: item.ID, Title: item.Title, Excerpt: item.Excerpt,
			TruthClass: item.TruthClass, Source: item.Source, Path: item.Path,
			Reasons: item.Reasons, Evidence: evidence,
		})
	}
	return connect.NewResponse(&localv1.CompileContextResponse{
		ProjectId: pkg.ProjectID, Query: pkg.Query, EntityId: pkg.EntityID,
		TokenBudget: int32(pkg.TokenBudget), TokensUsed: int32(pkg.TokensUsed),
		Truncated: pkg.Truncated, Items: items,
	}), nil
}

func (core *Core) ListAgentToolCalls(_ context.Context, request *connect.Request[localv1.ListAgentToolCallsRequest]) (*connect.Response[localv1.ListAgentToolCallsResponse], error) {
	calls, err := core.Store.ListAgentToolCalls(int(request.Msg.Limit))
	if err != nil {
		return nil, internal(err)
	}
	out := make([]*localv1.AgentToolCall, 0, len(calls))
	for _, call := range calls {
		out = append(out, &localv1.AgentToolCall{
			Id: call.ID, ProjectId: call.ProjectID, ToolName: call.ToolName,
			ArgumentsJson: call.ArgumentsJSON, ResultSummary: call.ResultSummary,
			Ok: call.OK, Source: call.Source, CreatedAt: call.CreatedAt.Format(time.RFC3339),
			AgentRunId: call.AgentRunID,
		})
	}
	return connect.NewResponse(&localv1.ListAgentToolCallsResponse{Calls: out}), nil
}

func (core *Core) CheckDrift(_ context.Context, request *connect.Request[localv1.CheckDriftRequest]) (*connect.Response[localv1.CheckDriftResponse], error) {
	if request.Msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	result, err := wedge.CheckDrift(core.Store, wedge.DriftInput{
		ProjectID:  request.Msg.ProjectId,
		EntityID:   request.Msg.EntityId,
		AgentRunID: request.Msg.AgentRunId,
	})
	summary := "drift check failed"
	ok := err == nil
	if err == nil {
		summary = agentaccess.SummarizeResult(
			fmt.Sprintf("checker=%s findings=%d", result.Checker, len(result.Findings)),
			240,
		)
	} else {
		summary = agentaccess.SummarizeResult(err.Error(), 240)
	}
	_ = core.Store.AppendAgentToolCall(agentaccess.ToolCall{
		ProjectID:     request.Msg.ProjectId,
		AgentRunID:    request.Msg.AgentRunId,
		ToolName:      "drift.check",
		ArgumentsJSON: fmt.Sprintf(`{"entity_id":%q}`, request.Msg.EntityId),
		ResultSummary: summary,
		OK:            ok,
		Source:        clientOf(request.Header()),
	})
	if err != nil {
		return nil, mapDriftErr(err)
	}
	findings := make([]*localv1.DriftFinding, 0, len(result.Findings))
	for _, finding := range result.Findings {
		findings = append(findings, &localv1.DriftFinding{
			Type:        finding.Type,
			Severity:    finding.Severity,
			Summary:     finding.Summary,
			SubjectIds:  finding.SubjectIDs,
			EvidenceIds: finding.EvidenceIDs,
		})
	}
	return connect.NewResponse(&localv1.CheckDriftResponse{
		ProjectId: result.ProjectID,
		EntityId:  result.EntityID,
		Status:    result.Status,
		Checker:   result.Checker,
		Findings:  findings,
	}), nil
}

func mapDriftErr(err error) error {
	if err == nil {
		return nil
	}
	msg := err.Error()
	if msg == "unknown project" || msg == "project_id is required" {
		return invalid(msg)
	}
	return internal(err)
}

func canonEntityProto(item canon.Entity) *localv1.CanonEntity {
	return &localv1.CanonEntity{
		Id: item.ID, ProjectId: item.ProjectID, Kind: item.Kind, RefKind: item.RefKind, RefId: item.RefID,
		Title: item.Title, TruthClass: item.TruthClass, Source: item.Source, Actor: item.Actor,
		ObservedAt: item.ObservedAt.Format(time.RFC3339), CreatedAt: item.CreatedAt.Format(time.RFC3339),
		UpdatedAt: item.UpdatedAt.Format(time.RFC3339),
	}
}

func canonRelationshipProto(item canon.Relationship) *localv1.CanonRelationship {
	return &localv1.CanonRelationship{
		Id: item.ID, ProjectId: item.ProjectID, SubjectEntityId: item.SubjectEntityID,
		Predicate: item.Predicate, ObjectEntityId: item.ObjectEntityID, TruthClass: item.TruthClass,
		Source: item.Source, Actor: item.Actor, ObservedAt: item.ObservedAt.Format(time.RFC3339),
		CreatedAt: item.CreatedAt.Format(time.RFC3339),
	}
}

func canonFactProto(item canon.Fact) *localv1.CanonFact {
	return &localv1.CanonFact{
		Id: item.ID, ProjectId: item.ProjectID, Statement: item.Statement, TruthClass: item.TruthClass,
		Source: item.Source, Actor: item.Actor, ObservedAt: item.ObservedAt.Format(time.RFC3339),
		EntityId: item.EntityID, CreatedAt: item.CreatedAt.Format(time.RFC3339),
		UpdatedAt: item.UpdatedAt.Format(time.RFC3339),
	}
}

func canonEvidenceProto(item canon.Evidence) *localv1.CanonEvidence {
	return &localv1.CanonEvidence{
		Id: item.ID, ProjectId: item.ProjectID, Kind: item.Kind, Summary: item.Summary,
		Source: item.Source, Path: item.Path, Actor: item.Actor,
		ObservedAt: item.ObservedAt.Format(time.RFC3339), CreatedAt: item.CreatedAt.Format(time.RFC3339),
		UpdatedAt: item.UpdatedAt.Format(time.RFC3339),
	}
}

func canonFactFromProto(msg *localv1.CanonFact) (canon.Fact, error) {
	if msg.Id == "" {
		return canon.NewFact(msg.ProjectId, msg.Statement, msg.TruthClass, msg.Source, msg.Actor, msg.EntityId)
	}
	now := time.Now().UTC()
	fact := canon.Fact{
		ID: msg.Id, ProjectID: msg.ProjectId, Statement: msg.Statement, TruthClass: msg.TruthClass,
		Source: msg.Source, Actor: msg.Actor, EntityID: msg.EntityId,
		ObservedAt: now, CreatedAt: now, UpdatedAt: now,
	}
	if fact.TruthClass == "" {
		fact.TruthClass = canon.TruthDeclared
	}
	if fact.Source == "" {
		fact.Source = "polterware"
	}
	if fact.Actor == "" {
		fact.Actor = "system"
	}
	if msg.ObservedAt != "" {
		if parsed, err := time.Parse(time.RFC3339, msg.ObservedAt); err == nil {
			fact.ObservedAt = parsed
		}
	}
	if msg.CreatedAt != "" {
		if parsed, err := time.Parse(time.RFC3339, msg.CreatedAt); err == nil {
			fact.CreatedAt = parsed
		}
	}
	if err := canon.ValidateFact(fact); err != nil {
		return canon.Fact{}, err
	}
	fact.UpdatedAt = now
	return fact, nil
}

func canonEvidenceFromProto(msg *localv1.CanonEvidence) (canon.Evidence, error) {
	if msg.Id == "" {
		return canon.NewEvidence(msg.ProjectId, msg.Kind, msg.Summary, msg.Source, msg.Path, msg.Actor)
	}
	now := time.Now().UTC()
	evidence := canon.Evidence{
		ID: msg.Id, ProjectID: msg.ProjectId, Kind: msg.Kind, Summary: msg.Summary,
		Source: msg.Source, Path: msg.Path, Actor: msg.Actor,
		ObservedAt: now, CreatedAt: now, UpdatedAt: now,
	}
	if evidence.Source == "" {
		evidence.Source = "polterware"
	}
	if evidence.Actor == "" {
		evidence.Actor = "system"
	}
	if msg.ObservedAt != "" {
		if parsed, err := time.Parse(time.RFC3339, msg.ObservedAt); err == nil {
			evidence.ObservedAt = parsed
		}
	}
	if msg.CreatedAt != "" {
		if parsed, err := time.Parse(time.RFC3339, msg.CreatedAt); err == nil {
			evidence.CreatedAt = parsed
		}
	}
	if err := canon.ValidateEvidence(evidence); err != nil {
		return canon.Evidence{}, err
	}
	evidence.UpdatedAt = now
	return evidence, nil
}

func knowledgeLinkProto(item knowledge.EntityLink) *localv1.KnowledgeEntityLink {
	return &localv1.KnowledgeEntityLink{
		Id: item.ID, ProjectId: item.ProjectID, KnowledgeId: item.KnowledgeID, EntityId: item.EntityID,
		Predicate: item.Predicate, TruthClass: item.TruthClass, Source: item.Source, Actor: item.Actor,
		ObservedAt: item.ObservedAt.Format(time.RFC3339), CreatedAt: item.CreatedAt.Format(time.RFC3339),
	}
}
