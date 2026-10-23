// Package testkit wires the owned domain services around one transactional fake store.
package testkit

import (
	"context"

	"fmt"
	"github.com/polterware/polterware/notes/backend/domains/activity"
	af "github.com/polterware/polterware/notes/backend/domains/activity/fake"

	"github.com/polterware/polterware/notes/backend/domains/focus"
	ff "github.com/polterware/polterware/notes/backend/domains/focus/fake"
	"github.com/polterware/polterware/notes/backend/domains/note"
	mf "github.com/polterware/polterware/notes/backend/domains/note/fake"
	"github.com/polterware/polterware/notes/backend/domains/settings"
	sf "github.com/polterware/polterware/notes/backend/domains/settings/fake"
	"github.com/polterware/polterware/notes/backend/domains/space"
	nf "github.com/polterware/polterware/notes/backend/domains/space/fake"
	"github.com/polterware/polterware/notes/backend/domains/tag"
	tf "github.com/polterware/polterware/notes/backend/domains/tag/fake"
	"sync"
	"time"
)

type fixedClock struct{ at time.Time }

func (c fixedClock) Now() time.Time { return c.at }

type generator struct {
	mu sync.Mutex
	n  int
}

func (g *generator) New() string {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.n++
	return fmt.Sprintf("01K00000000000000000%06d", g.n)
}

type Fixture struct {
	Ctx      context.Context
	Store    *af.Store
	Audit    activity.Audit
	Mem      *mf.Repository
	Spaces   *nf.Repository
	Tags     *tf.Repository
	Settings *sf.Repository
	Focus    *ff.Repository
	MS       note.Service
	NS       space.Service
	TS       tag.Service
	SS       settings.Service
	FS       focus.Service
}

func Setup() *Fixture {
	st := af.NewStore()
	f := &Fixture{Ctx: context.Background(), Store: st, Mem: mf.New(st), Spaces: nf.New(st), Tags: tf.New(st), Settings: sf.New(st), Focus: ff.New(st)}
	f.Audit = activity.Audit{Repository: af.New(st), Transactions: st, Clock: fixedClock{time.Date(2026, 10, 4, 18, 0, 0, 0, time.UTC)}, IDs: &generator{}}
	f.MS = note.NewService(f.Mem, f.Spaces, f.Tags, nil, nil, f.Audit)
	f.NS = space.NewService(f.Spaces, f.Mem, f.Audit)
	f.TS = tag.NewService(f.Tags, f.Audit)
	f.SS = settings.NewService(f.Settings, f.Audit)
	f.FS = focus.NewService(f.Focus, f.Settings, f.Mem, f.Audit)
	return f
}
