// Package reminder stores one-off notifications that are not derived from a schedule.
package reminder

import "time"

const (
	KindFocusPhase = "focus_phase"
	KindSnooze     = "snooze"

	AckDelivered = "delivered"
	AckOpened    = "opened"
	AckDone      = "done"

	PermAuthorized    = "authorized"
	PermDenied        = "denied"
	PermNotDetermined = "not_determined"
)

// OneOff is a reminder_oneoffs row.
type OneOff struct {
	ID        string
	Kind      string
	NoteID    *string
	FireAt    time.Time
	Title     string
	Body      string
	CreatedAt time.Time
}

// Heartbeat is the notifier's authorization report.
type Heartbeat struct {
	Authorization string
	ArmedCount    int
}

// Status is the reminders chip.
type Status struct {
	Planned            int
	Armed              int
	NotifierLastSeenAt *time.Time
	Permission         string
}
