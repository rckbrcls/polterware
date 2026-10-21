// Package note is the note, checklist, and completion domain.
package note

import "time"

const (
	StatusActive    = "active"
	StatusCompleted = "completed"

	OrderUpdated = "updated"
	OrderDue     = "due"
	OrderManual  = "manual"
	OrderCreated = "created"

	BulkComplete = "complete"
	BulkReopen   = "reopen"
	BulkPin      = "pin"
	BulkUnpin    = "unpin"
	BulkMove     = "move"
	BulkTag      = "tag"
	BulkUntag    = "untag"
	BulkDelete   = "delete"
)

// Note is one note row. A nil SpaceID is Inbox.
// Priority nil means none. 0 is reserved. 1 is low and 3 is high.
type Note struct {
	ID                      string
	SpaceID                 *string
	Title                   string
	Content                 string
	Status                  string
	Pinned                  bool
	Priority                *int
	DueAt                   *time.Time
	DueAllDay               bool
	SortOrder               int
	AutoCompleteOnChecklist bool
	CompletedAt             *time.Time
	CreatedAt               time.Time
	UpdatedAt               time.Time
	Rev                     int64
}

// CheckItem is one checklist row. Items have no rev of their own.
type CheckItem struct {
	ID          string
	NoteID      string
	Title       string
	Detail      string
	Done        bool
	SortOrder   int
	CompletedAt *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// CheckItemInput is a checklist write. An empty ID means create.
type CheckItemInput struct {
	ID        string
	Title     string
	Detail    string
	Done      bool
	SortOrder int
}

// Completion records one finished occurrence of a recurring note.
type Completion struct {
	ID           string
	NoteID       string
	OccurrenceAt time.Time
	CompletedAt  time.Time
}

// Summary is the list shape. Snippet is at most 120 characters.
type Summary struct {
	ID            string
	Title         string
	Status        string
	SpaceID       *string
	DueAt         *time.Time
	DueAllDay     bool
	Pinned        bool
	Priority      *int
	TagIDs        []string
	ScheduleLabel string
	Snippet       string
	Rev           int64
	UpdatedAt     time.Time
	CreatedAt     time.Time
	SortOrder     int
}

// Include selects relations loaded by Get.
type Include struct {
	Content     bool
	Checklist   bool
	Completions bool
	Tags        bool
}

// GetResult is a note plus the relations Include asked for.
type GetResult struct {
	Note        Note
	Checklist   []CheckItem
	TagIDs      []string
	Completions []Completion
}

// ListFilter is NoteService.List. Limit default 50, max 500.
// Query is an FTS query. Order is updated, due, manual, or created.
type ListFilter struct {
	SpaceID            *string
	IncludeDescendants bool
	InboxOnly          bool
	Status             string
	Pinned             *bool
	TagIDs             []string
	DueFrom            *time.Time
	DueTo              *time.Time
	UpdatedFrom        *time.Time
	UpdatedTo          *time.Time
	HasSchedule        *bool
	HasPlace           *bool
	Query              string
	Order              string
	Limit              int
	Cursor             string
}

// ListPage is one page of summaries.
type ListPage struct {
	Notes      []Summary
	NextCursor string
	Total      int
}

// Create is the input for a new note.
type Create struct {
	SpaceID                 *string
	Title                   string
	Content                 string
	Pinned                  bool
	Priority                *int
	DueAt                   *time.Time
	DueAllDay               bool
	SortOrder               int
	AutoCompleteOnChecklist bool
	TagIDs                  []string
	Checklist               []CheckItemInput
}

// Patch sets the fields that are non-nil. Clear flags write NULL.
type Patch struct {
	Title                   *string
	Content                 *string
	SpaceID                 *string
	ClearSpaceID            bool
	Priority                *int
	ClearPriority           bool
	DueAt                   *time.Time
	ClearDueAt              bool
	DueAllDay               *bool
	SortOrder               *int
	Pinned                  *bool
	AutoCompleteOnChecklist *bool
}

// BulkAction applies one action to many notes.
// Action is complete, reopen, pin, unpin, move, tag, untag, or delete.
type BulkAction struct {
	IDs     []string
	Action  string
	SpaceID *string
	TagIDs  []string
}

// BulkItemResult is the outcome of one id in a bulk action.
type BulkItemResult struct {
	ID  string
	Err error
}
