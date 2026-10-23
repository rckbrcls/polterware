package focus

import (
	"context"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/actor"
)

// Repository persists focus sessions. Defaults live in settings.
type Repository interface {
	InsertSession(ctx context.Context, s Session) error
	ListSessions(ctx context.Context, from, to time.Time) ([]Session, error)
}

// Service is the focus use-case port.
type Service interface {
	GetDefaults(ctx context.Context) (Defaults, error)
	SetDefaults(ctx context.Context, actor actor.Actor, d Defaults) (Defaults, error)
	RecordSession(ctx context.Context, actor actor.Actor, s Session) (Session, error)
	ListSessions(ctx context.Context, from, to time.Time) ([]Session, error)
}
