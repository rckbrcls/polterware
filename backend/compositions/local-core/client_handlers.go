package localcore

import (
	"context"
	"errors"
	"time"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/compositions/wedge"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

// ResolveProject serves CLI project resolution: an explicit id, or the
// registered project whose root contains the caller's directory.
func (core *Core) ResolveProject(_ context.Context, request *connect.Request[localv1.ResolveProjectRequest]) (*connect.Response[localv1.ResolveProjectResponse], error) {
	project, err := wedge.ResolveProject(core.Store, request.Msg.Id, request.Msg.Dir)
	if errors.Is(err, wedge.ErrNoProject) {
		return nil, connect.NewError(connect.CodeNotFound, err)
	}
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound, err)
	}
	return connect.NewResponse(&localv1.ResolveProjectResponse{Project: projectProto(project)}), nil
}

// InitProject registers a project; dir is optional and must be absolute (the
// client resolves it against its own working directory).
func (core *Core) InitProject(_ context.Context, request *connect.Request[localv1.InitProjectRequest]) (*connect.Response[localv1.InitProjectResponse], error) {
	project, err := wedge.InitProject(core.Store, wedge.InitInput{
		ID:   request.Msg.Id,
		Name: request.Msg.Name,
		Dir:  request.Msg.Dir,
	})
	if err != nil {
		return nil, invalid(err.Error())
	}
	return connect.NewResponse(&localv1.InitProjectResponse{Project: projectProto(project)}), nil
}

// ListMcpSessions lists MCP clients connected to this core.
func (core *Core) ListMcpSessions(context.Context, *connect.Request[localv1.ListMcpSessionsRequest]) (*connect.Response[localv1.ListMcpSessionsResponse], error) {
	sessions := core.MCP.List()
	out := make([]*localv1.McpSession, 0, len(sessions))
	for _, s := range sessions {
		out = append(out, &localv1.McpSession{
			Id:            s.ID,
			ClientName:    s.ClientName,
			ClientVersion: s.ClientVersion,
			StartedAt:     s.StartedAt.Format(time.RFC3339),
			LastSeenAt:    s.LastSeen.Format(time.RFC3339),
		})
	}
	return connect.NewResponse(&localv1.ListMcpSessionsResponse{Sessions: out}), nil
}
