package schedule

import (
	"context"
	"time"
)

// Repository persists schedule rows.
type Repository interface {
	Get(ctx context.Context, noteID string) (Schedule, error)
	Upsert(ctx context.Context, s Schedule) error
	Delete(ctx context.Context, noteID string) error
	ListActive(ctx context.Context) ([]Schedule, error)
}

// Planner is the pure reminder plan. W1-RECURRENCE implements it.
// allDayTime is HH:MM in each rule's zone (default 09:00).
// One-offs use category focus-phase or reminder and ID one:<id>.
type Planner interface {
	Plan(q PlanQuery, subjects []PlanSubject, oneOffs []PendingOneOff, allDayTime string) ([]ReminderItem, error)
	Preview(rule Rule, limit int) (occurrences []time.Time, description string, err error)
	Occurrences(subjects []PlanSubject, from, to time.Time, includeCompleted bool, limit int) ([]Occurrence, error)
}
