package fake

import (
	"context"

	"github.com/polterware/polterware/notes/backend/domains/tx"
)

// Manager is a repository-port skeleton. Methods panic until W1 replaces them.
type Manager struct{}

var _ tx.Manager = Manager{}

func (Manager) Within(context.Context, func(context.Context) error) error {
	panic("tx/fake: not implemented")
}
