package core

import (
	"context"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/clock"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
	"github.com/polterware/polterware/notes/backend/domains/settings"
	"github.com/polterware/polterware/notes/backend/domains/space"
)

type scheduleRuntime struct {
	clock     clock.Clock
	audit     activity.Audit
	notes     note.Repository
	spaces    space.Repository
	schedules schedule.Repository
	planner   schedule.Planner
	settings  settings.Service
	complete  note.Service
}

func loadZone(name string) (*time.Location, error) {
	if name == "" {
		return time.UTC, nil
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		return nil, invalid("tz", "invalid IANA time zone")
	}
	return loc, nil
}

func (s scheduleRuntime) rule(row schedule.Schedule) (schedule.Rule, error) {
	loc, err := loadZone(row.TZ)
	if err != nil {
		return schedule.Rule{}, err
	}
	return row.Rule(loc)
}

func (s scheduleRuntime) allDay(ctx context.Context) (string, error) {
	doc, err := s.settings.Get(ctx)
	if err != nil {
		return "", err
	}
	if doc.NotificationsAllDayTime == "" {
		return settings.DefaultAllDayTime, nil
	}
	return doc.NotificationsAllDayTime, nil
}

func descendantIDs(nodes []space.Space, root string) []string {
	children := map[string][]string{}
	for _, node := range nodes {
		if node.ParentID != nil {
			children[*node.ParentID] = append(children[*node.ParentID], node.ID)
		}
	}
	out := []string{}
	var walk func(string)
	walk = func(id string) {
		for _, child := range children[id] {
			out = append(out, child)
			walk(child)
		}
	}
	walk(root)
	return out
}

func (s scheduleRuntime) subjects(ctx context.Context) ([]schedule.PlanSubject, error) {
	rows, err := s.schedules.ListActive(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]schedule.PlanSubject, 0, len(rows))
	for _, row := range rows {
		m, err := s.notes.Get(ctx, row.NoteID)
		if err != nil {
			if fault.IsCode(err, fault.CodeNotFound) {
				continue
			}
			return nil, err
		}
		rule, err := s.rule(row)
		if err != nil {
			return nil, err
		}
		completions, err := s.notes.ListCompletions(ctx, row.NoteID)
		if err != nil {
			return nil, err
		}
		tags, err := s.notes.ListTagIDs(ctx, row.NoteID)
		if err != nil {
			return nil, err
		}
		done := make([]time.Time, 0, len(completions))
		for _, c := range completions {
			done = append(done, c.OccurrenceAt)
		}
		out = append(out, schedule.PlanSubject{
			NoteID: m.ID, Title: m.Title, Content: m.Content, Rule: rule, CompletedAt: done,
			FocusEnabled: row.FocusEnabled, SpaceID: m.SpaceID, TagIDs: tags, Status: m.Status,
			ScheduleInactive: !row.Active,
		})
	}
	return out, nil
}

func (s scheduleRuntime) Set(ctx context.Context, who actor.Actor, in schedule.Schedule) (schedule.Schedule, error) {
	if in.NoteID == "" {
		return schedule.Schedule{}, invalid("schedule.note_id", "required")
	}
	if in.Every < 1 {
		in.Every = 1
	}
	if in.EndType == "" {
		in.EndType = schedule.EndNever
	}
	if _, err := s.rule(in); err != nil {
		return schedule.Schedule{}, err
	}
	in.FireAt = in.FireAt.UTC().Truncate(time.Millisecond)
	in.UpdatedAt = s.clock.Now().UTC()
	err := s.audit.Write(ctx, who, "schedule", in.NoteID, activity.OpUpdate, "Set schedule", func(ctx context.Context) error {
		if err := bumpNoteRevision(ctx, s.notes, in.NoteID, in.UpdatedAt); err != nil {
			return err
		}
		return s.schedules.Upsert(ctx, in)
	})
	if err != nil {
		return schedule.Schedule{}, err
	}
	return in, nil
}

func (s scheduleRuntime) Clear(ctx context.Context, who actor.Actor, noteID string) error {
	if noteID == "" {
		return invalid("note_id", "required")
	}
	return s.audit.Write(ctx, who, "schedule", noteID, activity.OpDelete, "Clear schedule", func(ctx context.Context) error {
		if err := s.schedules.Delete(ctx, noteID); err != nil {
			return err
		}
		return bumpNoteRevision(ctx, s.notes, noteID, s.clock.Now().UTC())
	})
}

func (s scheduleRuntime) Preview(ctx context.Context, in schedule.Schedule, limit int) ([]time.Time, string, error) {
	rule, err := s.rule(in)
	if err != nil {
		return nil, "", err
	}
	return s.planner.Preview(rule, limit)
}

func (s scheduleRuntime) ListOccurrences(ctx context.Context, q OccurrenceQuery) ([]schedule.Occurrence, error) {
	subjects, err := s.subjects(ctx)
	if err != nil {
		return nil, err
	}
	allDay, err := s.allDay(ctx)
	if err != nil {
		return nil, err
	}
	query := schedule.OccurrenceQuery{
		From: q.From, To: q.To, Now: s.clock.Now().UTC(), SpaceID: q.SpaceID, TagIDs: q.TagIDs,
		IncludeCompleted: q.IncludeCompleted, Limit: q.Limit, AllDayTime: allDay,
	}
	if q.SpaceID != nil && q.IncludeDescendants {
		nodes, err := s.spaces.List(ctx)
		if err != nil {
			return nil, err
		}
		query.SpaceIDs = descendantIDs(nodes, *q.SpaceID)
	}
	return schedule.ListOccurrences(subjects, query)
}

func (s scheduleRuntime) CompleteOccurrence(ctx context.Context, who actor.Actor, noteID string, at time.Time) (note.Completion, error) {
	if _, err := s.complete.SetStatus(ctx, who, noteID, 0, note.StatusCompleted, &at); err != nil {
		return note.Completion{}, err
	}
	items, err := s.notes.ListCompletions(ctx, noteID)
	if err != nil {
		return note.Completion{}, err
	}
	for _, item := range items {
		if item.OccurrenceAt.Equal(at.UTC()) {
			return item, nil
		}
	}
	return note.Completion{NoteID: noteID, OccurrenceAt: at.UTC()}, nil
}

func (s scheduleRuntime) ReopenOccurrence(ctx context.Context, who actor.Actor, noteID string, at time.Time) error {
	_, err := s.complete.SetStatus(ctx, who, noteID, 0, note.StatusActive, &at)
	return err
}

func (s scheduleRuntime) SetFocusRecipe(ctx context.Context, who actor.Actor, noteID string, recipe schedule.FocusRecipe) (schedule.Schedule, error) {
	if recipe.Enabled {
		for field, value := range map[string]int{"work_min": recipe.WorkMin, "short_break_min": recipe.ShortBreakMin, "long_break_min": recipe.LongBreakMin} {
			if value < 1 || value > 60 {
				return schedule.Schedule{}, invalid(field, "must be between 1 and 60")
			}
		}
		if recipe.Cycles < 1 || recipe.Cycles > 12 {
			return schedule.Schedule{}, invalid("cycles", "must be between 1 and 12")
		}
	}
	var row schedule.Schedule
	err := s.audit.Write(ctx, who, "schedule", noteID, activity.OpUpdate, "Set focus recipe", func(ctx context.Context) error {
		var err error
		row, err = s.schedules.Get(ctx, noteID)
		if err != nil {
			return err
		}
		row.FocusEnabled = recipe.Enabled
		row.FocusWorkMin = intPtrFrom(recipe.WorkMin)
		row.FocusShortBreakMin = intPtrFrom(recipe.ShortBreakMin)
		row.FocusLongBreakMin = intPtrFrom(recipe.LongBreakMin)
		row.FocusCycles = intPtrFrom(recipe.Cycles)
		row.FocusAutoContinue = recipe.AutoContinue
		row.UpdatedAt = s.clock.Now().UTC()
		if err := s.schedules.Upsert(ctx, row); err != nil {
			return err
		}
		return bumpNoteRevision(ctx, s.notes, noteID, row.UpdatedAt)
	})
	if err != nil {
		return schedule.Schedule{}, err
	}
	return row, nil
}

// Schedule and place are part of the note aggregate guarded by expectedRev.
// Call only inside the mutation's audit transaction.
func bumpNoteRevision(ctx context.Context, repo note.Repository, id string, at time.Time) error {
	return bumpNoteRevisionExpecting(ctx, repo, id, 0, at)
}

// bumpNoteRevisionExpecting bumps the revision inside the caller's transaction;
// a non-zero expectedRev that differs from the stored one is a conflict.
func bumpNoteRevisionExpecting(ctx context.Context, repo note.Repository, id string, expectedRev int64, at time.Time) error {
	m, err := repo.Get(ctx, id)
	if err != nil {
		return err
	}
	if expectedRev != 0 && m.Rev != expectedRev {
		return fault.Conflict("note", id, m.Rev, m)
	}
	oldRev := m.Rev
	m.Rev++
	m.UpdatedAt = at
	return repo.Update(ctx, oldRev, m)
}

func intPtrFrom(n int) *int {
	if n == 0 {
		return nil
	}
	v := n
	return &v
}
