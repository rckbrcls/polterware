package fake

import (
	"context"

	"github.com/polterware/polterware/notes/backend/domains/schedule"
)

// Repository is a repository-port skeleton. Methods panic until W1 replaces them.
type Repository struct{}

var _ schedule.Repository = (*Repository)(nil)

func (*Repository) Get(context.Context, string) (schedule.Schedule, error) {
	panic("schedule/fake: not implemented")
}

func (*Repository) Upsert(context.Context, schedule.Schedule) error {
	panic("schedule/fake: not implemented")
}

func (*Repository) Delete(context.Context, string) error {
	panic("schedule/fake: not implemented")
}

func (*Repository) ListActive(context.Context) ([]schedule.Schedule, error) {
	panic("schedule/fake: not implemented")
}
