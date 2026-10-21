// Package space is the space-tree domain.
package space

import "time"

// Space is one node. A nil ParentID is a root.
type Space struct {
	ID        string
	ParentID  *string
	Name      string
	Color     *string
	Icon      *string
	SortOrder int
	CreatedAt time.Time
	UpdatedAt time.Time
	Rev       int64
}

// Patch sets the fields that are non-nil. Clear flags write NULL.
type Patch struct {
	Name        *string
	ParentID    *string
	ClearParent bool
	Color       *string
	ClearColor  bool
	Icon        *string
	ClearIcon   bool
	SortOrder   *int
}

// Create is the input for a new space.
type Create struct {
	ParentID  *string
	Name      string
	Color     *string
	Icon      *string
	SortOrder int
}

// DeleteResult is the effect of deleting a space.
// Descendants are deleted. Notes that pointed at them move to Inbox.
type DeleteResult struct {
	DeletedSpaceIDs []string
	MovedNoteCount  int
}
