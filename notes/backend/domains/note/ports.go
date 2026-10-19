package note

import (
	"context"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/actor"
)

// Repository persists notes, checklist rows, tag links, and completions.
// Update succeeds only when the stored rev equals expectedRev, then stores m.Rev.
// expectedRev 0 skips the check.
type Repository interface {
	List(ctx context.Context, filter ListFilter) (ListPage, error)
	Get(ctx context.Context, id string) (Note, error)
	Insert(ctx context.Context, m Note) error
	Update(ctx context.Context, expectedRev int64, m Note) error
	// Delete succeeds only when expectedRev is 0 or equals the stored rev.
	Delete(ctx context.Context, expectedRev int64, id string) error
	ListCheckItems(ctx context.Context, noteID string) ([]CheckItem, error)
	ReplaceCheckItems(ctx context.Context, noteID string, items []CheckItem) error
	GetCheckItem(ctx context.Context, id string) (CheckItem, error)
	UpdateCheckItem(ctx context.Context, item CheckItem) error
	ListTagIDs(ctx context.Context, noteID string) ([]string, error)
	SetTagIDs(ctx context.Context, noteID string, tagIDs []string) error
	ListCompletions(ctx context.Context, noteID string) ([]Completion, error)
	InsertCompletion(ctx context.Context, c Completion) error
	DeleteCompletion(ctx context.Context, noteID string, occurrenceAt time.Time) error
	CountBySpaces(ctx context.Context, spaceIDs []string) (int, error)
}

// Service is the note use-case port. W1-DOMAIN implements it.
// Schedule, place, and attachments are composed by the core on Get.
type Service interface {
	List(ctx context.Context, filter ListFilter) (ListPage, error)
	Get(ctx context.Context, id string, include Include) (GetResult, error)
	Create(ctx context.Context, actor actor.Actor, in Create) (Note, error)
	Update(ctx context.Context, actor actor.Actor, id string, expectedRev int64, patch Patch) (Note, error)
	Delete(ctx context.Context, actor actor.Actor, id string, expectedRev int64) error
	SetStatus(ctx context.Context, actor actor.Actor, id string, expectedRev int64, status string, occurrenceAt *time.Time) (Note, error)
	SetPinned(ctx context.Context, actor actor.Actor, id string, expectedRev int64, pinned bool) (Note, error)
	Reorder(ctx context.Context, actor actor.Actor, spaceID *string, orderedIDs []string) error
	ToggleCheckItem(ctx context.Context, actor actor.Actor, noteID, itemID string, expectedRev int64, done *bool) (CheckItem, error)
	ReplaceChecklist(ctx context.Context, actor actor.Actor, noteID string, expectedRev int64, items []CheckItemInput) ([]CheckItem, error)
	SetTags(ctx context.Context, actor actor.Actor, noteID string, expectedRev int64, tagIDs []string) error
	BulkAction(ctx context.Context, actor actor.Actor, action BulkAction) ([]BulkItemResult, error)
}
