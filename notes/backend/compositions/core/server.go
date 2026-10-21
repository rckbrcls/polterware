package core

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"connectrpc.com/connect"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
	rpc "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1/notesv1connect"
	"github.com/polterware/polterware/notes/backend/platform/token"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/known/durationpb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type Config struct {
	Token, Build, Version, DBPath string
	StartedAt                     time.Time
	Services                      Services
	MCP                           MCP
}
type Server struct {
	config  Config
	http    *http.Server
	mcpHTTP *http.Server
	done    chan error
	ctx     context.Context
	cancel  context.CancelFunc
	mu      sync.Mutex
	active  int
	last    time.Time
}
type actorKey struct{}

func caller(ctx context.Context) actor.Actor {
	a, _ := ctx.Value(actorKey{}).(actor.Actor)
	if a.Raw == "" {
		return actor.UI()
	}
	return a
}

// Start serves Connect on an already bound loopback listener.
func Start(ln net.Listener, cfg Config) (*Server, error) {
	if cfg.Token == "" {
		return nil, errors.New("session token is required")
	}
	address, ok := ln.Addr().(*net.TCPAddr)
	if !ok || !address.IP.Equal(net.IPv4(127, 0, 0, 1)) {
		return nil, errors.New("core requires an IPv4 loopback listener")
	}
	ctx, cancel := context.WithCancel(context.Background())
	if cfg.StartedAt.IsZero() {
		cfg.StartedAt = time.Now().UTC().Truncate(time.Millisecond)
	}
	s := &Server{config: cfg, ctx: ctx, cancel: cancel, done: make(chan error, 1), last: time.Now()}
	mux := http.NewServeMux()
	opts := []connect.HandlerOption{connect.WithInterceptors(serverInterceptor{s: s}), connect.WithReadMaxBytes(8 << 20)}
	mux.Handle(rpc.NewHealthServiceHandler(healthHandler{s: s}, opts...))
	mux.Handle(rpc.NewSpaceServiceHandler(spaceHandler{s: cfg.Services.Spaces}, opts...))
	mux.Handle(rpc.NewNoteServiceHandler(noteHandler{services: cfg.Services}, opts...))
	mux.Handle(rpc.NewTagServiceHandler(tagHandler{s: cfg.Services.Tags}, opts...))
	mux.Handle(rpc.NewFocusServiceHandler(focusHandler{s: cfg.Services.Focus}, opts...))
	mux.Handle(rpc.NewReviewServiceHandler(reviewHandler{s: cfg.Services.Review}, opts...))
	mux.Handle(rpc.NewActivityServiceHandler(activityHandler{s: cfg.Services.Activity}, opts...))
	mux.Handle(rpc.NewSettingsServiceHandler(settingsHandler{s: cfg.Services.Settings}, opts...))
	mux.Handle(rpc.NewSearchServiceHandler(searchHandler{s: cfg.Services.Search}, opts...))
	mux.Handle(rpc.NewAttachmentServiceHandler(attachmentHandler{s: cfg.Services.Attachments}, opts...))
	mux.Handle(rpc.NewPlaceServiceHandler(placeHandler{s: cfg.Services.Places}, opts...))
	mux.Handle(rpc.NewScheduleServiceHandler(scheduleHandler{s: cfg.Services.Schedules}, opts...))
	mux.Handle(rpc.NewReminderServiceHandler(reminderHandler{s: cfg.Services.Reminders}, opts...))
	mux.Handle(rpc.NewMaintenanceServiceHandler(maintenanceHandler{s: cfg.Services.Maintenance}, opts...))
	mux.Handle(rpc.NewChangeServiceHandler(changeHandler{s: s}, opts...))
	if err := s.mountMCP(mux, address.Port); err != nil {
		cancel()
		return nil, err
	}
	mux.Handle(rpc.NewAgentAccessServiceHandler(agentHandler{s: cfg.Services.Agents, port: s.config.MCP.Port}, opts...))
	s.http = &http.Server{Handler: originGuard(ln.Addr().String(), mux), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10, BaseContext: func(net.Listener) context.Context { return ctx }}
	go func() {
		err := s.http.Serve(ln)
		if errors.Is(err, http.ErrServerClosed) {
			err = nil
		}
		s.done <- err
		close(s.done)
	}()
	return s, nil
}
func originGuard(host string, next http.Handler) http.Handler {
	_, port, _ := net.SplitHostPort(host)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != host && r.Host != "localhost:"+port {
			http.Error(w, "invalid core host", http.StatusForbidden)
			return
		}
		if origins, ok := r.Header["Origin"]; ok {
			if len(origins) != 1 {
				http.Error(w, "invalid core origin", http.StatusForbidden)
				return
			}
			u, err := url.Parse(origins[0])
			if err != nil || (u.Scheme != "http" && u.Scheme != "https") || (u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost") || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" {
				http.Error(w, "invalid core origin", http.StatusForbidden)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
func (s *Server) Done() <-chan error { return s.done }

// Shutdown first cancels streams, then drains unary work before provider closure.
func (s *Server) Shutdown(ctx context.Context) error {
	s.cancel()
	var first error
	if s.mcpHTTP != nil {
		if err := s.mcpHTTP.Shutdown(ctx); err != nil {
			_ = s.mcpHTTP.Close()
			first = err
		}
	}
	if err := s.http.Shutdown(ctx); err != nil {
		_ = s.http.Close()
		if first == nil {
			first = err
		}
	}
	return first
}
func (s *Server) Idle(after time.Duration) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.active == 0 && time.Since(s.last) >= after
}
func (s *Server) begin() func() {
	s.mu.Lock()
	s.active++
	s.last = time.Now()
	s.mu.Unlock()
	return func() { s.mu.Lock(); s.active--; s.last = time.Now(); s.mu.Unlock() }
}

type serverInterceptor struct{ s *Server }

func (i serverInterceptor) authorize(header http.Header) error {
	values := header.Values("Authorization")
	if len(values) != 1 || !strings.HasPrefix(values[0], "Bearer ") || !token.Equal(i.s.config.Token, strings.TrimPrefix(values[0], "Bearer ")) {
		return connect.NewError(connect.CodeUnauthenticated, errors.New("invalid or missing session token"))
	}
	return nil
}
func requestActor(header http.Header) actor.Actor {
	name := header.Get("Notes-Client")
	if name == "cli" {
		return actor.CLI()
	}
	if strings.HasPrefix(name, "mcp:") {
		return actor.MCP(strings.TrimPrefix(name, "mcp:"))
	}
	return actor.UI()
}
func (i serverInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (res connect.AnyResponse, err error) {
		if err = i.authorize(req.Header()); err != nil {
			return nil, err
		}
		finish := i.s.begin()
		defer finish()
		defer func() {
			if recover() != nil {
				res = nil
				err = connect.NewError(connect.CodeInternal, errors.New("internal core error"))
			}
			err = mapError(err)
		}()
		if msg, ok := req.Any().(interface{ ProtoReflect() protoreflect.Message }); ok {
			if err := validateTemporal(msg.ProtoReflect()); err != nil {
				return nil, err
			}
		}
		return next(context.WithValue(ctx, actorKey{}, requestActor(req.Header())), req)
	}
}
func validateTemporal(msg protoreflect.Message) error {
	var failure error
	msg.Range(func(field protoreflect.FieldDescriptor, value protoreflect.Value) bool {
		if field.Kind() != protoreflect.MessageKind {
			return true
		}
		check := func(m protoreflect.Message) bool {
			switch v := m.Interface().(type) {
			case *timestamppb.Timestamp:
				if err := v.CheckValid(); err != nil {
					failure = invalid(string(field.Name()), "invalid timestamp")
					return false
				}
			case *durationpb.Duration:
				if err := v.CheckValid(); err != nil {
					failure = invalid(string(field.Name()), "invalid duration")
					return false
				}
			}
			if err := validateTemporal(m); err != nil {
				failure = err
				return false
			}
			return true
		}
		if field.IsList() {
			list := value.List()
			for j := 0; j < list.Len(); j++ {
				if !check(list.Get(j).Message()) {
					return false
				}
			}
			return true
		}
		if field.IsMap() {
			return true
		}
		return check(value.Message())
	})
	return failure
}
func (serverInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}
func (i serverInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		if err := i.authorize(conn.RequestHeader()); err != nil {
			return err
		}
		finish := i.s.begin()
		defer finish()
		return mapError(next(context.WithValue(ctx, actorKey{}, requestActor(conn.RequestHeader())), conn))
	}
}

type healthHandler struct{ s *Server }

func (h healthHandler) Check(ctx context.Context, _ *connect.Request[v1.CheckRequest]) (*connect.Response[v1.CheckResponse], error) {
	cfg := h.s.config
	out := &v1.CheckResponse{Build: cfg.Build, Version: cfg.Version, DbPath: cfg.DBPath, StartedAt: stamp(cfg.StartedAt), Mcp: &v1.McpHealth{Port: int32(cfg.MCP.Port), Enabled: cfg.MCP.Enabled}, Notifier: &v1.NotifierHealth{}}
	if cfg.Services.Reminders != nil {
		status, err := cfg.Services.Reminders.Status(ctx)
		if err != nil {
			return nil, err
		}
		out.Notifier.LastSeenAt = stampPtr(status.NotifierLastSeenAt)
	}
	return response(out, nil)
}

type changeHandler struct{ s *Server }

func (h changeHandler) Watch(ctx context.Context, req *connect.Request[v1.WatchChangesRequest], stream *connect.ServerStream[v1.WatchChangesResponse]) error {
	if req.Msg.SinceSeq < 0 {
		return invalid("since_seq", "must be nonnegative")
	}
	if h.s.config.Services.Changes == nil {
		return unavailable("change feed")
	}
	sub, err := h.s.config.Services.Changes.Subscribe(ctx, req.Msg.SinceSeq)
	if err != nil {
		return err
	}
	defer sub.Close()
	if err := stream.Send(&v1.WatchChangesResponse{Seq: sub.Snapshot, Snapshot: true}); err != nil {
		return err
	}
	last := req.Msg.SinceSeq
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-h.s.ctx.Done():
			return connect.NewError(connect.CodeUnavailable, errors.New("core is shutting down"))
		case event, ok := <-sub.Events:
			if !ok {
				if sub.Err != nil {
					if err := sub.Err(); err != nil {
						return err
					}
				}
				return unavailable("change feed closed")
			}
			if event.Seq <= last {
				return errors.New("change feed returned out-of-order event")
			}
			last = event.Seq
			msg := &v1.WatchChangesResponse{Seq: event.Seq}
			for _, change := range event.Changes {
				msg.Changes = append(msg.Changes, &v1.Change{Entity: change.Entity, Id: change.ID, Op: change.Op})
			}
			if err := stream.Send(msg); err != nil {
				return err
			}
		}
	}
}
