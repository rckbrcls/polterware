// Package tag is the tag domain.
package tag

import "time"

// Tag is a label. Name comparison is case-insensitive.
type Tag struct {
	ID         string
	Name       string
	Color      *string
	UsageCount int
	CreatedAt  time.Time
	UpdatedAt  time.Time
	Rev        int64
}

// Patch sets the fields that are non-nil. ClearColor writes NULL.
type Patch struct {
	Name       *string
	Color      *string
	ClearColor bool
}

// MergeResult is the surviving tag after a merge.
type MergeResult struct {
	Target         Tag
	MovedNoteCount int
}
