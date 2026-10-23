package fake

import (
	"context"

	"github.com/polterware/polterware/notes/backend/domains/maintenance"
)

// Archiver is a repository-port skeleton. Methods panic until W1 replaces them.
type Archiver struct{}

var _ maintenance.Archiver = (*Archiver)(nil)

func (*Archiver) Backup(context.Context, string) (int64, error) {
	panic("maintenance/fake: not implemented")
}
