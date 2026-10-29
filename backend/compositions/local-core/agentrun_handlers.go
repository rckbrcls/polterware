package localcore

import (
	"context"
	"errors"
	"strings"
	"time"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/agentrun"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func (core *Core) ListAgentRuns(_ context.Context, request *connect.Request[localv1.ListAgentRunsRequest]) (*connect.Response[localv1.ListAgentRunsResponse], error) {
	if request.Msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	runs, err := core.Store.ListAgentRuns(request.Msg.ProjectId, int(request.Msg.Limit))
	if err != nil {
		return nil, internal(err)
	}
	out := make([]*localv1.AgentRun, 0, len(runs))
	for _, run := range runs {
		out = append(out, agentRunProto(run))
	}
	return connect.NewResponse(&localv1.ListAgentRunsResponse{Runs: out}), nil
}

func (core *Core) GetAgentRun(_ context.Context, request *connect.Request[localv1.GetAgentRunRequest]) (*connect.Response[localv1.GetAgentRunResponse], error) {
	if request.Msg.Id == "" {
		return nil, invalid("agent run id is required")
	}
	record, err := core.Store.GetAgentRunRecord(request.Msg.Id)
	if errors.Is(err, agentrun.ErrUnknownRun) {
		return nil, connect.NewError(connect.CodeNotFound, err)
	}
	if err != nil {
		return nil, internal(err)
	}
	steps := make([]*localv1.AgentRunStep, 0, len(record.Steps))
	for _, step := range record.Steps {
		steps = append(steps, agentRunStepProto(step))
	}
	return connect.NewResponse(&localv1.GetAgentRunResponse{
		Run:   agentRunProto(record.Run),
		Steps: steps,
	}), nil
}

func (core *Core) ListChanges(_ context.Context, request *connect.Request[localv1.ListChangesRequest]) (*connect.Response[localv1.ListChangesResponse], error) {
	if request.Msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	actorKind := request.Msg.ActorKind
	if actorKind != "" {
		normalized, err := agentrun.NormalizeActorKind(actorKind)
		if err != nil {
			return nil, invalid(err.Error())
		}
		actorKind = normalized
	}
	resolved, err := wedge.LoadNodeScopes(core.Store, request.Msg.ProjectId, wedge.ScopeRefs(request.Msg.ScopeNode, request.Msg.ScopeNodes), request.Msg.ScopeExact)
	if err != nil {
		return nil, invalid(err.Error())
	}
	var rows []storepkg.ChangeRow
	if subject := strings.TrimSpace(request.Msg.SubjectId); subject != "" {
		rows, err = core.Store.ListSubjectChanges(request.Msg.ProjectId, actorKind, subject, int(request.Msg.Limit))
	} else if resolved.Set == nil {
		rows, err = core.Store.ListChanges(request.Msg.ProjectId, actorKind, int(request.Msg.Limit))
	} else {
		rows, err = core.Store.ListAllChanges(request.Msg.ProjectId, actorKind)
		if err == nil {
			index, indexErr := wedge.EntityScopeIndex(core.Store, request.Msg.ProjectId)
			if indexErr != nil {
				return nil, internal(indexErr)
			}
			rows = wedge.FilterChangesByScope(resolved, index, rows)
			limit := storepkg.ChangeLimit(int(request.Msg.Limit))
			if len(rows) > limit {
				rows = rows[:limit]
			}
		}
	}
	if err != nil {
		return nil, internal(err)
	}
	out := make([]*localv1.ProjectChange, 0, len(rows))
	for _, row := range rows {
		out = append(out, &localv1.ProjectChange{
			StepId:      row.StepID,
			AgentRunId:  row.AgentRunID,
			ProjectId:   row.ProjectID,
			ActorKind:   row.ActorKind,
			AgentLabel:  row.AgentLabel,
			RunStatus:   row.RunStatus,
			RunTask:     row.RunTask,
			Summary:     row.Summary,
			PayloadJson: row.PayloadJSON,
			CreatedAt:   row.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	return connect.NewResponse(&localv1.ListChangesResponse{Changes: out}), nil
}

func agentRunProto(run agentrun.Run) *localv1.AgentRun {
	actorKind := run.ActorKind
	if actorKind == "" {
		actorKind = agentrun.ActorKindAgent
	}
	out := &localv1.AgentRun{
		Id: run.ID, ProjectId: run.ProjectID, Task: run.Task, AgentLabel: run.AgentLabel,
		Status: run.Status, ActorKind: actorKind, CreatedAt: run.CreatedAt.UTC().Format(time.RFC3339),
	}
	if run.CompletedAt != nil {
		out.CompletedAt = run.CompletedAt.UTC().Format(time.RFC3339)
	}
	return out
}

func agentRunStepProto(step agentrun.Step) *localv1.AgentRunStep {
	return &localv1.AgentRunStep{
		Id: step.ID, AgentRunId: step.AgentRunID, Kind: step.Kind,
		Summary: step.Summary, PayloadJson: step.PayloadJSON,
		CreatedAt: step.CreatedAt.UTC().Format(time.RFC3339),
	}
}
