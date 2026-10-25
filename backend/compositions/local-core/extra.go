package localcore

import (
	"context"
	"database/sql"
	"errors"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/domains/integrations"
	"github.com/polterware/polterware/backend/domains/projects"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	cliprobe "github.com/polterware/polterware/backend/providers/cli"
)

func (core *Core) GetProjectSettings(_ context.Context, request *connect.Request[localv1.GetProjectSettingsRequest]) (*connect.Response[localv1.GetProjectSettingsResponse], error) {
	item, err := core.Store.GetProjectSettings(request.Msg.ProjectId)
	if errors.Is(err, sql.ErrNoRows) {
		item = projects.Settings{ProjectID: request.Msg.ProjectId}
		return connect.NewResponse(&localv1.GetProjectSettingsResponse{Settings: settingsProto(item)}), nil
	}
	if err != nil {
		return nil, internal(err)
	}
	return connect.NewResponse(&localv1.GetProjectSettingsResponse{Settings: settingsProto(item)}), nil
}

func (core *Core) SaveProjectSettings(_ context.Context, request *connect.Request[localv1.SaveProjectSettingsRequest]) (*connect.Response[localv1.SaveProjectSettingsResponse], error) {
	item := request.Msg.GetSettings()
	if item == nil || item.ProjectId == "" {
		return nil, invalid("project settings are required")
	}
	settings := projects.Settings{ProjectID: item.ProjectId, Description: item.Description, DefaultEnvironmentID: item.DefaultEnvironmentId, Repository: item.Repository}
	if err := core.Store.SaveProjectSettings(settings); err != nil {
		return nil, internal(err)
	}
	return connect.NewResponse(&localv1.SaveProjectSettingsResponse{Settings: settingsProto(settings)}), nil
}

func (core *Core) ListIntegrationResources(_ context.Context, request *connect.Request[localv1.ListIntegrationResourcesRequest]) (*connect.Response[localv1.ListIntegrationResourcesResponse], error) {
	items, err := core.Store.ListIntegrationResources(request.Msg.ProjectId)
	if err != nil {
		return nil, internal(err)
	}
	result := make([]*localv1.IntegrationResource, 0, len(items))
	for _, item := range items {
		result = append(result, integrationResourceProto(item))
	}
	return connect.NewResponse(&localv1.ListIntegrationResourcesResponse{Resources: result}), nil
}

func (core *Core) ListIntegrationSyncRuns(_ context.Context, request *connect.Request[localv1.ListIntegrationSyncRunsRequest]) (*connect.Response[localv1.ListIntegrationSyncRunsResponse], error) {
	items, err := core.Store.ListIntegrationSyncRuns(request.Msg.ProjectId)
	if err != nil {
		return nil, internal(err)
	}
	result := make([]*localv1.IntegrationSyncRun, 0, len(items))
	for _, item := range items {
		result = append(result, syncRunProto(item))
	}
	return connect.NewResponse(&localv1.ListIntegrationSyncRunsResponse{Runs: result}), nil
}

func (core *Core) SaveIntegrationSyncRun(_ context.Context, request *connect.Request[localv1.SaveIntegrationSyncRunRequest]) (*connect.Response[localv1.SaveIntegrationSyncRunResponse], error) {
	item := request.Msg.GetRun()
	if item == nil || item.Id == "" || item.ConnectionId == "" {
		return nil, invalid("sync run id and connection id are required")
	}
	run := integrations.SyncRun{
		ID:           item.Id,
		ConnectionID: item.ConnectionId,
		StartedAt:    item.StartedAt,
		FinishedAt:   item.FinishedAt,
		Result:       item.Result,
		Imported:     int(item.Imported),
		Changed:      int(item.Changed),
		Message:      item.Message,
	}
	if err := core.Store.SaveIntegrationSyncRun(run); err != nil {
		return nil, internal(err)
	}
	return connect.NewResponse(&localv1.SaveIntegrationSyncRunResponse{Run: syncRunProto(run)}), nil
}

func (core *Core) ProbeCliProvider(_ context.Context, request *connect.Request[localv1.ProbeCliProviderRequest]) (*connect.Response[localv1.ProbeCliProviderResponse], error) {
	if request.Msg.ProviderId == "" {
		return nil, invalid("provider id is required")
	}
	result := cliprobe.Probe(request.Msg.ProviderId)
	return connect.NewResponse(&localv1.ProbeCliProviderResponse{
		ProviderId:   result.ProviderID,
		Available:    result.Available,
		BinaryPath:   result.BinaryPath,
		Status:       result.Status,
		AccountLabel: result.AccountLabel,
		Message:      result.Message,
	}), nil
}

func (core *Core) BeginCliAuth(_ context.Context, request *connect.Request[localv1.BeginCliAuthRequest]) (*connect.Response[localv1.BeginCliAuthResponse], error) {
	if request.Msg.ProviderId == "" {
		return nil, invalid("provider id is required")
	}
	plan, err := cliprobe.BeginAuth(request.Msg.ProviderId)
	if err != nil {
		return nil, invalid("unknown provider")
	}
	return connect.NewResponse(&localv1.BeginCliAuthResponse{
		ProviderId:  plan.ProviderID,
		AuthCommand: plan.AuthCommand,
		DocsUrl:     plan.DocsURL,
		Message:     plan.Message,
	}), nil
}

func settingsProto(item projects.Settings) *localv1.ProjectSettings {
	return &localv1.ProjectSettings{ProjectId: item.ProjectID, Description: item.Description, DefaultEnvironmentId: item.DefaultEnvironmentID, Repository: item.Repository}
}

func integrationResourceProto(item integrations.Resource) *localv1.IntegrationResource {
	return &localv1.IntegrationResource{Id: item.ID, ConnectionId: item.ConnectionID, Name: item.Name, Kind: item.Kind, ExternalId: item.ExternalID, EnvironmentId: item.EnvironmentID, Status: item.Status}
}

func syncRunProto(item integrations.SyncRun) *localv1.IntegrationSyncRun {
	return &localv1.IntegrationSyncRun{Id: item.ID, ConnectionId: item.ConnectionID, StartedAt: item.StartedAt, FinishedAt: item.FinishedAt, Result: item.Result, Imported: int32(item.Imported), Changed: int32(item.Changed), Message: item.Message}
}
