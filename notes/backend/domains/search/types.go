// Package search is the full-text search port.
package search

import "time"

// Document is one note_fts row. Note and checklist are plain text.
type Document struct {
	NoteID    string
	Title     string
	Content   string
	Checklist string
	Tags      string
	Space     string
}

// Hit is one ranked search result.
type Hit struct {
	NoteID    string
	Title     string
	Score     float64
	Snippet   string
	MatchedIn []string
}

// Filter narrows search before ranking.
type Filter struct {
	SpaceID            *string
	IncludeDescendants bool
	TagIDs             []string
	Status             string
	DueFrom            *time.Time
	DueTo              *time.Time
	UpdatedFrom        *time.Time
	UpdatedTo          *time.Time
	Limit              int
}

// Result is SearchService.Search.
type Result struct {
	Hits   []Hit
	Notice string
}

// Status is the full-text index state shown in Settings.
type Status struct {
	FTSDocuments int
}
