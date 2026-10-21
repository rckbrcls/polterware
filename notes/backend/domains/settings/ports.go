package settings

import (
	"context"

	"github.com/polterware/polterware/notes/backend/domains/actor"
)

// Repository stores raw JSON values by key.
type Repository interface {
	Get(ctx context.Context, key string) (valueJSON string, ok bool, err error)
	Set(ctx context.Context, key, valueJSON string) error
	List(ctx context.Context) (map[string]string, error)
}

// Service is the settings use-case port.
// Set writes only the named keys and returns the effective document.
type Service interface {
	Get(ctx context.Context) (Settings, error)
	Set(ctx context.Context, actor actor.Actor, keys []string, next Settings) (Settings, error)
}
