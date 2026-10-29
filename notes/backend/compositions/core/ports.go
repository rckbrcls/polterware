package core

import (
	"context"
	"net/http"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/agentaccess"
	"github.com/polterware/polterware/notes/backend/domains/attachments"
	"github.com/polterware/polterware/notes/backend/domains/focus"
	"github.com/polterware/polterware/notes/backend/domains/maintenance"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/place"
	"github.com/polterware/polterware/notes/backend/domains/reminder"
	"github.com/polterware/polterware/notes/backend/domains/review"
	"github.com/polterware/polterware/notes/backend/domains/savedfilter"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
	"github.com/polterware/polterware/notes/backend/domains/search"
	"github.com/polterware/polterware/notes/backend/domains/settings"
	"github.com/polterware/polterware/notes/backend/domains/space"
	"github.com/polterware/polterware/notes/backend/domains/tag"
)

// Services is the composition boundary; handlers never access a database directly.
type Services struct {
	Notes          note.Service
	Spaces         space.Service
	Tags           tag.Service
	Focus          focus.Service
	Review         review.Service
	Activity       activity.Service
	Settings       settings.Service
	SavedFilters   savedfilter.Service
	Places         place.Service
	Attachments    attachments.Service
	Search         search.Service
	Reminders      reminder.Service
	Agents         agentaccess.Service
	Maintenance    maintenance.Service
	Schedules      ScheduleUseCases
	ScheduleReader schedule.Repository
	PlaceReader    place.Repository
	Changes        ChangeFeed
}

// ScheduleUseCases is the orchestration seam missing from the frozen schedule ports.
// Implementations must use domain services / transaction ports, not handler-side SQL.
type ScheduleUseCases interface {
	Set(context.Context, actor.Actor, schedule.Schedule) (schedule.Schedule, error)
	Clear(context.Context, actor.Actor, string) error
	Preview(context.Context, schedule.Schedule, int) ([]time.Time, string, error)
	ListOccurrences(context.Context, OccurrenceQuery) ([]schedule.Occurrence, error)
	CompleteOccurrence(context.Context, actor.Actor, string, time.Time) (note.Completion, error)
	ReopenOccurrence(context.Context, actor.Actor, string, time.Time) error
	SetFocusRecipe(context.Context, actor.Actor, string, schedule.FocusRecipe) (schedule.Schedule, error)
}
type OccurrenceQuery struct {
	From, To           time.Time
	SpaceID            *string
	IncludeDescendants bool
	TagIDs             []string
	IncludeCompleted   bool
	Limit              int
}

type Change struct{ Entity, ID, Op string }
type ChangeEvent struct {
	Seq     int64
	Changes []Change
}

// Subscription atomically captures the replay boundary and subscribes to live events.
// Events includes replay > since followed by live events in increasing seq order.
// Err reports slow-consumer overflow / closure; Close must be safe to call once.
type Subscription struct {
	Snapshot int64
	Events   <-chan ChangeEvent
	Err      func() error
	Close    func()
}
type ChangeFeed interface {
	Subscribe(context.Context, int64) (Subscription, error)
}

// MCP mounts a separately authenticated provider; it never inherits the UI bearer.
type MCP struct {
	Handler http.Handler
	Token   string
	Port    int
	Enabled bool
}
