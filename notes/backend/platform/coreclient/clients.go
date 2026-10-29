// Package coreclient discovers and connects to the authenticated local core.
package coreclient

import (
	"connectrpc.com/connect"
	"context"
	"fmt"
	rpc "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1/notesv1connect"
	"github.com/polterware/polterware/notes/backend/platform/listen"
	"github.com/polterware/polterware/notes/backend/platform/runstate"
	"net/http"
)

const ClientHeader = "Notes-Client"

type Clients struct {
	Health      rpc.HealthServiceClient
	Space       rpc.SpaceServiceClient
	Note        rpc.NoteServiceClient
	Tag         rpc.TagServiceClient
	Focus       rpc.FocusServiceClient
	Review      rpc.ReviewServiceClient
	Activity    rpc.ActivityServiceClient
	Settings    rpc.SettingsServiceClient
	SavedFilter rpc.SavedFilterServiceClient
	Search      rpc.SearchServiceClient
	Attachment  rpc.AttachmentServiceClient
	Place       rpc.PlaceServiceClient
	Schedule    rpc.ScheduleServiceClient
	Reminder    rpc.ReminderServiceClient
	AgentAccess rpc.AgentAccessServiceClient
	Maintenance rpc.MaintenanceServiceClient
	Change      rpc.ChangeServiceClient
}

func New(state runstate.Core, client string) (Clients, error) {
	return NewWithHTTP(state, client, &http.Client{})
}
func NewWithHTTP(state runstate.Core, client string, httpClient connect.HTTPClient) (Clients, error) {
	if err := listen.ValidateEndpoint(state.Endpoint); err != nil {
		return Clients{}, err
	}
	if state.Token == "" {
		return Clients{}, fmt.Errorf("core session token is missing")
	}
	options := connect.WithInterceptors(headers{token: state.Token, client: client})
	return Clients{
		Health:      rpc.NewHealthServiceClient(httpClient, state.Endpoint, options),
		Space:       rpc.NewSpaceServiceClient(httpClient, state.Endpoint, options),
		Note:        rpc.NewNoteServiceClient(httpClient, state.Endpoint, options),
		Tag:         rpc.NewTagServiceClient(httpClient, state.Endpoint, options),
		Focus:       rpc.NewFocusServiceClient(httpClient, state.Endpoint, options),
		Review:      rpc.NewReviewServiceClient(httpClient, state.Endpoint, options),
		Activity:    rpc.NewActivityServiceClient(httpClient, state.Endpoint, options),
		Settings:    rpc.NewSettingsServiceClient(httpClient, state.Endpoint, options),
		SavedFilter: rpc.NewSavedFilterServiceClient(httpClient, state.Endpoint, options),
		Search:      rpc.NewSearchServiceClient(httpClient, state.Endpoint, options),
		Attachment:  rpc.NewAttachmentServiceClient(httpClient, state.Endpoint, options),
		Place:       rpc.NewPlaceServiceClient(httpClient, state.Endpoint, options),
		Schedule:    rpc.NewScheduleServiceClient(httpClient, state.Endpoint, options),
		Reminder:    rpc.NewReminderServiceClient(httpClient, state.Endpoint, options),
		AgentAccess: rpc.NewAgentAccessServiceClient(httpClient, state.Endpoint, options),
		Maintenance: rpc.NewMaintenanceServiceClient(httpClient, state.Endpoint, options),
		Change:      rpc.NewChangeServiceClient(httpClient, state.Endpoint, options),
	}, nil
}

type headers struct{ token, client string }

func (h headers) set(header http.Header) {
	header.Set("Authorization", "Bearer "+h.token)
	header.Set(ClientHeader, h.client)
}
func (h headers) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		h.set(req.Header())
		return next(ctx, req)
	}
}
func (h headers) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return func(ctx context.Context, spec connect.Spec) connect.StreamingClientConn {
		conn := next(ctx, spec)
		h.set(conn.RequestHeader())
		return conn
	}
}
func (headers) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return next
}
