package sqlite

import (
	"context"
	"embed"
	"fmt"
	"sync"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/attachments"
	"github.com/polterware/polterware/notes/backend/domains/focus"
	"github.com/polterware/polterware/notes/backend/domains/maintenance"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/place"
	"github.com/polterware/polterware/notes/backend/domains/reminder"
	"github.com/polterware/polterware/notes/backend/domains/review"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
	"github.com/polterware/polterware/notes/backend/domains/search"
	"github.com/polterware/polterware/notes/backend/domains/settings"
	"github.com/polterware/polterware/notes/backend/domains/space"
	"github.com/polterware/polterware/notes/backend/domains/tag"
	"github.com/polterware/polterware/notes/backend/domains/tx"
	"github.com/polterware/polterware/notes/backend/platform/changes"
	"github.com/polterware/polterware/notes/backend/platform/db"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

// Store is one SQLite database plus optional search.Index and change broadcaster.
type Store struct {
	h     *db.Handle
	bus   *changes.Broadcaster
	index search.Index

	hbMu sync.Mutex
	hb   struct {
		at            time.Time
		authorization string
		armed         int
		ok            bool
	}
}

type (
	Spaces      struct{ *Store }
	Notes       struct{ *Store }
	Tags        struct{ *Store }
	Schedules   struct{ *Store }
	Places      struct{ *Store }
	Attachments struct{ *Store }
	Focus       struct{ *Store }
	Activity    struct{ *Store }
	Settings    struct{ *Store }
	Reminders   struct{ *Store }
	Review      struct{ *Store }
)

var (
	_ tx.Manager           = (*Store)(nil)
	_ space.Repository     = Spaces{}
	_ note.Repository      = Notes{}
	_ tag.Repository       = Tags{}
	_ schedule.Repository  = Schedules{}
	_ place.Repository     = Places{}
	_ attachments.Store    = Attachments{}
	_ focus.Repository     = Focus{}
	_ activity.Repository  = Activity{}
	_ settings.Repository  = Settings{}
	_ reminder.Repository  = Reminders{}
	_ review.Reader        = Review{}
	_ maintenance.Archiver = (*Store)(nil)
)

func Open(path string) (*Store, error) {
	return OpenWith(path, changes.New(), nil)
}

func OpenWith(path string, bus *changes.Broadcaster, index search.Index) (*Store, error) {
	h, err := db.Open(path)
	if err != nil {
		return nil, err
	}
	ctx := context.Background()
	if err := db.Migrate(ctx, h, migrationFS, "migrations"); err != nil {
		_ = h.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	if bus == nil {
		bus = changes.New()
	}
	h.BindBroadcaster(bus)
	return &Store{h: h, bus: bus, index: index}, nil
}

func (s *Store) Close() error                  { return s.h.Close() }
func (s *Store) Handle() *db.Handle            { return s.h }
func (s *Store) Changes() *changes.Broadcaster { return s.bus }
func (s *Store) SetIndex(index search.Index)   { s.index = index }
func (s *Store) Spaces() Spaces                { return Spaces{s} }
func (s *Store) Notes() Notes                  { return Notes{s} }
func (s *Store) Tags() Tags                    { return Tags{s} }
func (s *Store) Schedules() Schedules          { return Schedules{s} }
func (s *Store) Places() Places                { return Places{s} }
func (s *Store) Attachments() Attachments      { return Attachments{s} }
func (s *Store) Focus() Focus                  { return Focus{s} }
func (s *Store) Activity() Activity            { return Activity{s} }
func (s *Store) Settings() Settings            { return Settings{s} }
func (s *Store) Reminders() Reminders          { return Reminders{s} }
func (s *Store) Review() Review                { return Review{s} }

func (s *Store) Within(ctx context.Context, fn func(context.Context) error) error {
	return s.h.Within(ctx, fn)
}

func (s *Store) q(ctx context.Context, write bool) db.Querier {
	return s.h.Q(ctx, write)
}
