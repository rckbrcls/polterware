package changes

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"
)

func next(t *testing.T, s *Subscription) Event {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	e, err := s.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	return e
}

func TestSnapshotReplayAndIsolation(t *testing.T) {
	b := New()
	b.Publish([]Change{{Entity: "note", ID: "one", Op: "create"}})
	input := []Change{{Entity: "note", ID: "two", Op: "update"}}
	returned := b.Publish(input)
	input[0].ID = "mutated"
	returned.Changes[0].ID = "mutated"
	s, err := b.Watch(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if e := next(t, s); !e.Snapshot || e.Seq != 2 || len(e.Changes) != 0 {
		t.Fatalf("marker: %+v", e)
	}
	e := next(t, s)
	if e.Seq != 2 || e.Changes[0].ID != "two" {
		t.Fatalf("replay: %+v", e)
	}
	e.Changes[0].ID = "changed by subscriber"
	other, err := b.Watch(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	next(t, other)
	if e := next(t, other); e.Changes[0].ID != "two" {
		t.Fatalf("aliased replay: %+v", e)
	}
	b.Publish([]Change{{ID: "three"}})
	if e := next(t, s); e.Seq != 3 || e.Changes[0].ID != "three" {
		t.Fatalf("live: %+v", e)
	}
}

func TestReplayBounds(t *testing.T) {
	for _, size := range []int{1, 4, ReplayLimit + 1} {
		t.Run(fmt.Sprint(size), func(t *testing.T) {
			b := New()
			for i := 0; i < ReplayLimit+2; i++ {
				b.Publish(make([]Change, size))
			}
			if b.retained > ReplayLimit {
				t.Fatal("unbounded history")
			}
			if _, err := b.Watch(context.Background(), 1); !errors.Is(err, ErrExpired) {
				t.Fatalf("expired: %v", err)
			}
			if _, err := b.Watch(context.Background(), b.seq+1); !errors.Is(err, ErrFuture) {
				t.Fatalf("future: %v", err)
			}
			s, err := b.Watch(context.Background(), b.floor)
			if err != nil {
				t.Fatal(err)
			}
			defer s.Close()
			next(t, s)
			for want := b.floor + 1; want <= b.seq; want++ {
				if e := next(t, s); e.Seq != want || len(e.Changes) != size {
					t.Fatalf("split batch: %+v", e)
				}
			}
		})
	}
}

func TestFreshWatchAndEmptyBatch(t *testing.T) {
	b := New()
	b.Publish([]Change{{ID: "old"}})
	if e := b.Publish(nil); e.Seq != 1 {
		t.Fatal("empty write advances sequence")
	}
	s, err := b.Watch(context.Background(), 0)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	next(t, s)
	b.Publish([]Change{{ID: "new"}})
	if e := next(t, s); e.Changes[0].ID != "new" {
		t.Fatal("fresh watch replays")
	}
}

func TestSlowConsumerAndCancellation(t *testing.T) {
	b := New()
	s, err := b.Watch(context.Background(), 0)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i <= ReplayLimit; i++ {
		b.Publish([]Change{{ID: "one"}})
	}
	if _, err := s.Next(context.Background()); !errors.Is(err, ErrSlowConsumer) {
		t.Fatalf("overflow: %v", err)
	}
	s.Close()
	ctx, cancel := context.WithCancel(context.Background())
	s, err = b.Watch(ctx, 0)
	if err != nil {
		t.Fatal(err)
	}
	next(t, s)
	cancel()
	wait, stop := context.WithTimeout(context.Background(), time.Second)
	defer stop()
	if _, err := s.Next(wait); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancel: %v", err)
	}
	if _, err := b.Watch(ctx, 0); !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled watch: %v", err)
	}
	s.Close()
	b.mu.Lock()
	defer b.mu.Unlock()
	if len(b.watchers) != 0 {
		t.Fatal("subscriber leaked")
	}
}

func TestConcurrentPublishWatchClose(t *testing.T) {
	b := New()
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				s, err := b.Watch(context.Background(), 0)
				if err != nil {
					t.Error(err)
					return
				}
				next(t, s)
				b.Publish([]Change{{ID: "one"}})
				s.Close()
			}
		}()
	}
	wg.Wait()
	if b.seq != 800 || len(b.watchers) != 0 {
		t.Fatalf("seq=%d watchers=%d", b.seq, len(b.watchers))
	}
}
