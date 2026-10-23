package reminder

import (
	"context"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/schedule"
)

// Repository persists reminder_oneoffs. Rows older than one day are pruned by maintenance.
type Repository interface {
	ListDue(ctx context.Context, from, to time.Time) ([]OneOff, error)
	Insert(ctx context.Context, o OneOff) error
	Delete(ctx context.Context, id string) error
	Prune(ctx context.Context, before time.Time) error
	SetHeartbeat(ctx context.Context, at time.Time, authorization string, armed int) error
	LastSeen(ctx context.Context) (at time.Time, authorization string, armed int, ok bool, err error)
}

// Service is the reminder use-case port. Plan delegates to schedule.Planner.
type Service interface {
	Plan(ctx context.Context, q schedule.PlanQuery) ([]schedule.ReminderItem, error)
	Ack(ctx context.Context, id, outcome string) error
	Snooze(ctx context.Context, noteID string, occurrenceAt time.Time, minutes int) (OneOff, error)
	ArmOneOff(ctx context.Context, kind, noteID string, fireAt time.Time, title, body string) (OneOff, error)
	CancelOneOff(ctx context.Context, id string) error
	Heartbeat(ctx context.Context, hb Heartbeat) (time.Time, error)
	Status(ctx context.Context) (Status, error)
}
