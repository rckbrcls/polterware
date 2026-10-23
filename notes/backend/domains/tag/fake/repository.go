package fake

import (
	"context"
	store "github.com/polterware/polterware/notes/backend/domains/activity/fake"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/tag"
	"sort"
	"strings"
)

type Repository struct{ Store *store.Store }

func New(s *store.Store) *Repository { return &Repository{s} }

var _ tag.Repository = (*Repository)(nil)

func (r *Repository) List(ctx context.Context) ([]tag.Tag, error) {
	out, err := store.All[tag.Tag](ctx, r.Store, "tags")
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	if err != nil {
		return nil, err
	}
	links, err := store.All[tagLinks](ctx, r.Store, "note_tags")
	if err != nil {
		return nil, err
	}
	for i := range out {
		out[i].UsageCount = 0
		for _, link := range links {
			if contains(link.IDs, out[i].ID) {
				out[i].UsageCount++
			}
		}
	}
	return out, err
}
func (r *Repository) Get(ctx context.Context, id string) (tag.Tag, error) {
	v, ok, err := store.Read[tag.Tag](ctx, r.Store, "tags", id)
	if err == nil && !ok {
		err = fault.NotFound("tag", id)
	}
	if err != nil {
		return v, err
	}
	links, err := store.All[tagLinks](ctx, r.Store, "note_tags")
	v.UsageCount = 0
	for _, link := range links {
		if contains(link.IDs, v.ID) {
			v.UsageCount++
		}
	}
	return v, err
}
func (r *Repository) Insert(ctx context.Context, v tag.Tag) error {
	return r.Store.Within(ctx, func(ctx context.Context) error {
		if _, err := r.Get(ctx, v.ID); err == nil {
			return fault.Exists("tag", v.ID)
		} else if !fault.IsCode(err, fault.CodeNotFound) {
			return err
		}
		rows, err := r.List(ctx)
		if err != nil {
			return err
		}
		for _, t := range rows {
			if t.ID != v.ID && strings.EqualFold(t.Name, v.Name) {
				return fault.Exists("tag", t.ID)
			}
		}
		return r.Store.Put(ctx, "tags", v.ID, v)
	})
}
func (r *Repository) Update(ctx context.Context, rev int64, v tag.Tag) error {
	return r.Store.Within(ctx, func(ctx context.Context) error {
		old, err := r.Get(ctx, v.ID)
		if err != nil {
			return err
		}
		if rev != 0 && old.Rev != rev {
			return fault.Conflict("tag", v.ID, old.Rev, old)
		}
		rows, err := r.List(ctx)
		if err != nil {
			return err
		}
		for _, t := range rows {
			if t.ID != v.ID && strings.EqualFold(t.Name, v.Name) {
				return fault.Exists("tag", t.ID)
			}
		}
		return r.Store.Put(ctx, "tags", v.ID, v)
	})
}
func (r *Repository) GetByName(ctx context.Context, name string) (tag.Tag, error) {
	rows, err := r.List(ctx)
	if err != nil {
		return tag.Tag{}, err
	}
	for _, t := range rows {
		if strings.EqualFold(t.Name, name) {
			return t, nil
		}
	}
	return tag.Tag{}, fault.NotFound("tag", name)
}
func (r *Repository) Names(ctx context.Context) ([]string, error) {
	rows, err := r.List(ctx)
	var out []string
	for _, t := range rows {
		out = append(out, t.Name)
	}
	return out, err
}
func (r *Repository) Retarget(ctx context.Context, from, to string) (count int, err error) {
	err = r.Store.Within(ctx, func(ctx context.Context) error {
		if _, e := r.Get(ctx, from); e != nil {
			return e
		}
		if _, e := r.Get(ctx, to); e != nil {
			return e
		}
		links, e := store.All[tagLinks](ctx, r.Store, "note_tags")
		if e != nil {
			return e
		}
		for _, link := range links {
			found := false
			ids := []string{}
			for _, id := range link.IDs {
				if id == from {
					found = true
					id = to
				}
				if !contains(ids, id) {
					ids = append(ids, id)
				}
			}
			if found {
				count++
				link.IDs = ids
				if e = r.Store.Put(ctx, "note_tags", link.NoteID, link); e != nil {
					return e
				}
			}
		}
		return nil
	})
	return
}

type tagLinks struct {
	NoteID string
	IDs    []string
}

func contains(ids []string, id string) bool {
	for _, v := range ids {
		if v == id {
			return true
		}
	}
	return false
}
func (r *Repository) Delete(ctx context.Context, id string) error {
	return r.Store.Within(ctx, func(ctx context.Context) error {
		if _, e := r.Get(ctx, id); e != nil {
			return e
		}
		links, e := store.All[tagLinks](ctx, r.Store, "note_tags")
		if e != nil {
			return e
		}
		for _, link := range links {
			var ids []string
			for _, v := range link.IDs {
				if v != id {
					ids = append(ids, v)
				}
			}
			link.IDs = ids
			if e = r.Store.Put(ctx, "note_tags", link.NoteID, link); e != nil {
				return e
			}
		}
		return r.Store.Remove(ctx, "tags", id)
	})
}
