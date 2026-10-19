// Package changes distributes committed transaction batches within one core process.
package changes

import (
	"context"
	"errors"
	"sync"
)

const ReplayLimit = 1000

var (
	ErrExpired      = errors.New("change cursor expired; reload the snapshot")
	ErrFuture       = errors.New("change cursor is ahead of the core")
	ErrSlowConsumer = errors.New("change subscriber fell behind; reconnect")
	ErrClosed       = errors.New("change subscription closed")
)

type Change struct{ Entity, ID, Op string }

// Event is one committed transaction, or the initial snapshot marker.
type Event struct {
	Seq      int64
	Changes  []Change
	Snapshot bool
}

// Broadcaster never waits for consumers. Retention is bounded by entity changes;
// whole transaction batches are evicted together, never replayed partially.
type Broadcaster struct {
	mu         sync.Mutex
	seq, floor int64
	history    []Event
	retained   int
	watchers   map[*Subscription]struct{}
}

func New() *Broadcaster { return &Broadcaster{watchers: make(map[*Subscription]struct{})} }

func clone(e Event) Event { e.Changes = append([]Change(nil), e.Changes...); return e }

// Publish must be called only after the SQLite transaction successfully commits,
// never directly from SQLite's pre-commit hook. Empty batches do not advance seq.
func (b *Broadcaster) Publish(changes []Change) Event {
	b.mu.Lock()
	defer b.mu.Unlock()
	if len(changes) == 0 {
		return Event{Seq: b.seq}
	}
	b.seq++
	e := clone(Event{Seq: b.seq, Changes: changes})
	b.history = append(b.history, e)
	b.retained += len(changes)
	for b.retained > ReplayLimit {
		b.retained -= len(b.history[0].Changes)
		b.floor = b.history[0].Seq
		b.history[0] = Event{}
		b.history = b.history[1:]
	}
	for s := range b.watchers {
		select {
		case s.queue <- clone(e):
		default:
			b.closeLocked(s, ErrSlowConsumer)
		}
	}
	return clone(e)
}

// Watch atomically registers a consumer and queues its snapshot marker followed
// by retained batches newer than sinceSeq. Zero starts a fresh watch with no
// replay. The marker carries the current seq, as required by ChangeService.
func (b *Broadcaster) Watch(ctx context.Context, sinceSeq int64) (*Subscription, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if sinceSeq < 0 || (sinceSeq != 0 && sinceSeq < b.floor) {
		return nil, ErrExpired
	}
	if sinceSeq > b.seq {
		return nil, ErrFuture
	}
	s := &Subscription{owner: b, queue: make(chan Event, ReplayLimit+1), done: make(chan struct{})}
	s.queue <- Event{Seq: b.seq, Snapshot: true}
	if sinceSeq != 0 {
		for _, e := range b.history {
			if e.Seq > sinceSeq {
				s.queue <- clone(e)
			}
		}
	}
	b.watchers[s] = struct{}{}
	s.stop = context.AfterFunc(ctx, func() { b.mu.Lock(); defer b.mu.Unlock(); b.closeLocked(s, ctx.Err()) })
	return s, nil
}

type Subscription struct {
	owner *Broadcaster
	queue chan Event
	done  chan struct{}
	err   error // protected by owner.mu
	stop  func() bool
}

func (b *Broadcaster) closeLocked(s *Subscription, err error) {
	if _, ok := b.watchers[s]; !ok {
		return
	}
	delete(b.watchers, s)
	s.err = err
	close(s.done)
	if s.stop != nil {
		s.stop()
	}
}

func (s *Subscription) Close() {
	s.owner.mu.Lock()
	defer s.owner.mu.Unlock()
	s.owner.closeLocked(s, ErrClosed)
}

// Next returns terminal errors before queued data after overflow or cancellation.
// Call Close when the RPC ends to release the subscriber and its context callback.
func (s *Subscription) Next(ctx context.Context) (Event, error) {
	select {
	case <-ctx.Done():
		return Event{}, ctx.Err()
	case <-s.done:
		s.owner.mu.Lock()
		defer s.owner.mu.Unlock()
		return Event{}, s.err
	case e := <-s.queue:
		s.owner.mu.Lock()
		defer s.owner.mu.Unlock()
		if s.err != nil {
			return Event{}, s.err
		}
		return e, nil
	}
}
