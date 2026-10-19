package fake

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"sort"
)

type Repository struct{ Store *Store }

func New(s *Store) *Repository { return &Repository{s} }

var _ activity.Repository = (*Repository)(nil)

func (r *Repository) Append(ctx context.Context, v activity.Event) error {
	return r.Store.Within(ctx, func(ctx context.Context) error {
		_, ok, err := Read[activity.Event](ctx, r.Store, "activity", v.ID)
		if err != nil {
			return err
		}
		if ok {
			return fault.Exists("activity", v.ID)
		}
		return r.Store.Put(ctx, "activity", v.ID, v)
	})
}
func eventLess(a, b activity.Event) bool {
	if !a.At.Equal(b.At) {
		return a.At.After(b.At)
	}
	return a.ID > b.ID
}
func (r *Repository) List(ctx context.Context, cursor, actor string, limit int) (activity.Page, error) {
	all, err := All[activity.Event](ctx, r.Store, "activity")
	if err != nil {
		return activity.Page{}, err
	}
	var last activity.Event
	if cursor != "" {
		b, e := base64.RawURLEncoding.DecodeString(cursor)
		if e != nil || json.Unmarshal(b, &last) != nil {
			return activity.Page{}, fault.Invalid(fault.Violation{Field: "cursor", Reason: "invalid cursor"})
		}
	}
	out := []activity.Event{}
	for _, v := range all {
		if (actor == "" || v.Actor == actor) && (cursor == "" || eventLess(last, v)) {
			out = append(out, v)
		}
	}
	sort.Slice(out, func(i, j int) bool { return eventLess(out[i], out[j]) })
	if limit == 0 {
		limit = 50
	}
	if limit < 1 || limit > 500 {
		return activity.Page{}, fault.Invalid(fault.Violation{Field: "limit", Reason: "out of range"})
	}
	p := activity.Page{Events: out}
	if len(out) > limit {
		b, _ := json.Marshal(out[limit-1])
		p.NextCursor = base64.RawURLEncoding.EncodeToString(b)
		p.Events = out[:limit]
	}
	return p, nil
}
