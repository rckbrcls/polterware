package localcore

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"

	"connectrpc.com/connect"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/agentrun"
	"github.com/polterware/polterware/backend/domains/integrations"
	"github.com/polterware/polterware/backend/domains/knowledge"
	"github.com/polterware/polterware/backend/domains/projects"
	dbsqlite "github.com/polterware/polterware/backend/platform/db/sqlite"
	"github.com/polterware/polterware/backend/platform/events"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	"github.com/polterware/polterware/backend/platform/gen/polterware/local/v1/localv1connect"
	"github.com/polterware/polterware/backend/providers/mcp"
	"github.com/polterware/polterware/backend/providers/seed"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
	terminalpkg "github.com/polterware/polterware/backend/providers/terminal"
)

type Core struct {
	Store        *storepkg.Store
	Token        string
	Started      time.Time
	Terminals    *terminalpkg.Manager
	terminalOnce sync.Once

	// Build identifies the core binary (coreclient.BuildID).
	Build string
	// DBDir is the database directory; agent setup keeps its local marketplace there.
	DBDir string
	// Bus turns committed SQLite writes into change events (Verdict 0007).
	Bus *events.Bus
	// MCP serves MCP sessions over HTTP at /mcp.
	MCP *mcp.Sessions

	life     lifecycle
	calls    inflight
	sessions agentSessions
}

// NewCore wires the core around the only open store of this database. It
// installs the change recorder, so every committed write becomes an event.
func NewCore(store *storepkg.Store, token string) *Core {
	_ = seed.Defaults(store)
	core := &Core{
		Store:   store,
		Token:   token,
		Started: time.Now().UTC(),
		Bus:     events.NewBus(),
		MCP:     mcp.NewSessions(store),
		life:    lifecycle{done: make(chan struct{})},
	}
	core.touch()
	dbsqlite.SetChangeRecorder(func(tables, projectIDs []string) {
		core.Bus.Record(tables, projectIDs, core.calls.clients())
	})
	return core
}

func MintToken() (string, error) {
	var value [32]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(value[:]), nil
}

func Listen(address string) (net.Listener, string, error) {
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return nil, "", err
	}
	return listener, "http://" + listener.Addr().String(), nil
}

func ServeConnect(listener net.Listener, core *Core) *http.Server {
	mux := http.NewServeMux()
	auth := interceptor{core: core}
	options := []connect.HandlerOption{connect.WithInterceptors(auth)}
	register := func(path string, handler http.Handler) { mux.Handle(path, handler) }
	path, handler := localv1connect.NewHealthServiceHandler(core)
	register(path, handler)
	path, handler = localv1connect.NewProjectServiceHandler(core, options...)
	register(path, handler)
	path, handler = localv1connect.NewArchitectureServiceHandler(core, options...)
	register(path, handler)
	path, handler = localv1connect.NewKnowledgeServiceHandler(core, options...)
	register(path, handler)
	path, handler = localv1connect.NewWorkServiceHandler(core, options...)
	register(path, handler)
	path, handler = localv1connect.NewProjectModelServiceHandler(core, options...)
	register(path, handler)
	path, handler = localv1connect.NewContextServiceHandler(core, options...)
	register(path, handler)
	path, handler = localv1connect.NewAgentRunServiceHandler(core, options...)
	register(path, handler)
	path, handler = localv1connect.NewIntegrationServiceHandler(core, options...)
	register(path, handler)
	path, handler = localv1connect.NewTerminalServiceHandler(core, options...)
	register(path, handler)
	path, handler = localv1connect.NewMaintenanceServiceHandler(core, options...)
	register(path, handler)
	path, handler = localv1connect.NewChangeServiceHandler(core, options...)
	register(path, handler)
	register("/mcp", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := auth.authorize(r.Header); err != nil {
			http.Error(w, "invalid or missing session token", http.StatusUnauthorized)
			return
		}
		defer core.calls.begin("mcp")()
		core.MCP.ServeHTTP(w, r)
	}))

	server := &http.Server{Handler: h2c.NewHandler(mux, &http2.Server{})}
	go func() { _ = server.Serve(listener) }()
	return server
}

func (core *Core) ListProjects(_ context.Context, request *connect.Request[localv1.ListProjectsRequest]) (*connect.Response[localv1.ListProjectsResponse], error) {
	items, err := core.Store.ListProjects(request.Msg.GetIncludeArchived())
	if err != nil {
		return nil, internal(err)
	}
	result := make([]*localv1.Project, 0, len(items))
	for _, item := range items {
		result = append(result, projectProto(item))
	}
	return connect.NewResponse(&localv1.ListProjectsResponse{Projects: result}), nil
}

func (core *Core) SaveProject(_ context.Context, request *connect.Request[localv1.SaveProjectRequest]) (*connect.Response[localv1.SaveProjectResponse], error) {
	item := request.Msg.GetProject()
	if item == nil {
		return nil, invalid("project is required")
	}
	project, err := projects.NewProject(item.Id, item.Name, item.RootPath)
	if err != nil {
		return nil, invalid(err.Error())
	}
	if err := core.Store.SaveProject(project); err != nil {
		return nil, internal(err)
	}
	if _, err := core.Store.GetLayout(project.ID); err != nil {
		if _, err := core.Store.UpdateLayout(project.ID, 0, `{"nodes":[],"edges":[]}`); err != nil {
			return nil, internal(err)
		}
	}
	if _, err := core.Store.GetProjectSettings(project.ID); err != nil {
		if err := core.Store.SaveProjectSettings(projects.Settings{ProjectID: project.ID}); err != nil {
			return nil, internal(err)
		}
	}
	return connect.NewResponse(&localv1.SaveProjectResponse{Project: projectProto(project)}), nil
}

func (core *Core) ArchiveProject(_ context.Context, request *connect.Request[localv1.ArchiveProjectRequest]) (*connect.Response[localv1.ArchiveProjectResponse], error) {
	if request.Msg.Id == "" {
		return nil, invalid("project id is required")
	}
	project, err := core.Store.ArchiveProject(request.Msg.Id)
	if err != nil {
		return nil, internal(err)
	}
	return connect.NewResponse(&localv1.ArchiveProjectResponse{Project: projectProto(project)}), nil
}

func (core *Core) ListEnvironments(_ context.Context, request *connect.Request[localv1.ListEnvironmentsRequest]) (*connect.Response[localv1.ListEnvironmentsResponse], error) {
	items, err := core.Store.ListEnvironments(request.Msg.ProjectId)
	if err != nil {
		return nil, internal(err)
	}
	result := make([]*localv1.Environment, 0, len(items))
	for _, item := range items {
		result = append(result, environmentProto(item))
	}
	return connect.NewResponse(&localv1.ListEnvironmentsResponse{Environments: result}), nil
}

func (core *Core) SaveEnvironment(_ context.Context, request *connect.Request[localv1.SaveEnvironmentRequest]) (*connect.Response[localv1.SaveEnvironmentResponse], error) {
	item := request.Msg.GetEnvironment()
	if item == nil {
		return nil, invalid("environment is required")
	}
	environment, err := projects.NewEnvironment(item.Id, item.ProjectId, item.Name, item.Kind)
	if err != nil {
		return nil, invalid(err.Error())
	}
	environment.Protection = item.Protection
	environment.IsDefault = item.IsDefault
	environment.Description = item.Description
	if err := core.Store.SaveEnvironment(environment); err != nil {
		return nil, internal(err)
	}
	return connect.NewResponse(&localv1.SaveEnvironmentResponse{Environment: environmentProto(environment)}), nil
}

func (core *Core) DeleteEnvironment(_ context.Context, request *connect.Request[localv1.DeleteEnvironmentRequest]) (*connect.Response[localv1.DeleteEnvironmentResponse], error) {
	if request.Msg.Id == "" || request.Msg.ProjectId == "" {
		return nil, invalid("environment id and project id are required")
	}
	if err := core.Store.DeleteEnvironment(request.Msg.Id, request.Msg.ProjectId); err != nil {
		return nil, invalid(err.Error())
	}
	return connect.NewResponse(&localv1.DeleteEnvironmentResponse{}), nil
}

func (core *Core) GetLayout(_ context.Context, request *connect.Request[localv1.GetLayoutRequest]) (*connect.Response[localv1.GetLayoutResponse], error) {
	item, err := core.Store.GetLayout(request.Msg.ProjectId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound, err)
	}
	return connect.NewResponse(&localv1.GetLayoutResponse{Layout: &localv1.Layout{Id: item.ID, ProjectId: item.ProjectID, Revision: item.Revision, BodyJson: item.BodyJSON}}), nil
}

func (core *Core) UpdateLayout(_ context.Context, request *connect.Request[localv1.UpdateLayoutRequest]) (*connect.Response[localv1.UpdateLayoutResponse], error) {
	item, err := core.Store.UpdateLayout(request.Msg.ProjectId, request.Msg.ExpectedRevision, request.Msg.BodyJson)
	if err != nil {
		return nil, connect.NewError(connect.CodeFailedPrecondition, err)
	}
	return connect.NewResponse(&localv1.UpdateLayoutResponse{Layout: &localv1.Layout{Id: item.ID, ProjectId: item.ProjectID, Revision: item.Revision, BodyJson: item.BodyJSON}}), nil
}

func (core *Core) SaveKnowledge(_ context.Context, request *connect.Request[localv1.SaveKnowledgeRequest]) (*connect.Response[localv1.SaveKnowledgeResponse], error) {
	item := request.Msg.GetItem()
	if item == nil {
		return nil, invalid("knowledge item is required")
	}
	env, err := changeEnvelopeFromProto(request.Msg.GetChange())
	if err != nil {
		return nil, mapAuditedErr(err)
	}
	env.ProjectID = item.ProjectId
	created, err := knowledge.NewItem(item.Id, item.ProjectId, item.Title, item.Body, item.Kind, item.Tags)
	if err != nil {
		return nil, invalid(err.Error())
	}
	created.Summary = item.Summary
	created.Owner = item.Owner
	if created.Owner == "" {
		created.Owner = agentrun.ActorHuman
	}
	created.Status = item.Status
	created.ExtraJSON = item.ExtraJson
	result, err := wedge.ExecuteAuditedWrite(
		core.Store,
		env,
		agentrun.ActorKindHuman,
		"desktop.knowledge.save",
		func(run agentrun.Run) ([]string, any, error) {
			_ = run
			if err := core.Store.SaveKnowledge(created); err != nil {
				return nil, nil, err
			}
			return []string{created.ID}, created, nil
		},
	)
	if err != nil {
		return nil, mapAuditedErr(err)
	}
	_ = result
	return connect.NewResponse(&localv1.SaveKnowledgeResponse{Item: knowledgeProto(created)}), nil
}

func (core *Core) ListKnowledge(_ context.Context, request *connect.Request[localv1.ListKnowledgeRequest]) (*connect.Response[localv1.ListKnowledgeResponse], error) {
	items, err := core.Store.ListKnowledge(request.Msg.ProjectId, request.Msg.Kind)
	if err != nil {
		return nil, internal(err)
	}
	resolved, err := wedge.LoadNodeScope(core.Store, request.Msg.ProjectId, request.Msg.ScopeNode, request.Msg.ScopeExact)
	if err != nil {
		return nil, invalid(err.Error())
	}
	scopes, err := core.Store.ScopeMap(request.Msg.ProjectId, storepkg.ScopeDecision)
	if err != nil {
		return nil, internal(err)
	}
	result := make([]*localv1.KnowledgeItem, 0, len(items))
	for _, item := range items {
		if !resolved.Matches(scopes[item.ID]) {
			continue
		}
		msg := knowledgeProto(item)
		msg.ScopeNodeId = scopes[item.ID]
		result = append(result, msg)
	}
	return connect.NewResponse(&localv1.ListKnowledgeResponse{Items: result}), nil
}

func (core *Core) DeleteKnowledge(_ context.Context, request *connect.Request[localv1.DeleteKnowledgeRequest]) (*connect.Response[localv1.DeleteKnowledgeResponse], error) {
	if request.Msg.Id == "" {
		return nil, invalid("knowledge id is required")
	}
	env, err := changeEnvelopeFromProto(request.Msg.GetChange())
	if err != nil {
		return nil, mapAuditedErr(err)
	}
	existing, err := core.Store.GetKnowledge(request.Msg.Id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("unknown knowledge item"))
	}
	if err != nil {
		return nil, internal(err)
	}
	env.ProjectID = existing.ProjectID
	_, err = wedge.ExecuteAuditedWrite(
		core.Store,
		env,
		agentrun.ActorKindHuman,
		"desktop.knowledge.delete",
		func(run agentrun.Run) ([]string, any, error) {
			_ = run
			if err := core.Store.DeleteKnowledge(request.Msg.Id); err != nil {
				return nil, nil, err
			}
			return []string{request.Msg.Id}, nil, nil
		},
	)
	if err != nil {
		return nil, mapAuditedErr(err)
	}
	return connect.NewResponse(&localv1.DeleteKnowledgeResponse{}), nil
}

func (core *Core) ListCliProviders(context.Context, *connect.Request[localv1.ListCliProvidersRequest]) (*connect.Response[localv1.ListCliProvidersResponse], error) {
	items := make([]*localv1.CliProvider, 0, len(integrations.CLIProviders))
	for _, item := range integrations.CLIProviders {
		items = append(items, &localv1.CliProvider{Id: item.ID, Name: item.Name, Binary: item.Binary, AuthCommands: item.AuthCommands, Description: item.Description, Category: item.Category})
	}
	return connect.NewResponse(&localv1.ListCliProvidersResponse{Providers: items}), nil
}

func (core *Core) ListIntegrationConnections(_ context.Context, request *connect.Request[localv1.ListIntegrationConnectionsRequest]) (*connect.Response[localv1.ListIntegrationConnectionsResponse], error) {
	items, err := core.Store.ListConnections(request.Msg.ProjectId)
	if err != nil {
		return nil, internal(err)
	}
	result := make([]*localv1.IntegrationConnection, 0, len(items))
	for _, item := range items {
		result = append(result, connectionProto(item))
	}
	return connect.NewResponse(&localv1.ListIntegrationConnectionsResponse{Connections: result}), nil
}

func (core *Core) SaveIntegrationConnection(_ context.Context, request *connect.Request[localv1.SaveIntegrationConnectionRequest]) (*connect.Response[localv1.SaveIntegrationConnectionResponse], error) {
	item := request.Msg.GetConnection()
	if item == nil {
		return nil, invalid("connection is required")
	}
	connection := integrations.Connection{ID: item.Id, ProjectID: item.ProjectId, ProviderID: item.ProviderId, Status: item.Status, Label: item.Label, EnvironmentID: item.EnvironmentId, LastSyncAt: item.LastSyncAt, Summary: item.Summary, CLICommand: item.CliCommand, SyncInterval: item.SyncInterval, Freshness: item.Freshness, ErrorMessage: item.ErrorMessage}
	if connection.ID == "" || connection.ProjectID == "" || connection.ProviderID == "" {
		return nil, invalid("connection id, project id, and provider id are required")
	}
	if err := core.Store.SaveConnection(connection); err != nil {
		return nil, internal(err)
	}
	return connect.NewResponse(&localv1.SaveIntegrationConnectionResponse{Connection: connectionProto(connection)}), nil
}

func (core *Core) ResetLocalStore(context.Context, *connect.Request[localv1.ResetLocalStoreRequest]) (*connect.Response[localv1.ResetLocalStoreResponse], error) {
	if err := core.Store.Reset(); err != nil {
		return nil, internal(err)
	}
	if err := seed.Defaults(core.Store); err != nil {
		return nil, internal(err)
	}
	return connect.NewResponse(&localv1.ResetLocalStoreResponse{Status: "reset"}), nil
}

func (core *Core) GetStoreHealth(context.Context, *connect.Request[localv1.GetStoreHealthRequest]) (*connect.Response[localv1.GetStoreHealthResponse], error) {
	quarantined, message, err := core.Store.StoreHealth()
	if err != nil {
		return nil, internal(err)
	}
	return connect.NewResponse(&localv1.GetStoreHealthResponse{Quarantined: quarantined, Message: message}), nil
}

func projectProto(item projects.Project) *localv1.Project {
	archivedAt := ""
	if !item.ArchivedAt.IsZero() {
		archivedAt = item.ArchivedAt.Format(time.RFC3339)
	}
	status := item.Status
	if status == "" {
		status = projects.StatusActive
	}
	return &localv1.Project{
		Id:         item.ID,
		Name:       item.Name,
		RootPath:   item.RootPath,
		CreatedAt:  item.CreatedAt.Format(time.RFC3339),
		UpdatedAt:  item.UpdatedAt.Format(time.RFC3339),
		Status:     status,
		ArchivedAt: archivedAt,
	}
}
func environmentProto(item projects.Environment) *localv1.Environment {
	return &localv1.Environment{Id: item.ID, ProjectId: item.ProjectID, Name: item.Name, Kind: item.Kind, Protection: item.Protection, IsDefault: item.IsDefault, Description: item.Description}
}
func knowledgeProto(item knowledge.Item) *localv1.KnowledgeItem {
	return &localv1.KnowledgeItem{Id: item.ID, ProjectId: item.ProjectID, Title: item.Title, Body: item.Body, Kind: item.Kind, Tags: item.Tags, Summary: item.Summary, Owner: item.Owner, Status: item.Status, ExtraJson: item.ExtraJSON, CreatedAt: item.CreatedAt.Format(time.RFC3339), UpdatedAt: item.UpdatedAt.Format(time.RFC3339)}
}
func connectionProto(item integrations.Connection) *localv1.IntegrationConnection {
	return &localv1.IntegrationConnection{Id: item.ID, ProjectId: item.ProjectID, ProviderId: item.ProviderID, Status: item.Status, Label: item.Label, EnvironmentId: item.EnvironmentID, LastSyncAt: item.LastSyncAt, Summary: item.Summary, CliCommand: item.CLICommand, SyncInterval: item.SyncInterval, Freshness: item.Freshness, ErrorMessage: item.ErrorMessage}
}
func invalid(message string) error {
	return connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("%s", message))
}
func internal(err error) error { return connect.NewError(connect.CodeInternal, err) }
