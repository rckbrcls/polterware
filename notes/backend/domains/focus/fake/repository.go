package fake

import (
	"context"
	store "github.com/polterware/polterware/notes/backend/domains/activity/fake"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/focus"
	"sort"
	"time"
)

type Repository struct{ Store *store.Store }

func New(s *store.Store) *Repository { return &Repository{s} }

var _ focus.Repository = (*Repository)(nil)

func (r *Repository) InsertSession(ctx context.Context, v focus.Session) error {
	return r.Store.Within(ctx, func(ctx context.Context) error {
		_, ok, e := store.Read[focus.Session](ctx, r.Store, "focus_sessions", v.ID)
		if e != nil {
			return e
		}
		if ok {
			return fault.Exists("focus_session", v.ID)
		}
		return r.Store.Put(ctx, "focus_sessions", v.ID, v)
	})
}
func (r *Repository) ListSessions(ctx context.Context, from, to time.Time) ([]focus.Session, error) {
	all, e := store.All[focus.Session](ctx, r.Store, "focus_sessions")
	out := []focus.Session{}
	for _, v := range all {
		if !v.StartedAt.Before(from) && v.StartedAt.Before(to) {
			out = append(out, v)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].StartedAt.Before(out[j].StartedAt) })
	return out, e
}
