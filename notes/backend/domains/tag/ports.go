package tag

import (
	"context"

	"github.com/polterware/polterware/notes/backend/domains/actor"
)

// Repository persists tags and note-tag links owned by the tag side.
// Retarget moves note_tags from one tag id to another.
type Repository interface {
	List(ctx context.Context) ([]Tag, error)
	Get(ctx context.Context, id string) (Tag, error)
	GetByName(ctx context.Context, name string) (Tag, error)
	Insert(ctx context.Context, t Tag) error
	Update(ctx context.Context, expectedRev int64, t Tag) error
	Delete(ctx context.Context, id string) error
	Retarget(ctx context.Context, fromID, toID string) (int, error)
	Names(ctx context.Context) ([]string, error)
}

// Service is the tag use-case port. W1-DOMAIN implements it.
type Service interface {
	List(ctx context.Context) ([]Tag, error)
	Create(ctx context.Context, actor actor.Actor, name string, color *string) (Tag, error)
	Update(ctx context.Context, actor actor.Actor, id string, expectedRev int64, patch Patch) (Tag, error)
	Delete(ctx context.Context, actor actor.Actor, id string) error
	Merge(ctx context.Context, actor actor.Actor, sourceID, targetID string) (MergeResult, error)
}
