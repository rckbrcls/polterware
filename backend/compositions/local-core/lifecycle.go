package localcore

import (
	"context"
	"crypto/subtle"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/platform/coreclient"
	"github.com/polterware/polterware/backend/platform/events"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

// lifecycle tracks what keeps the daemon alive (Verdict 0007): recent requests
// (MCP calls included) and open change streams. The MCP bridge re-initializes
// transparently when an idle core exited, so MCP sessions do not pin it.
type lifecycle struct {
	lastActive atomic.Int64
	streams    atomic.Int32
	done       chan struct{}
	stopOnce   sync.Once
}

func (core *Core) touch() { core.life.lastActive.Store(time.Now().UnixNano()) }

// Done closes when the core was asked to stop.
func (core *Core) Done() <-chan struct{} { return core.life.done }

// Stop asks the core to shut down; runServe owns the actual exit.
func (core *Core) Stop() { core.life.stopOnce.Do(func() { close(core.life.done) }) }

// Idle reports whether nothing used the core for at least after.
func (core *Core) Idle(after time.Duration) bool {
	if core.life.streams.Load() > 0 {
		return false
	}
	return time.Since(time.Unix(0, core.life.lastActive.Load())) >= after
}

// inflight counts calls in progress per client, so a commit can be traced to
// the client that caused it (change event origins).
type inflight struct {
	mu     sync.Mutex
	counts map[string]int
}

func (f *inflight) begin(client string) func() {
	f.mu.Lock()
	if f.counts == nil {
		f.counts = map[string]int{}
	}
	f.counts[client]++
	f.mu.Unlock()
	return func() {
		f.mu.Lock()
		if f.counts[client]--; f.counts[client] <= 0 {
			delete(f.counts, client)
		}
		f.mu.Unlock()
	}
}

// clients lists clients with calls in flight, or "core" for background work.
func (f *inflight) clients() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.counts) == 0 {
		return []string{"core"}
	}
	out := make([]string, 0, len(f.counts))
	for client := range f.counts {
		out = append(out, client)
	}
	return out
}

// clientOf names the calling client from the Polterware-Client header. The
// Desktop predates the header, so it is the default.
func clientOf(header http.Header) string {
	if client := strings.TrimSpace(header.Get(coreclient.ClientHeader)); client != "" {
		return client
	}
	return "desktop"
}

// interceptor authenticates every unary and streaming call with the session
// token and records activity for idle exit.
type interceptor struct{ core *Core }

func (i interceptor) authorize(header http.Header) error {
	value := header.Get("Authorization")
	candidate := strings.TrimPrefix(value, "Bearer ")
	if !strings.HasPrefix(value, "Bearer ") || subtle.ConstantTimeCompare([]byte(candidate), []byte(i.core.Token)) != 1 {
		return connect.NewError(connect.CodeUnauthenticated, fmt.Errorf("invalid or missing session token"))
	}
	i.core.touch()
	return nil
}

func (i interceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, request connect.AnyRequest) (connect.AnyResponse, error) {
		if err := i.authorize(request.Header()); err != nil {
			return nil, err
		}
		defer i.core.calls.begin(clientOf(request.Header()))()
		return next(ctx, request)
	}
}

func (i interceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (i interceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		if err := i.authorize(conn.RequestHeader()); err != nil {
			return err
		}
		return next(ctx, conn)
	}
}

func (core *Core) Check(context.Context, *connect.Request[localv1.CheckRequest]) (*connect.Response[localv1.CheckResponse], error) {
	return connect.NewResponse(&localv1.CheckResponse{
		Status:    "ok",
		Version:   "0.1.0",
		UptimeSec: time.Since(core.Started).Seconds(),
		Build:     core.Build,
		Pid:       int32(os.Getpid()),
	}), nil
}

func (core *Core) Shutdown(context.Context, *connect.Request[localv1.ShutdownRequest]) (*connect.Response[localv1.ShutdownResponse], error) {
	// Let the response reach the caller before the server stops.
	time.AfterFunc(100*time.Millisecond, core.Stop)
	return connect.NewResponse(&localv1.ShutdownResponse{}), nil
}

// WatchChanges streams change events until the client leaves or the core stops.
func (core *Core) WatchChanges(ctx context.Context, request *connect.Request[localv1.WatchChangesRequest], stream *connect.ServerStream[localv1.WatchChangesResponse]) error {
	core.life.streams.Add(1)
	defer func() {
		core.life.streams.Add(-1)
		core.touch()
	}()
	current, backlog, resync, changes, cancel := core.Bus.Subscribe(request.Msg.GetAfterSeq())
	defer cancel()
	if err := stream.Send(&localv1.WatchChangesResponse{Seq: current, Resync: resync, At: time.Now().UTC().Format(time.RFC3339Nano)}); err != nil {
		return err
	}
	for _, change := range backlog {
		if err := stream.Send(changeProto(change)); err != nil {
			return err
		}
	}
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-core.Done():
			return nil
		case change := <-changes:
			if err := stream.Send(changeProto(change)); err != nil {
				return err
			}
		}
	}
}

func changeProto(change events.Change) *localv1.WatchChangesResponse {
	return &localv1.WatchChangesResponse{
		Seq:        change.Seq,
		ProjectIds: change.ProjectIDs,
		Kinds:      change.Kinds,
		Origins:    change.Origins,
		Resync:     change.Resync,
		At:         change.At.Format(time.RFC3339Nano),
	}
}

// agentSessions holds one SessionRuns per agent session id (a Claude Code
// session), replacing the per-session state files the CLI used to write.
type agentSessions struct {
	mu   sync.Mutex
	runs map[string]*wedge.SessionRuns
}

// apply runs fn with the session's runs; applies are serialized per core.
func (s *agentSessions) apply(id, label string, fn func(*wedge.SessionRuns) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.runs == nil {
		s.runs = map[string]*wedge.SessionRuns{}
	}
	session := s.runs[id]
	if session == nil {
		session = &wedge.SessionRuns{}
		s.runs[id] = session
	}
	if label != "" {
		session.Label = label
	}
	return fn(session)
}

// end removes the session and returns it for closing.
func (s *agentSessions) end(id string) *wedge.SessionRuns {
	s.mu.Lock()
	defer s.mu.Unlock()
	session := s.runs[id]
	delete(s.runs, id)
	return session
}
