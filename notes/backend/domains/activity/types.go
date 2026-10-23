// Package activity is the append-only audit log.
package activity

import "time"

const (
	OpCreate   = "create"
	OpUpdate   = "update"
	OpDelete   = "delete"
	OpComplete = "complete"
	OpReopen   = "reopen"
)

// Event is one activity row. Actor is ui, cli, mcp:<clientName>, or system.
// The change stream uses create, update, and delete. complete and reopen are activity ops
// and also emit an update change for the entity.
type Event struct {
	ID       string
	At       time.Time
	Actor    string
	Entity   string
	EntityID string
	Op       string
	Summary  string
}

// Page is one cursor page, newest first.
type Page struct {
	Events     []Event
	NextCursor string
}
