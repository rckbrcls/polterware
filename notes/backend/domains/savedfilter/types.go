// Package savedfilter is the saved filter domain: named filter combinations per UI surface.
// Saved filters are UI preferences, so writes are not recorded in the activity log.
package savedfilter

import "time"

// SavedFilter is one named filter for a surface such as "notes.library".
// PayloadJSON is opaque UI JSON; the core checks only its envelope.
type SavedFilter struct {
	ID          string
	Surface     string
	Name        string
	PayloadJSON string
	Position    int
	CreatedAt   time.Time
	UpdatedAt   time.Time
}
