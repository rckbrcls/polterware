package core

import (
	"context"
	"strconv"
	"strings"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/clock"
	"github.com/polterware/polterware/notes/backend/domains/ids"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/reminder"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
	"github.com/polterware/polterware/notes/backend/domains/settings"
)

type reminderService struct {
	repo      reminder.Repository
	clock     clock.Clock
	ids       ids.Generator
	audit     activity.Audit
	planner   schedule.Planner
	schedules scheduleRuntime
	settings  settings.Service
	complete  note.Service
}

func (s reminderService) query(ctx context.Context, q schedule.PlanQuery) (schedule.PlanQuery, string, error) {
	if q.Now.IsZero() {
		q.Now = s.clock.Now().UTC()
	}
	allDay, err := s.schedules.allDay(ctx)
	if err != nil {
		return q, "", err
	}
	return q, allDay, nil
}

func (s reminderService) subjectsAndOneOffs(ctx context.Context, q schedule.PlanQuery) ([]schedule.PlanSubject, []schedule.PendingOneOff, error) {
	subjects, err := s.schedules.subjects(ctx)
	if err != nil {
		return nil, nil, err
	}
	horizon := q.Horizon
	if horizon == 0 {
		horizon = schedule.DefaultHorizon
	}
	due, err := s.repo.ListDue(ctx, q.Now, q.Now.Add(horizon))
	if err != nil {
		return nil, nil, err
	}
	oneOffs := make([]schedule.PendingOneOff, 0, len(due))
	for _, o := range due {
		item := schedule.PendingOneOff{ID: o.ID, Kind: o.Kind, FireAt: o.FireAt, Title: o.Title, Body: o.Body}
		if o.NoteID != nil {
			item.NoteID = *o.NoteID
		}
		oneOffs = append(oneOffs, item)
	}
	return subjects, oneOffs, nil
}

func (s reminderService) Plan(ctx context.Context, q schedule.PlanQuery) ([]schedule.ReminderItem, error) {
	q, allDay, err := s.query(ctx, q)
	if err != nil {
		return nil, err
	}
	_ = s.repo.Prune(ctx, q.Now.Add(-24*time.Hour))
	subjects, oneOffs, err := s.subjectsAndOneOffs(ctx, q)
	if err != nil {
		return nil, err
	}
	return s.planner.Plan(q, subjects, oneOffs, allDay)
}

func (s reminderService) Ack(ctx context.Context, id, outcome string) error {
	switch outcome {
	case reminder.AckDelivered, reminder.AckOpened:
		return nil
	case reminder.AckDone:
	default:
		return invalid("outcome", "must be delivered, opened, or done")
	}
	if strings.HasPrefix(id, "one:") {
		return s.deleteOneOff(ctx, strings.TrimPrefix(id, "one:"), "Complete one-off reminder")
	}
	noteID, rest, ok := strings.Cut(strings.TrimPrefix(id, "rem:"), ":")
	if !ok || !strings.HasPrefix(id, "rem:") {
		return invalid("id", "unknown reminder identifier")
	}
	if rest == "repeat" || strings.HasPrefix(rest, "wd") {
		return invalid("id", "repeating reminders must complete by occurrence_at")
	}
	ms, err := strconv.ParseInt(rest, 10, 64)
	if err != nil {
		return invalid("id", "unknown reminder identifier")
	}
	at := time.UnixMilli(ms).UTC()
	_, err = s.complete.SetStatus(ctx, caller(ctx), noteID, 0, note.StatusCompleted, &at)
	return err
}

func (s reminderService) Snooze(ctx context.Context, noteID string, occurrenceAt time.Time, minutes int) (reminder.OneOff, error) {
	if noteID == "" {
		return reminder.OneOff{}, invalid("note_id", "required")
	}
	if minutes <= 0 {
		doc, err := s.settings.Get(ctx)
		if err != nil {
			return reminder.OneOff{}, err
		}
		minutes = doc.NotificationsSnoozeMinutes
	}
	if minutes < 1 || minutes > 1440 {
		return reminder.OneOff{}, invalid("minutes", "must be between 1 and 1440")
	}
	m, err := s.schedules.notes.Get(ctx, noteID)
	if err != nil {
		return reminder.OneOff{}, err
	}
	return s.insertOneOff(ctx, reminder.KindSnooze, &noteID, s.clock.Now().UTC().Add(time.Duration(minutes)*time.Minute), m.Title, "")
}

func (s reminderService) ArmOneOff(ctx context.Context, kind, noteID string, fireAt time.Time, title, body string) (reminder.OneOff, error) {
	if kind != reminder.KindFocusPhase && kind != reminder.KindSnooze {
		return reminder.OneOff{}, invalid("kind", "must be focus_phase or snooze")
	}
	if fireAt.IsZero() {
		return reminder.OneOff{}, invalid("fire_at", "required")
	}
	var mid *string
	if noteID != "" {
		if _, err := s.schedules.notes.Get(ctx, noteID); err != nil {
			return reminder.OneOff{}, err
		}
		mid = &noteID
	}
	return s.insertOneOff(ctx, kind, mid, fireAt.UTC(), title, body)
}

func (s reminderService) insertOneOff(ctx context.Context, kind string, noteID *string, fireAt time.Time, title, body string) (reminder.OneOff, error) {
	o := reminder.OneOff{ID: s.ids.New(), Kind: kind, NoteID: noteID, FireAt: fireAt.Truncate(time.Millisecond), Title: title, Body: body, CreatedAt: s.clock.Now().UTC()}
	err := s.audit.Write(ctx, caller(ctx), "reminder", o.ID, activity.OpCreate, "Arm one-off reminder", func(ctx context.Context) error {
		return s.repo.Insert(ctx, o)
	})
	if err != nil {
		return reminder.OneOff{}, err
	}
	return o, nil
}

func (s reminderService) CancelOneOff(ctx context.Context, id string) error {
	id = strings.TrimPrefix(id, "one:")
	return s.deleteOneOff(ctx, id, "Cancel one-off reminder")
}

func (s reminderService) deleteOneOff(ctx context.Context, id, summary string) error {
	return s.audit.Write(ctx, caller(ctx), "reminder", id, activity.OpDelete, summary, func(ctx context.Context) error {
		return s.repo.Delete(ctx, id)
	})
}

func (s reminderService) Heartbeat(ctx context.Context, hb reminder.Heartbeat) (time.Time, error) {
	switch hb.Authorization {
	case reminder.PermAuthorized, reminder.PermDenied, reminder.PermNotDetermined, "":
	default:
		return time.Time{}, invalid("authorization", "unknown notifier permission")
	}
	if hb.ArmedCount < 0 || hb.ArmedCount > schedule.DefaultBudget {
		return time.Time{}, invalid("armed_count", "must be between 0 and 60")
	}
	at := s.clock.Now().UTC()
	if err := s.repo.SetHeartbeat(ctx, at, hb.Authorization, hb.ArmedCount); err != nil {
		return time.Time{}, err
	}
	return at, nil
}

func (s reminderService) Status(ctx context.Context) (reminder.Status, error) {
	items, err := s.Plan(ctx, schedule.PlanQuery{})
	if err != nil {
		return reminder.Status{}, err
	}
	at, auth, armed, ok, err := s.repo.LastSeen(ctx)
	if err != nil {
		return reminder.Status{}, err
	}
	out := reminder.Status{Planned: len(items), Permission: reminder.PermNotDetermined}
	if ok {
		out.Armed = armed
		out.NotifierLastSeenAt = &at
		if auth != "" {
			out.Permission = auth
		}
	}
	return out, nil
}
