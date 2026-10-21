package core

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/platform/coreclient"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
	rpc "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1/notesv1connect"
	"github.com/polterware/polterware/notes/backend/platform/listen"
	"github.com/polterware/polterware/notes/backend/platform/runstate"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func testHTTP() *http.Client {
	return &http.Client{Transport: &http.Transport{DisableKeepAlives: true}}
}

func loopback(t *testing.T, services Services) (coreclient.Clients, runstate.Core, *Server) {
	t.Helper()
	ln, endpoint, err := listen.Open("127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	state := runstate.Core{Endpoint: endpoint, Token: "test-session", Build: "123-456", DBPath: filepath.Join(t.TempDir(), "notes.db")}
	s, err := Start(ln, Config{Token: state.Token, Build: state.Build, DBPath: state.DBPath, Version: "test", Services: services})
	if err != nil {
		ln.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := s.Shutdown(ctx); err != nil {
			t.Error(err)
		}
	})
	clients, err := coreclient.NewWithHTTP(state, "cli", testHTTP())
	if err != nil {
		t.Fatal(err)
	}
	return clients, state, s
}

func TestEveryRPCIsMountedAndAuthenticated(t *testing.T) {
	_, state, _ := loopback(t, Services{})
	count := 0
	protoregistry.GlobalFiles.RangeFiles(func(file protoreflect.FileDescriptor) bool {
		if !strings.HasPrefix(file.Path(), "notes/v1/") {
			return true
		}
		for i := 0; i < file.Services().Len(); i++ {
			service := file.Services().Get(i)
			for j := 0; j < service.Methods().Len(); j++ {
				method := service.Methods().Get(j)
				if method.IsStreamingServer() {
					continue
				}
				count++
				t.Run(string(service.Name())+"/"+string(method.Name()), func(t *testing.T) {
					for _, authorized := range []bool{false, true} {
						req, err := http.NewRequestWithContext(t.Context(), "POST", state.Endpoint+"/"+string(service.FullName())+"/"+string(method.Name()), strings.NewReader("{}"))
						if err != nil {
							t.Fatal(err)
						}
						req.Header.Set("Content-Type", "application/json")
						req.Header.Set("Connect-Protocol-Version", "1")
						if authorized {
							req.Header.Set("Authorization", "Bearer "+state.Token)
						}
						res, err := testHTTP().Do(req)
						if err != nil {
							t.Fatal(err)
						}
						body, err := io.ReadAll(res.Body)
						res.Body.Close()
						if err != nil {
							t.Fatal(err)
						}
						if !authorized {
							if res.StatusCode != 401 {
								t.Fatalf("unauthenticated %d: %s", res.StatusCode, body)
							}
							continue
						}
						if res.StatusCode == 200 {
							if service.Name() != "HealthService" && service.Name() != "MaintenanceService" {
								t.Fatalf("missing service returned fake success: %s", body)
							}
							continue
						}
						var failure struct{ Code string }
						if err := json.Unmarshal(body, &failure); err != nil {
							t.Fatal(err)
						}
						if failure.Code != "unavailable" && failure.Code != "invalid_argument" {
							t.Fatalf("unmounted/broken route: %d %s", res.StatusCode, body)
						}
					}
				})
			}
		}
		return true
	})
	if count != 65 {
		t.Fatalf("RPC coverage changed: %d unary RPCs; update this gate", count)
	}
}

func TestAuthStreamingAndOriginGuard(t *testing.T) {
	_, state, _ := loopback(t, Services{})
	for _, bearer := range []string{"", "Bearer wrong", "bearer test-session"} {
		client := rpc.NewHealthServiceClient(testHTTP(), state.Endpoint)
		r := connect.NewRequest(&v1.CheckRequest{})
		r.Header().Set("Authorization", bearer)
		_, err := client.Check(t.Context(), r)
		if connect.CodeOf(err) != connect.CodeUnauthenticated {
			t.Fatalf("bearer %q: %v", bearer, err)
		}
	}
	stream, err := rpc.NewChangeServiceClient(testHTTP(), state.Endpoint).Watch(t.Context(), connect.NewRequest(&v1.WatchChangesRequest{}))
	if err == nil {
		defer stream.Close()
		if stream.Receive() {
			t.Fatal("unauthenticated snapshot")
		}
		err = stream.Err()
	}
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Fatalf("stream auth: %v", err)
	}
	for _, tc := range []struct {
		host, origin string
		status       int
	}{{"attacker.example", "", 403}, {"", "https://attacker.example", 403}, {"", "null", 403}, {"", "http://127.0.0.1.attacker.example", 403}, {"", "http://127.0.0.1/path", 403}, {"", "http://127.0.0.1", 200}, {"", "", 200}} {
		r, err := http.NewRequestWithContext(t.Context(), "POST", state.Endpoint+rpc.HealthServiceCheckProcedure, strings.NewReader("{}"))
		if err != nil {
			t.Fatal(err)
		}
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Authorization", "Bearer "+state.Token)
		if tc.origin != "" {
			r.Header.Set("Origin", tc.origin)
		}
		if tc.host != "" {
			r.Host = tc.host
		}
		res, err := testHTTP().Do(r)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != tc.status {
			t.Fatalf("host=%s origin=%s: %d", tc.host, tc.origin, res.StatusCode)
		}
		if res.Header.Get("Access-Control-Allow-Origin") != "" {
			t.Fatal("core exposed CORS")
		}
	}
}

// noteProbe verifies the transport's rev/patch/actor forwarding. It is not a
// substitute for W1-DOMAIN or real SQLite integration (request w1-core-1).
type noteProbe struct {
	note.Service
	mu    sync.Mutex
	row   note.Note
	actor string
	patch note.Patch
	feed  *testFeed
}

func (p *noteProbe) Get(_ context.Context, id string, _ note.Include) (note.GetResult, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if id != p.row.ID {
		return note.GetResult{}, fault.NotFound("note", id)
	}
	return note.GetResult{Note: p.row}, nil
}
func (p *noteProbe) Update(ctx context.Context, a actor.Actor, id string, rev int64, patch note.Patch) (note.Note, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return note.Note{}, err
	}
	if id != p.row.ID {
		return note.Note{}, fault.NotFound("note", id)
	}
	if rev != 0 && rev != p.row.Rev {
		return note.Note{}, fault.Conflict("note", id, p.row.Rev, p.row)
	}
	p.actor, p.patch = a.Raw, patch
	if patch.Title != nil {
		p.row.Title = *patch.Title
	}
	if patch.Pinned != nil {
		p.row.Pinned = *patch.Pinned
	}
	if patch.ClearSpaceID {
		p.row.SpaceID = nil
	}
	if patch.ClearDueAt {
		p.row.DueAt = nil
	}
	if patch.ClearPriority {
		p.row.Priority = nil
	}
	p.row.Rev++
	p.row.UpdatedAt = time.Now().UTC()
	if p.feed != nil {
		p.feed.publish(Change{Entity: "notes", ID: id, Op: "update"})
	}
	return p.row, nil
}
func newProbe(feed *testFeed) *noteProbe {
	return &noteProbe{row: note.Note{ID: "01TEST", Title: "initial", Status: "active", Rev: 1, CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()}, feed: feed}
}

func TestConcurrentWritersAndRevConflictEntity(t *testing.T) {
	p := newProbe(nil)
	clients, state, _ := loopback(t, Services{Notes: p})
	other, err := coreclient.NewWithHTTP(state, "desktop", &http.Client{Transport: &http.Transport{DisableKeepAlives: true}})
	if err != nil {
		t.Fatal(err)
	}
	const writers = 32
	results := make(chan error, writers)
	var wg sync.WaitGroup
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			title := fmt.Sprintf("writer-%d", i)
			rev := int64(1)
			client := clients.Note
			if i%2 == 0 {
				client = other.Note
			}
			_, err := client.Update(t.Context(), connect.NewRequest(&v1.UpdateNoteRequest{Id: p.row.ID, ExpectedRev: &rev, Title: &title}))
			results <- err
		}(i)
	}
	wg.Wait()
	close(results)
	success, conflicts := 0, 0
	for err := range results {
		if err == nil {
			success++
			continue
		}
		if connect.CodeOf(err) != connect.CodeFailedPrecondition {
			t.Fatal(err)
		}
		conflicts++
		var ce *connect.Error
		if !errors.As(err, &ce) {
			t.Fatal(err)
		}
		if len(ce.Details()) != 1 {
			t.Fatal("conflict detail absent")
		}
		value, err := ce.Details()[0].Value()
		if err != nil {
			t.Fatal(err)
		}
		detail := value.(*v1.PreconditionDetail)
		if detail.Reason != "rev_conflict" || detail.Entity != "note" || detail.EntityId != p.row.ID || detail.CurrentRev != 2 {
			t.Fatalf("conflict detail: %v", detail)
		}
		var current map[string]any
		if err := json.Unmarshal([]byte(detail.CurrentJson), &current); err != nil {
			t.Fatal(err)
		}
		if current["id"] != p.row.ID || current["rev"] != "2" || !strings.HasPrefix(current["title"].(string), "writer-") {
			t.Fatalf("wrong wire entity: %v", current)
		}
	}
	if success != 1 || conflicts != writers-1 {
		t.Fatalf("writers success=%d conflicts=%d", success, conflicts)
	}
}

func TestPatchClearsFalseAndActorForwarding(t *testing.T) {
	p := newProbe(nil)
	space := "space"
	priority := 3
	due := time.Now()
	p.row.SpaceID = &space
	p.row.Priority = &priority
	p.row.DueAt = &due
	p.row.Pinned = true
	clients, _, _ := loopback(t, Services{Notes: p})
	pinned := false
	empty := ""
	rev := int64(1)
	res, err := clients.Note.Update(t.Context(), connect.NewRequest(&v1.UpdateNoteRequest{Id: p.row.ID, ExpectedRev: &rev, Content: &empty, Pinned: &pinned, ClearSpaceId: true, ClearPriority: true, ClearDueAt: true}))
	if err != nil {
		t.Fatal(err)
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.actor != "cli" || p.patch.Content == nil || *p.patch.Content != "" || p.patch.Pinned == nil || *p.patch.Pinned || !p.patch.ClearSpaceID || !p.patch.ClearDueAt || !p.patch.ClearPriority {
		t.Fatalf("patch forwarding: %+v actor=%s", p.patch, p.actor)
	}
	if res.Msg.Note.Pinned || res.Msg.Note.Priority != nil || res.Msg.Note.DueAt != nil || res.Msg.Note.SpaceId != "" {
		t.Fatalf("clears lost: %v", res.Msg.Note)
	}
}
func TestInvalidTimestampDoesNotReachDomain(t *testing.T) {
	p := newProbe(nil)
	clients, _, _ := loopback(t, Services{Notes: p})
	_, err := clients.Note.Update(t.Context(), connect.NewRequest(&v1.UpdateNoteRequest{Id: p.row.ID, DueAt: &timestamppb.Timestamp{Seconds: 1, Nanos: -1}}))
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Fatal(err)
	}
	var ce *connect.Error
	if !errors.As(err, &ce) || len(ce.Details()) != 1 {
		t.Fatal("bad-request detail absent")
	}
	if p.row.Rev != 1 {
		t.Fatal("invalid wire timestamp reached service")
	}
}
func TestErrorMapping(t *testing.T) {
	for _, tc := range []struct {
		err  error
		code connect.Code
	}{{fault.NotFound("note", "id"), connect.CodeNotFound}, {fault.Invalid(fault.Violation{Field: "title", Reason: "required"}), connect.CodeInvalidArgument}, {fault.Exists("tag", "id"), connect.CodeAlreadyExists}, {fault.Exhausted("too large"), connect.CodeResourceExhausted}, {fault.Unavailable("offline"), connect.CodeUnavailable}, {context.Canceled, connect.CodeCanceled}, {context.DeadlineExceeded, connect.CodeDeadlineExceeded}, {fmt.Errorf("disk contains private note"), connect.CodeInternal}} {
		err := mapError(fmt.Errorf("wrapped: %w", tc.err))
		if connect.CodeOf(err) != tc.code {
			t.Fatalf("%v -> %v", tc.err, err)
		}
		if tc.code == connect.CodeInternal && strings.Contains(err.Error(), "private note") {
			t.Fatal("internal details leaked")
		}
	}
}
func TestHealthHandshakeAndDoctorUnavailable(t *testing.T) {
	clients, state, _ := loopback(t, Services{})
	if err := coreclient.Check(t.Context(), state); err != nil {
		t.Fatal(err)
	}
	bad := state
	bad.Build = "wrong"
	if err := coreclient.Check(t.Context(), bad); err == nil {
		t.Fatal("accepted mismatched build")
	}
	report, err := clients.Maintenance.Doctor(t.Context(), connect.NewRequest(&v1.DoctorRequest{}))
	if err != nil || report.Msg.Ok || len(report.Msg.Checks) != 1 {
		t.Fatalf("unavailable doctor: %v %v", report, err)
	}
}
func TestPanicDoesNotExposeServiceDetails(t *testing.T) {
	// An unimplemented embedded method panics; transport must fail closed.
	clients, _, _ := loopback(t, Services{Notes: newProbe(nil)})
	_, err := clients.Note.List(t.Context(), connect.NewRequest(&v1.ListNotesRequest{}))
	if connect.CodeOf(err) != connect.CodeInternal {
		t.Fatal(err)
	}
	if strings.Contains(err.Error(), "nil pointer") {
		t.Fatal("panic detail leaked")
	}
}

func TestDuplicateAuthorizationRejected(t *testing.T) {
	_, state, _ := loopback(t, Services{})
	r, err := http.NewRequestWithContext(t.Context(), "POST", state.Endpoint+rpc.HealthServiceCheckProcedure, bytes.NewBufferString("{}"))
	if err != nil {
		t.Fatal(err)
	}
	r.Header.Set("Content-Type", "application/json")
	r.Header.Add("Authorization", "Bearer "+state.Token)
	r.Header.Add("Authorization", "Bearer wrong")
	res, err := testHTTP().Do(r)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 401 {
		t.Fatal(res.StatusCode)
	}
}
