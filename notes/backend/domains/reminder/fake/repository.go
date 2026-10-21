package fake

import (
	"context"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/reminder"
)

// Repository is a repository-port skeleton. Methods panic until W1 replaces them.
type Repository struct{}

var _ reminder.Repository = (*Repository)(nil)

func (*Repository) ListDue(context.Context, time.Time, time.Time) ([]reminder.OneOff, error) {
	panic("reminder/fake: not implemented")
}

func (*Repository) Insert(context.Context, reminder.OneOff) error {
	panic("reminder/fake: not implemented")
}

func (*Repository) Delete(context.Context, string) error {
	panic("reminder/fake: not implemented")
}

func (*Repository) Prune(context.Context, time.Time) error {
	panic("reminder/fake: not implemented")
}

func (*Repository) SetHeartbeat(context.Context, time.Time, string, int) error {
	panic("reminder/fake: not implemented")
}

func (*Repository) LastSeen(context.Context) (time.Time, string, int, bool, error) {
	panic("reminder/fake: not implemented")
}
