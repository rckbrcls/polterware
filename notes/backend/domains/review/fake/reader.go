package fake

import (
	"context"
	store "github.com/polterware/polterware/notes/backend/domains/activity/fake"
	"github.com/polterware/polterware/notes/backend/domains/focus"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/review"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
	"time"
)

type Reader struct{ Store *store.Store }

func New(s *store.Store) *Reader { return &Reader{s} }

var _ review.Reader = (*Reader)(nil)

func (r *Reader) Completions(ctx context.Context, from, to time.Time) ([]review.Completion, error) {
	out := []review.Completion{}
	rows, e := store.All[note.Note](ctx, r.Store, "notes")
	if e != nil {
		return nil, e
	}
	for _, v := range rows {
		sc, _, err := store.Read[schedule.Schedule](ctx, r.Store, "schedules", v.ID)
		if err != nil {
			return nil, err
		}
		if sc.Freq != "" {
			continue
		}
		if v.Status == note.StatusCompleted && v.CompletedAt != nil && !v.CompletedAt.Before(from) && v.CompletedAt.Before(to) {
			out = append(out, review.Completion{NoteID: v.ID, At: *v.CompletedAt})
		}
	}
	cs, e := store.All[note.Completion](ctx, r.Store, "completions")
	for _, v := range cs {
		if !v.CompletedAt.Before(from) && v.CompletedAt.Before(to) {
			out = append(out, review.Completion{NoteID: v.NoteID, At: v.CompletedAt})
		}
	}
	return out, e
}
func (r *Reader) FocusSpans(ctx context.Context, from, to time.Time) ([]review.FocusSpan, error) {
	rows, e := store.All[focus.Session](ctx, r.Store, "focus_sessions")
	out := []review.FocusSpan{}
	for _, v := range rows {
		if v.Phase == focus.PhaseWork && !v.StartedAt.Before(from) && v.StartedAt.Before(to) {
			out = append(out, review.FocusSpan{StartedAt: v.StartedAt, ElapsedS: v.ElapsedS})
		}
	}
	return out, e
}
