package space

import (
	"context"

	"github.com/polterware/polterware/notes/backend/domains/actor"
)

// Repository persists spaces.
// Update succeeds only when the stored rev equals expectedRev, then stores m.Rev.
// expectedRev 0 skips the check.
type Repository interface {
	List(ctx context.Context) ([]Space, error)
	Get(ctx context.Context, id string) (Space, error)
	Insert(ctx context.Context, m Space) error
	Update(ctx context.Context, expectedRev int64, m Space) error
	// Delete succeeds only when expectedRev is 0 or equals the stored rev.
	Delete(ctx context.Context, expectedRev int64, id string) error
}

// Service is the space use-case port. W1-DOMAIN implements it.
type Service interface {
	List(ctx context.Context) ([]Space, error)
	Get(ctx context.Context, id string) (Space, error)
	Create(ctx context.Context, actor actor.Actor, in Create) (Space, error)
	Update(ctx context.Context, actor actor.Actor, id string, expectedRev int64, patch Patch) (Space, error)
	Delete(ctx context.Context, actor actor.Actor, id string, expectedRev int64) (DeleteResult, error)
	Reorder(ctx context.Context, actor actor.Actor, parentID *string, orderedIDs []string) ([]Space, error)
}
