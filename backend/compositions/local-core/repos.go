package localcore

import (
	"context"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/domains/projects"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

func (core *Core) ListProjectRepos(_ context.Context, request *connect.Request[localv1.ListProjectReposRequest]) (*connect.Response[localv1.ListProjectReposResponse], error) {
	if request.Msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	items, err := core.Store.ListRepositories(request.Msg.ProjectId)
	if err != nil {
		return nil, internal(err)
	}
	result := make([]*localv1.ProjectRepo, 0, len(items))
	for _, item := range items {
		result = append(result, repoProto(item))
	}
	return connect.NewResponse(&localv1.ListProjectReposResponse{Repos: result}), nil
}

func repoProto(item projects.Repository) *localv1.ProjectRepo {
	return &localv1.ProjectRepo{Id: item.ID, ProjectId: item.ProjectID, Name: item.Name, LocalPath: item.LocalPath, Remote: item.Remote}
}
