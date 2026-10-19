package fake

import (
	"time"

	"github.com/polterware/polterware/notes/backend/domains/clock"
)

// Clock is a repository-port skeleton. Methods panic until W1 replaces them.
type Clock struct{}

var _ clock.Clock = Clock{}

func (Clock) Now() time.Time { panic("clock/fake: not implemented") }
