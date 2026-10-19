package core

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/place"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
	"github.com/polterware/polterware/notes/backend/domains/settings"
	"github.com/polterware/polterware/notes/backend/platform/listen"
	"github.com/polterware/polterware/notes/backend/providers/mcp"
)

// mcpHandler keeps the live authorization source with the mounted provider.
type mcpHandler struct {
	http.Handler
	currentToken func() (string, error)
}

func (h mcpHandler) guard(token string, port int) (func(http.Handler) http.Handler, error) {
	if h.currentToken != nil {
		return mcp.NewLiveGuard(h.currentToken, port, mcp.MaxBodyBytes)
	}
	return mcp.NewGuard(token, port, mcp.MaxBodyBytes)
}

// mcpPlaces supplies the session actor to the unchanged Place domain port.
type mcpPlaces struct{ place.Service }

func (p mcpPlaces) Set(ctx context.Context, who actor.Actor, in place.Place) (place.Place, error) {
	return p.Service.Set(context.WithValue(ctx, actorKey{}, who), in, 0)
}
func (p mcpPlaces) Clear(ctx context.Context, who actor.Actor, id string) error {
	return p.Service.Clear(context.WithValue(ctx, actorKey{}, who), id, 0)
}

type mcpSchedules struct{ ScheduleUseCases }

func (s mcpSchedules) ListOccurrences(ctx context.Context, from, to time.Time, spaceID *string, includeCompleted bool, limit int) ([]schedule.Occurrence, error) {
	return s.ScheduleUseCases.ListOccurrences(ctx, OccurrenceQuery{From: from, To: to, SpaceID: spaceID, IncludeCompleted: includeCompleted, Limit: limit})
}

func (s mcpSchedules) Set(ctx context.Context, who actor.Actor, in schedule.Schedule) (schedule.Schedule, error) {
	return s.ScheduleUseCases.Set(ctx, who, in)
}

func (s mcpSchedules) Clear(ctx context.Context, who actor.Actor, noteID string) error {
	return s.ScheduleUseCases.Clear(ctx, who, noteID)
}

func (s mcpSchedules) Preview(ctx context.Context, in schedule.Schedule, limit int) ([]time.Time, string, error) {
	return s.ScheduleUseCases.Preview(ctx, in, limit)
}

func bindMCP(services Services, token string, port int, enabled bool, version string) (MCP, error) {
	if token == "" {
		return MCP{Port: port, Enabled: enabled}, nil
	}
	deps := mcp.Deps{
		WithActor: func(ctx context.Context, who actor.Actor) context.Context {
			return context.WithValue(ctx, actorKey{}, who)
		},
		Version: version, Notes: services.Notes, Spaces: services.Spaces, Tags: services.Tags,
		Activity: services.Activity, Review: services.Review, Search: services.Search,
		Attachments: services.Attachments, Settings: services.Settings,
	}
	var currentToken func() (string, error)
	if agents, ok := services.Agents.(agentService); ok {
		currentToken = agents.currentToken
		if agents.audit.Transactions != nil {
			deps.Within = agents.audit.Transactions.Within
		}
	}
	if services.Places != nil {
		deps.Places = mcpPlaces{services.Places}
	}
	if services.ScheduleReader != nil {
		deps.GetSchedule = services.ScheduleReader.Get
	}
	if services.PlaceReader != nil {
		deps.GetPlace = services.PlaceReader.Get
	}
	if services.Schedules != nil {
		deps.Schedules = mcpSchedules{services.Schedules}
	}
	srv, err := mcp.New(deps)
	if err != nil {
		return MCP{}, err
	}
	return MCP{Handler: mcpHandler{srv.Handler(), currentToken}, Token: token, Port: port, Enabled: enabled}, nil
}

func (s *Server) mountMCP(connectMux *http.ServeMux, connectPort int) error {
	if s.config.MCP.Handler == nil {
		return nil
	}
	if s.config.MCP.Token == "" {
		return fmt.Errorf("MCP token is required")
	}
	guard := func(port int) (func(http.Handler) http.Handler, error) {
		if h, ok := s.config.MCP.Handler.(mcpHandler); ok {
			return h.guard(s.config.MCP.Token, port)
		}
		return mcp.NewGuard(s.config.MCP.Token, port, mcp.MaxBodyBytes)
	}
	port := s.config.MCP.Port
	if port < 1 || port > 65535 {
		port = settings.DefaultMCPPort
	}
	ln, _, err := listen.Open(fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		ln, _, err = listen.Open("127.0.0.1:0")
	}
	if err != nil {
		wrap, gerr := guard(connectPort)
		if gerr != nil {
			return gerr
		}
		connectMux.Handle("/mcp", wrap(s.config.MCP.Handler))
		s.config.MCP.Port = connectPort
		return nil
	}
	actual := ln.Addr().(*net.TCPAddr).Port
	wrap, err := guard(actual)
	if err != nil {
		_ = ln.Close()
		return err
	}
	mux := http.NewServeMux()
	mux.Handle("/mcp", wrap(s.config.MCP.Handler))
	s.mcpHTTP = &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10, BaseContext: func(net.Listener) context.Context { return s.ctx }}
	s.config.MCP.Port = actual
	go func() { _ = s.mcpHTTP.Serve(ln) }()
	return nil
}
