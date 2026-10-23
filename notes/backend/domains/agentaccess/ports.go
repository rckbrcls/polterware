package agentaccess

import (
	"context"

	"github.com/polterware/polterware/notes/backend/domains/actor"
)

// Service is the agent-access use-case port. The token file lives outside SQLite.
type Service interface {
	GetInfo(ctx context.Context) (Info, error)
	RotateToken(ctx context.Context, actor actor.Actor) (string, error)
	SetEnabled(ctx context.Context, actor actor.Actor, enabled bool) error
	SetAllowFileAttach(ctx context.Context, actor actor.Actor, allow bool) error
}
