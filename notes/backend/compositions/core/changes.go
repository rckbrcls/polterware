package core

import (
	"context"
	"errors"
	"sync"

	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/platform/changes"
)

type liveFeed struct{ bus *changes.Broadcaster }

func mapWatchErr(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, changes.ErrExpired):
		return fault.Precondition("replay expired; resnapshot required", "changes", "")
	case errors.Is(err, changes.ErrFuture):
		return fault.Precondition("sequence belongs to an earlier core; resnapshot required", "changes", "")
	case errors.Is(err, changes.ErrSlowConsumer):
		return fault.Exhausted("slow consumer; resnapshot required")
	case errors.Is(err, changes.ErrClosed):
		return fault.Unavailable("change feed closed")
	default:
		return err
	}
}

func (f liveFeed) Subscribe(ctx context.Context, since int64) (Subscription, error) {
	sub, err := f.bus.Watch(ctx, since)
	if err != nil {
		return Subscription{}, mapWatchErr(err)
	}
	marker, err := sub.Next(ctx)
	if err != nil {
		sub.Close()
		return Subscription{}, mapWatchErr(err)
	}
	events := make(chan ChangeEvent, 64)
	var mu sync.Mutex
	var fail error
	go func() {
		defer close(events)
		for {
			event, err := sub.Next(ctx)
			if err != nil {
				mu.Lock()
				fail = mapWatchErr(err)
				mu.Unlock()
				return
			}
			if event.Snapshot {
				continue
			}
			out := ChangeEvent{Seq: event.Seq, Changes: make([]Change, len(event.Changes))}
			for i, change := range event.Changes {
				out.Changes[i] = Change{Entity: change.Entity, ID: change.ID, Op: change.Op}
			}
			select {
			case events <- out:
			case <-ctx.Done():
				mu.Lock()
				fail = ctx.Err()
				mu.Unlock()
				return
			}
		}
	}()
	var once sync.Once
	return Subscription{
		Snapshot: marker.Seq,
		Events:   events,
		Err: func() error {
			mu.Lock()
			defer mu.Unlock()
			return fail
		},
		Close: func() {
			once.Do(sub.Close)
		},
	}, nil
}
