package focus

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"time"
)

// DefaultsRepository is satisfied by settings.Repository without a package cycle.
type DefaultsRepository interface {
	Get(context.Context, string) (string, bool, error)
	Set(context.Context, string, string) error
}
type service struct {
	repo     Repository
	settings DefaultsRepository
	notes    note.Repository
	audit    activity.Audit
}

func NewService(r Repository, settings DefaultsRepository, m note.Repository, a activity.Audit) Service {
	return &service{r, settings, m, a}
}
func defaultsFields(d *Defaults) map[string]any {
	return map[string]any{"focus.work": &d.WorkMin, "focus.shortBreak": &d.ShortBreakMin, "focus.longBreak": &d.LongBreakMin, "focus.cycles": &d.Cycles, "focus.autoContinue": &d.AutoContinue, "focus.sounds": &d.Sounds, "focus.notifications": &d.Notifications}
}
func ValidateDefaults(d Defaults) error {
	for field, value := range map[string]int{"work": d.WorkMin, "short_break": d.ShortBreakMin, "long_break": d.LongBreakMin} {
		if value < MinMinutes || value > MaxMinutes {
			return activity.Invalid(field, "must be between 1 and 60")
		}
	}
	if d.Cycles < MinCycles || d.Cycles > MaxCycles {
		return activity.Invalid("cycles", "must be between 1 and 12")
	}
	return nil
}
func (s *service) GetDefaults(ctx context.Context) (Defaults, error) {
	d := DefaultDefaults()
	for key, p := range defaultsFields(&d) {
		raw, ok, e := s.settings.Get(ctx, key)
		if e != nil {
			return d, e
		}
		if ok {
			if raw == "null" {
				return d, activity.Invalid(key, "null is not a typed default")
			}
			if e = json.Unmarshal([]byte(raw), p); e != nil {
				return d, fmt.Errorf("decode focus default: %w", e)
			}
		}
	}
	return d, ValidateDefaults(d)
}
func (s *service) SetDefaults(ctx context.Context, a actor.Actor, d Defaults) (Defaults, error) {
	if e := ValidateDefaults(d); e != nil {
		return d, e
	}
	e := s.audit.Write(ctx, a, "focus", "defaults", activity.OpUpdate, "Update focus defaults", func(ctx context.Context) error {
		for key, p := range defaultsFields(&d) {
			raw, e := json.Marshal(p)
			if e != nil {
				return fmt.Errorf("encode focus default: %w", e)
			}
			if e = s.settings.Set(ctx, key, string(raw)); e != nil {
				return e
			}
		}
		return nil
	})
	return d, e
}
func (s *service) RecordSession(ctx context.Context, a actor.Actor, in Session) (out Session, err error) {
	if in.Phase != PhaseWork && in.Phase != PhaseShortBreak && in.Phase != PhaseLongBreak {
		return out, activity.Invalid("phase", "unknown focus phase")
	}
	if in.State != StateCompleted && in.State != StateStopped {
		return out, activity.Invalid("state", "unknown session state")
	}
	if in.PlannedS < 60 || in.PlannedS > 3600 || in.ElapsedS < 0 || in.ElapsedS > in.PlannedS {
		return out, activity.Invalid("duration", "invalid planned or elapsed duration")
	}
	if in.StartedAt.IsZero() || in.EndedAt.Before(in.StartedAt) || in.EndedAt.After(s.audit.Clock.Now()) || time.Duration(in.ElapsedS)*time.Second > in.EndedAt.Sub(in.StartedAt) {
		return out, activity.Invalid("time", "invalid session interval")
	}
	out = in
	out.ID = s.audit.IDs.New()
	out.StartedAt = out.StartedAt.UTC()
	out.EndedAt = out.EndedAt.UTC()
	err = s.audit.Write(ctx, a, "focus", out.ID, activity.OpCreate, "Record focus session", func(ctx context.Context) error {
		if out.NoteID != nil {
			if _, e := s.notes.Get(ctx, *out.NoteID); e != nil {
				return e
			}
		}
		return s.repo.InsertSession(ctx, out)
	})
	return
}
func (s *service) ListSessions(ctx context.Context, from, to time.Time) ([]Session, error) {
	if !from.Before(to) {
		return nil, activity.Invalid("range", "from must precede to")
	}
	return s.repo.ListSessions(ctx, from.UTC(), to.UTC())
}
