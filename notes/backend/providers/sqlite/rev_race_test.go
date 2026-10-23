package sqlite

import (
	"sync"
	"testing"

	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/space"
	"github.com/polterware/polterware/notes/backend/platform/clock"
	"github.com/polterware/polterware/notes/backend/platform/ids"
)

func TestConcurrentToggleAndDeleteRev(t *testing.T) {
	store := openStore(t)
	ctx := t.Context()
	audit := activity.Audit{Repository: store.Activity(), Transactions: store, Clock: clock.Clock{}, IDs: ids.Generator{}}
	notes := note.NewService(store.Notes(), store.Spaces(), store.Tags(), nil, nil, audit)
	spaces := space.NewService(store.Spaces(), store.Notes(), audit)
	who := actor.UI()

	created, err := notes.Create(ctx, who, note.Create{Title: "Race", Checklist: []note.CheckItemInput{{Title: "A"}}})
	if err != nil {
		t.Fatal(err)
	}
	items, err := store.Notes().ListCheckItems(ctx, created.ID)
	if err != nil || len(items) != 1 {
		t.Fatal(items, err)
	}

	errs := make(chan error, 2)
	var wg sync.WaitGroup
	wg.Add(2)
	for i := 0; i < 2; i++ {
		go func() {
			defer wg.Done()
			_, err := notes.ToggleCheckItem(ctx, who, created.ID, items[0].ID, 1, nil)
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	ok, conflict := 0, 0
	for err := range errs {
		if err == nil {
			ok++
			continue
		}
		if fault.IsCode(err, fault.CodeConflict) {
			conflict++
			continue
		}
		t.Fatal(err)
	}
	if ok != 1 || conflict != 1 {
		t.Fatalf("toggle ok=%d conflict=%d", ok, conflict)
	}

	stale := created
	stale.Title = "Nope"
	stale.Rev = 2
	if err := store.Notes().Update(ctx, 99, stale); !fault.IsCode(err, fault.CodeConflict) {
		t.Fatalf("note repo conflict: %v", err)
	}
	if err := store.Notes().Delete(ctx, 1, created.ID); !fault.IsCode(err, fault.CodeConflict) {
		t.Fatalf("delete stale: %v", err)
	}

	node, err := spaces.Create(ctx, who, space.Create{Name: "Race"})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Spaces().Delete(ctx, 99, node.ID); !fault.IsCode(err, fault.CodeConflict) {
		t.Fatalf("space delete stale: %v", err)
	}
	if _, err := spaces.Delete(ctx, who, node.ID, 1); err != nil {
		t.Fatal(err)
	}
}
