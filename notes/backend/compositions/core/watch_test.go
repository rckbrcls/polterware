package core

import (
	"connectrpc.com/connect"
	"context"
	"fmt"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
	"sync"
	"testing"
	"time"
)

// testFeed models the store's atomic subscribe/replay contract. Production
// recording, rollback and bounded broadcasting belong to W1-STORE.
type testFeed struct {
	mu     sync.Mutex
	seq    int64
	replay []ChangeEvent
	subs   map[*testSubscription]bool
}
type testSubscription struct {
	events chan ChangeEvent
	err    error
}

func newFeed() *testFeed { return &testFeed{subs: make(map[*testSubscription]bool)} }
func (f *testFeed) publish(change Change) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.seq++
	event := ChangeEvent{Seq: f.seq, Changes: []Change{change}}
	f.replay = append(f.replay, event)
	if len(f.replay) > 1000 {
		f.replay = f.replay[1:]
	}
	for sub := range f.subs {
		select {
		case sub.events <- event:
		default:
			sub.err = fault.Exhausted("slow consumer; resnapshot required")
			close(sub.events)
			delete(f.subs, sub)
		}
	}
}
func (f *testFeed) Subscribe(_ context.Context, since int64) (Subscription, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if since > f.seq {
		return Subscription{}, fault.Precondition("sequence belongs to an earlier core; resnapshot required", "changes", "")
	}
	if len(f.replay) > 0 && since != 0 && since < f.replay[0].Seq-1 {
		return Subscription{}, fault.Precondition("replay expired; resnapshot required", "changes", "")
	}
	sub := &testSubscription{events: make(chan ChangeEvent, 1024)}
	if since != 0 {
		for _, e := range f.replay {
			if e.Seq > since {
				sub.events <- e
			}
		}
	}
	f.subs[sub] = true
	var once sync.Once
	return Subscription{Snapshot: f.seq, Events: sub.events, Err: func() error { f.mu.Lock(); defer f.mu.Unlock(); return sub.err }, Close: func() {
		once.Do(func() {
			f.mu.Lock()
			defer f.mu.Unlock()
			if f.subs[sub] {
				delete(f.subs, sub)
				close(sub.events)
			}
		})
	}}, nil
}
func TestWatchConcurrentWritersOrderingReplayAndLatency(t *testing.T) {
	feed := newFeed()
	p := newProbe(feed)
	clients, _, _ := loopback(t, Services{Notes: p, Changes: feed})
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	stream, err := clients.Change.Watch(ctx, connect.NewRequest(&v1.WatchChangesRequest{}))
	if err != nil {
		t.Fatal(err)
	}
	defer stream.Close()
	if !stream.Receive() || !stream.Msg().Snapshot || stream.Msg().Seq != 0 {
		t.Fatalf("snapshot: %v", stream.Err())
	}
	start := time.Now()
	title := "first"
	if _, err := clients.Note.Update(ctx, connect.NewRequest(&v1.UpdateNoteRequest{Id: p.row.ID, Title: &title})); err != nil {
		t.Fatal(err)
	}
	if !stream.Receive() {
		t.Fatal(stream.Err())
	}
	if time.Since(start) > 100*time.Millisecond {
		t.Fatalf("watch delivery took %s", time.Since(start))
	}
	if stream.Msg().Seq != 1 || stream.Msg().Snapshot || stream.Msg().Changes[0].Id != p.row.ID {
		t.Fatal(stream.Msg())
	}
	const writers = 48
	var wg sync.WaitGroup
	errs := make(chan error, writers)
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			title := fmt.Sprintf("writer %d", i)
			_, err := clients.Note.Update(ctx, connect.NewRequest(&v1.UpdateNoteRequest{Id: p.row.ID, Title: &title}))
			errs <- err
		}(i)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	for seq := int64(2); seq <= writers+1; seq++ {
		if !stream.Receive() {
			t.Fatal(stream.Err())
		}
		if stream.Msg().Seq != seq {
			t.Fatalf("seq %d: %v", seq, stream.Msg())
		}
	}
	stream.Close()
	replay, err := clients.Change.Watch(ctx, connect.NewRequest(&v1.WatchChangesRequest{SinceSeq: 1}))
	if err != nil {
		t.Fatal(err)
	}
	defer replay.Close()
	if !replay.Receive() || !replay.Msg().Snapshot || replay.Msg().Seq != writers+1 {
		t.Fatal("replay snapshot marker")
	}
	// Snapshot seq is a watermark; replay messages may precede it. Clients
	// advance their replay cursor only from non-snapshot events.
	for seq := int64(2); seq <= writers+1; seq++ {
		if !replay.Receive() {
			t.Fatal(replay.Err())
		}
		if replay.Msg().Seq != seq || replay.Msg().Snapshot {
			t.Fatal(replay.Msg())
		}
	}
	title = "live after replay"
	if _, err := clients.Note.Update(ctx, connect.NewRequest(&v1.UpdateNoteRequest{Id: p.row.ID, Title: &title})); err != nil {
		t.Fatal(err)
	}
	if !replay.Receive() || replay.Msg().Seq != writers+2 {
		t.Fatalf("live after replay: %v", replay.Err())
	}
}
func TestWatchInvalidAndExpiredSequences(t *testing.T) {
	feed := newFeed()
	for i := 0; i < 1100; i++ {
		feed.publish(Change{Entity: "notes", ID: "id", Op: "update"})
	}
	clients, _, _ := loopback(t, Services{Changes: feed})
	for _, tc := range []struct {
		since int64
		code  connect.Code
	}{{-1, connect.CodeInvalidArgument}, {1101, connect.CodeFailedPrecondition}, {1, connect.CodeFailedPrecondition}} {
		ctx, cancel := context.WithTimeout(t.Context(), time.Second)
		stream, err := clients.Change.Watch(ctx, connect.NewRequest(&v1.WatchChangesRequest{SinceSeq: tc.since}))
		if err == nil {
			if stream.Receive() {
				t.Fatal("invalid sequence emitted snapshot")
			}
			err = stream.Err()
			stream.Close()
		}
		cancel()
		if connect.CodeOf(err) != tc.code {
			t.Fatalf("since=%d: %v", tc.since, err)
		}
	}
}
func TestShutdownRacesWithOpenWatchAndWriters(t *testing.T) {
	for attempt := 0; attempt < 8; attempt++ {
		feed := newFeed()
		p := newProbe(feed)
		clients, _, server := loopback(t, Services{Notes: p, Changes: feed})
		ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
		stream, err := clients.Change.Watch(ctx, connect.NewRequest(&v1.WatchChangesRequest{}))
		if err != nil {
			cancel()
			t.Fatal(err)
		}
		if !stream.Receive() {
			cancel()
			t.Fatal(stream.Err())
		}
		var wg sync.WaitGroup
		for i := 0; i < 8; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				title := "shutdown race"
				_, err := clients.Note.Update(ctx, connect.NewRequest(&v1.UpdateNoteRequest{Id: p.row.ID, Title: &title}))
				if err != nil {
					switch connect.CodeOf(err) {
					case connect.CodeUnavailable, connect.CodeCanceled, connect.CodeUnknown:
					default:
						t.Errorf("shutdown writer: %v", err)
					}
				}
			}()
		}
		shutdown, stop := context.WithTimeout(t.Context(), time.Second)
		if err := server.Shutdown(shutdown); err != nil {
			t.Error(err)
		}
		stop()
		wg.Wait()
		for stream.Receive() {
		}
		if stream.Err() == nil {
			t.Error("watch silently ended during shutdown")
		}
		stream.Close()
		cancel()
		feed.mu.Lock()
		if len(feed.subs) != 0 {
			t.Error("watch subscription leaked")
		}
		feed.mu.Unlock()
	}
}
func TestOpenWatchPreventsIdleExit(t *testing.T) {
	feed := newFeed()
	clients, _, server := loopback(t, Services{Changes: feed})
	ctx, cancel := context.WithTimeout(t.Context(), time.Second)
	defer cancel()
	stream, err := clients.Change.Watch(ctx, connect.NewRequest(&v1.WatchChangesRequest{}))
	if err != nil {
		t.Fatal(err)
	}
	defer stream.Close()
	if !stream.Receive() {
		t.Fatal(stream.Err())
	}
	if server.Idle(time.Nanosecond) {
		t.Fatal("open watch counted as idle")
	}
}
