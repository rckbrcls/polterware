package tag

import (
	"context"
	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"strings"
)

type service struct {
	repo  Repository
	audit activity.Audit
}

func NewService(r Repository, a activity.Audit) Service    { return &service{r, a} }
func (s *service) List(ctx context.Context) ([]Tag, error) { return s.repo.List(ctx) }
func ResolveName(ctx context.Context, r Repository, name string) (Tag, error) {
	rows, e := r.List(ctx)
	if e != nil {
		return Tag{}, e
	}
	names := map[string]string{}
	for _, v := range rows {
		names[v.ID] = v.Name
	}
	id, e := activity.Lookup(name, names)
	if e != nil {
		return Tag{}, e
	}
	return r.Get(ctx, id)
}
func (s *service) validate(ctx context.Context, t Tag) error {
	if e := activity.ValidateName("name", t.Name, 60); e != nil {
		return e
	}
	if e := activity.ValidateColor(t.Color); e != nil {
		return e
	}
	other, e := s.repo.GetByName(ctx, t.Name)
	if e == nil && other.ID != t.ID {
		return fault.Exists("tag", other.ID)
	}
	if e != nil && !fault.IsCode(e, fault.CodeNotFound) {
		return e
	}
	return nil
}
func (s *service) Create(ctx context.Context, a actor.Actor, name string, color *string) (out Tag, err error) {
	now := s.audit.Clock.Now().UTC()
	out = Tag{ID: s.audit.IDs.New(), Name: strings.TrimSpace(name), Color: color, CreatedAt: now, UpdatedAt: now, Rev: 1}
	err = s.audit.Write(ctx, a, "tag", out.ID, activity.OpCreate, "Create tag", func(ctx context.Context) error {
		if e := s.validate(ctx, out); e != nil {
			return e
		}
		return s.repo.Insert(ctx, out)
	})
	return
}
func (s *service) Update(ctx context.Context, a actor.Actor, id string, rev int64, p Patch) (out Tag, err error) {
	err = s.audit.Write(ctx, a, "tag", id, activity.OpUpdate, "Update tag", func(ctx context.Context) error {
		t, e := s.repo.Get(ctx, id)
		if e != nil {
			return e
		}
		if rev != 0 && rev != t.Rev {
			return fault.Conflict("tag", id, t.Rev, t)
		}
		if p.ClearColor && p.Color != nil {
			return activity.Invalid("color", "cannot set and clear")
		}
		if p.Name != nil {
			t.Name = strings.TrimSpace(*p.Name)
		}
		if p.ClearColor {
			t.Color = nil
		} else if p.Color != nil {
			t.Color = p.Color
		}
		if e = s.validate(ctx, t); e != nil {
			return e
		}
		old := t.Rev
		t.Rev++
		t.UpdatedAt = s.audit.Clock.Now().UTC()
		if e = s.repo.Update(ctx, old, t); e != nil {
			return e
		}
		out = t
		return nil
	})
	return
}
func (s *service) Delete(ctx context.Context, a actor.Actor, id string) error {
	return s.audit.Write(ctx, a, "tag", id, activity.OpDelete, "Delete tag", func(ctx context.Context) error { return s.repo.Delete(ctx, id) })
}
func (s *service) Merge(ctx context.Context, a actor.Actor, source, target string) (out MergeResult, err error) {
	if source == target {
		return out, activity.Invalid("target_id", "cannot merge a tag into itself")
	}
	err = s.audit.Write(ctx, a, "tag", source, activity.OpDelete, "Merge tag", func(ctx context.Context) error {
		t, e := s.repo.Get(ctx, target)
		if e != nil {
			return e
		}
		out.MovedNoteCount, e = s.repo.Retarget(ctx, source, target)
		if e != nil {
			return e
		}
		if e = s.repo.Delete(ctx, source); e != nil {
			return e
		}
		old := t.Rev
		t.Rev++
		t.UpdatedAt = s.audit.Clock.Now().UTC()
		if e = s.repo.Update(ctx, old, t); e != nil {
			return e
		}
		out.Target = t
		return nil
	})
	return
}
