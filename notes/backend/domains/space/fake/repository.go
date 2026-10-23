package fake

import (
	"context"
	store "github.com/polterware/polterware/notes/backend/domains/activity/fake"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/space"
	"sort"
)

type Repository struct{ Store *store.Store }

func New(s *store.Store) *Repository { return &Repository{s} }

var _ space.Repository = (*Repository)(nil)

func (r *Repository) List(ctx context.Context) ([]space.Space, error) {
	out, err := store.All[space.Space](ctx, r.Store, "spaces")
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, err
}
func (r *Repository) Get(ctx context.Context, id string) (space.Space, error) {
	v, ok, err := store.Read[space.Space](ctx, r.Store, "spaces", id)
	if err == nil && !ok {
		err = fault.NotFound("space", id)
	}
	return v, err
}
func (r *Repository) Insert(ctx context.Context, v space.Space) error {
	return r.Store.Within(ctx, func(ctx context.Context) error {
		if _, err := r.Get(ctx, v.ID); err == nil {
			return fault.Exists("space", v.ID)
		} else if !fault.IsCode(err, fault.CodeNotFound) {
			return err
		}
		if v.ParentID != nil {
			if _, err := r.Get(ctx, *v.ParentID); err != nil {
				return err
			}
		}
		return r.Store.Put(ctx, "spaces", v.ID, v)
	})
}
func (r *Repository) Update(ctx context.Context, rev int64, v space.Space) error {
	return r.Store.Within(ctx, func(ctx context.Context) error {
		old, err := r.Get(ctx, v.ID)
		if err != nil {
			return err
		}
		if rev != 0 && old.Rev != rev {
			return fault.Conflict("space", v.ID, old.Rev, old)
		}
		if v.ParentID != nil {
			if _, err := r.Get(ctx, *v.ParentID); err != nil {
				return err
			}
		}
		return r.Store.Put(ctx, "spaces", v.ID, v)
	})
}
func (r *Repository) Delete(ctx context.Context, rev int64, id string) error {
	return r.Store.Within(ctx, func(ctx context.Context) error {
		old, e := r.Get(ctx, id)
		if e != nil {
			return e
		}
		if rev != 0 && old.Rev != rev {
			return fault.Conflict("space", id, old.Rev, old)
		}
		rows, e := r.List(ctx)
		if e != nil {
			return e
		}
		removed := map[string]bool{id: true}
		for changed := true; changed; {
			changed = false
			for _, v := range rows {
				if v.ParentID != nil && removed[*v.ParentID] && !removed[v.ID] {
					removed[v.ID] = true
					changed = true
				}
			}
		}
		for id := range removed {
			if e = r.Store.Remove(ctx, "spaces", id); e != nil {
				return e
			}
		}
		notes, e := store.All[note.Note](ctx, r.Store, "notes")
		if e != nil {
			return e
		}
		for _, m := range notes {
			if m.SpaceID != nil && removed[*m.SpaceID] {
				m.SpaceID = nil
				if e = r.Store.Put(ctx, "notes", m.ID, m); e != nil {
					return e
				}
			}
		}
		return nil
	})
}
