package savedfilter

import "context"

// Repository persists saved filters.
// Save inserts f, or, when (surface, name) already exists, replaces its payload and
// updated_at while keeping id, position and created_at. New filters go last on the surface.
type Repository interface {
	List(ctx context.Context, surface string) ([]SavedFilter, error)
	Save(ctx context.Context, f SavedFilter) (SavedFilter, error)
	Delete(ctx context.Context, id string) error
}

// Service is the saved filter use-case port.
type Service interface {
	List(ctx context.Context, surface string) ([]SavedFilter, error)
	Save(ctx context.Context, surface, name, payloadJSON string) (SavedFilter, error)
	Delete(ctx context.Context, id string) error
}
