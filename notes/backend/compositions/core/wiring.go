package core

import (
	"context"
	"fmt"

	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/focus"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/review"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
	"github.com/polterware/polterware/notes/backend/domains/settings"
	"github.com/polterware/polterware/notes/backend/domains/space"
	"github.com/polterware/polterware/notes/backend/domains/tag"
	"github.com/polterware/polterware/notes/backend/platform/clock"
	"github.com/polterware/polterware/notes/backend/platform/ids"
	"github.com/polterware/polterware/notes/backend/platform/runstate"
	"github.com/polterware/polterware/notes/backend/platform/token"
	"github.com/polterware/polterware/notes/backend/providers/sqlite"
)

// Runtime owns provider resources. Close is called after HTTP handlers have stopped.
type Runtime struct {
	Services Services
	MCP      MCP
	Close    func() error
}

// OpenRuntime binds SQLite repositories to domain services. Attachment bytes
// stay unavailable until W1-ATTACH.
func OpenRuntime(_ context.Context, dbPath string) (Runtime, error) {
	store, err := sqlite.Open(dbPath)
	if err != nil {
		return Runtime{}, fmt.Errorf("open sqlite: %w", err)
	}
	attachmentSvc := attachmentMeta{store: store.Attachments()}
	if _, err := attachmentSvc.service(); err != nil {
		_ = store.Close()
		return Runtime{}, fmt.Errorf("initialize attachments: %w", err)
	}
	searchSvc := WireSearch(store)
	clk := clock.Clock{}
	idgen := ids.Generator{}
	audit := activity.Audit{Repository: store.Activity(), Transactions: store, Clock: clk, IDs: idgen}
	planner := schedule.Engine{Clock: clk}
	settingsRepo := publicSettings{store.Settings()}
	settingsSvc := settings.NewService(settingsRepo, audit)
	notes := note.NewService(store.Notes(), store.Spaces(), store.Tags(), store.Schedules(), planner, audit)
	sched := scheduleRuntime{
		clock: clk, audit: audit, notes: store.Notes(), spaces: store.Spaces(),
		schedules: store.Schedules(), planner: planner, settings: settingsSvc, complete: notes,
	}
	remind := reminderService{
		repo: store.Reminders(), clock: clk, ids: idgen, audit: audit, planner: planner,
		schedules: sched, settings: settingsSvc, complete: notes,
	}
	doc, err := settingsSvc.Get(context.Background())
	if err != nil {
		_ = store.Close()
		return Runtime{}, fmt.Errorf("load settings: %w", err)
	}
	stable, err := token.LoadOrMint(runstate.TokenPath(dbPath))
	if err != nil {
		_ = store.Close()
		return Runtime{}, fmt.Errorf("load MCP token: %w", err)
	}
	services := Services{
		Notes:    notes,
		Spaces:   space.NewService(store.Spaces(), store.Notes(), audit),
		Tags:     tag.NewService(store.Tags(), audit),
		Focus:    focus.NewService(store.Focus(), store.Settings(), store.Notes(), audit),
		Review:   review.NewService(store.Review()),
		Activity: activity.NewService(store.Activity()),
		Settings: settingsSvc,
		Places: placeService{
			repo: store.Places(), notes: store.Notes(), clock: clk, audit: audit,
		},
		Attachments: attachmentSvc,
		Reminders:   remind,
		Agents:      agentService{settings: settingsSvc, tokenPath: runstate.TokenPath(dbPath), audit: audit},
		Maintenance: maintenanceService{
			store: store, spaces: store.Spaces(), notes: store.Notes(), tags: store.Tags(),
			schedules: store.Schedules(), places: store.Places(), attachments: store.Attachments(),
			activity: store.Activity(), settings: settingsSvc, clock: clk,
		},
		Schedules:      sched,
		ScheduleReader: store.Schedules(),
		PlaceReader:    store.Places(),
		Changes:        liveFeed{bus: store.Changes()},
		Search:         searchSvc,
	}
	bound, err := bindMCP(services, stable, doc.AgentsMCPPort, doc.AgentsMCPEnabled, "")
	if err != nil {
		_ = store.Close()
		return Runtime{}, fmt.Errorf("bind MCP: %w", err)
	}
	return Runtime{Services: services, MCP: bound, Close: store.Close}, nil
}
