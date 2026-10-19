package fake

import (
	"context"
	store "github.com/polterware/polterware/notes/backend/domains/activity/fake"
	"github.com/polterware/polterware/notes/backend/domains/settings"
)

type Repository struct{ Store *store.Store }

func New(s *store.Store) *Repository { return &Repository{s} }

var _ settings.Repository = (*Repository)(nil)

func (r *Repository) Get(ctx context.Context, key string) (string, bool, error) {
	return store.Read[string](ctx, r.Store, "settings", key)
}
func (r *Repository) Set(ctx context.Context, key, value string) error {
	return r.Store.Put(ctx, "settings", key, value)
}
func (r *Repository) List(ctx context.Context) (map[string]string, error) {
	return store.Map[string](ctx, r.Store, "settings")
}
