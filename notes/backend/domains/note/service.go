package note

import (
	"context"
	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
	"github.com/polterware/polterware/notes/backend/domains/space"
	"github.com/polterware/polterware/notes/backend/domains/tag"
	"slices"
	"strings"
	"time"
	"unicode/utf8"
)

type service struct {
	repo      Repository
	spaces    space.Repository
	tags      tag.Repository
	schedules schedule.Repository
	planner   schedule.Planner
	audit     activity.Audit
}

func NewService(r Repository, m space.Repository, t tag.Repository, sc schedule.Repository, p schedule.Planner, a activity.Audit) Service {
	return &service{r, m, t, sc, p, a}
}
func (s *service) List(ctx context.Context, f ListFilter) (ListPage, error) {
	if f.Limit == 0 {
		f.Limit = 50
	}
	if f.Limit < 1 || f.Limit > 500 {
		return ListPage{}, activity.Invalid("limit", "must be between 1 and 500")
	}
	if f.Status != "" && f.Status != StatusActive && f.Status != StatusCompleted {
		return ListPage{}, activity.Invalid("status", "unknown status")
	}
	if f.Order != "" && f.Order != OrderUpdated && f.Order != OrderCreated && f.Order != OrderDue && f.Order != OrderManual {
		return ListPage{}, activity.Invalid("order", "unknown order")
	}
	for _, bounds := range [][2]*time.Time{{f.DueFrom, f.DueTo}, {f.UpdatedFrom, f.UpdatedTo}} {
		if bounds[0] != nil && bounds[1] != nil && !bounds[0].Before(*bounds[1]) {
			return ListPage{}, activity.Invalid("range", "from must precede to")
		}
	}
	return s.repo.List(ctx, f)
}
func (s *service) Get(ctx context.Context, id string, in Include) (out GetResult, err error) {
	out.Note, err = s.repo.Get(ctx, id)
	if err != nil {
		return
	}
	if !in.Content {
		out.Note.Content = ""
	}
	if in.Checklist {
		out.Checklist, err = s.repo.ListCheckItems(ctx, id)
		if err != nil {
			return
		}
	}
	if in.Tags {
		out.TagIDs, err = s.repo.ListTagIDs(ctx, id)
		if err != nil {
			return
		}
	}
	if in.Completions {
		out.Completions, err = s.repo.ListCompletions(ctx, id)
	}
	return
}
func (s *service) validate(ctx context.Context, m Note) error {
	if e := activity.ValidateName("title", m.Title, 500); e != nil {
		return e
	}
	if m.Priority != nil && (*m.Priority < 0 || *m.Priority > 3) {
		return activity.Invalid("priority", "must be between 0 and 3")
	}
	if m.SpaceID != nil {
		if _, e := s.spaces.Get(ctx, *m.SpaceID); e != nil {
			return e
		}
	}
	return nil
}
func (s *service) checkTags(ctx context.Context, ids []string) error {
	seen := map[string]bool{}
	for _, id := range ids {
		if seen[id] {
			return activity.Invalid("tag_ids", "duplicate tag")
		}
		seen[id] = true
		if _, e := s.tags.Get(ctx, id); e != nil {
			return e
		}
	}
	return nil
}
func (s *service) checklist(ctx context.Context, id string, input []CheckItemInput, old []CheckItem) ([]CheckItem, error) {
	existing := map[string]CheckItem{}
	for _, v := range old {
		existing[v.ID] = v
	}
	seen := map[string]bool{}
	out := []CheckItem{}
	now := s.audit.Clock.Now().UTC()
	for i, v := range input {
		if utf8.RuneCountInString(v.Title) > 500 {
			return nil, activity.Invalid("checklist.title", "must contain at most 500 characters")
		}
		item := CheckItem{}
		if v.ID != "" {
			var ok bool
			item, ok = existing[v.ID]
			if !ok || seen[v.ID] {
				return nil, activity.Invalid("checklist.id", "must identify a unique existing item")
			}
			seen[v.ID] = true
		} else {
			item.ID = s.audit.IDs.New()
			item.NoteID = id
			item.CreatedAt = now
		}
		item.Title = v.Title
		item.Detail = v.Detail
		item.SortOrder = i
		item.UpdatedAt = now
		if v.Done && !item.Done {
			item.CompletedAt = &now
		} else if !v.Done {
			item.CompletedAt = nil
		}
		item.Done = v.Done
		out = append(out, item)
	}
	return out, nil
}
func allDone(items []CheckItem) bool {
	if len(items) == 0 {
		return false
	}
	for _, v := range items {
		if !v.Done {
			return false
		}
	}
	return true
}
func (s *service) save(ctx context.Context, m *Note) error {
	old := m.Rev
	m.Rev++
	m.UpdatedAt = s.audit.Clock.Now().UTC()
	return s.repo.Update(ctx, old, *m)
}
func (s *service) autoComplete(m *Note, items []CheckItem) {
	if m.AutoCompleteOnChecklist && allDone(items) && m.Status != StatusCompleted {
		now := s.audit.Clock.Now().UTC()
		m.Status = StatusCompleted
		m.CompletedAt = &now
	}
}
func (s *service) Create(ctx context.Context, a actor.Actor, in Create) (out Note, err error) {
	now := s.audit.Clock.Now().UTC()
	out = Note{ID: s.audit.IDs.New(), SpaceID: in.SpaceID, Title: strings.TrimSpace(in.Title), Content: in.Content, Status: StatusActive, Pinned: in.Pinned, Priority: in.Priority, DueAt: in.DueAt, DueAllDay: in.DueAllDay, SortOrder: in.SortOrder, AutoCompleteOnChecklist: in.AutoCompleteOnChecklist, CreatedAt: now, UpdatedAt: now, Rev: 1}
	if out.DueAt != nil {
		utc := out.DueAt.UTC()
		out.DueAt = &utc
	}
	err = s.audit.Write(ctx, a, "note", out.ID, activity.OpCreate, "Create note", func(ctx context.Context) error {
		if e := s.validate(ctx, out); e != nil {
			return e
		}
		if e := s.checkTags(ctx, in.TagIDs); e != nil {
			return e
		}
		items, e := s.checklist(ctx, out.ID, in.Checklist, nil)
		if e != nil {
			return e
		}
		s.autoComplete(&out, items)
		if e = s.repo.Insert(ctx, out); e != nil {
			return e
		}
		if e = s.repo.ReplaceCheckItems(ctx, out.ID, items); e != nil {
			return e
		}
		return s.repo.SetTagIDs(ctx, out.ID, in.TagIDs)
	})
	return
}
func (s *service) mutate(ctx context.Context, a actor.Actor, id string, rev int64, op, summary string, fn func(context.Context, *Note) error) (out Note, err error) {
	err = s.audit.Write(ctx, a, "note", id, op, summary, func(ctx context.Context) error {
		m, e := s.repo.Get(ctx, id)
		if e != nil {
			return e
		}
		if rev != 0 && m.Rev != rev {
			return fault.Conflict("note", id, m.Rev, m)
		}
		if e = fn(ctx, &m); e != nil {
			return e
		}
		if e = s.save(ctx, &m); e != nil {
			return e
		}
		out = m
		return nil
	})
	return
}
func (s *service) Update(ctx context.Context, a actor.Actor, id string, rev int64, p Patch) (Note, error) {
	return s.mutate(ctx, a, id, rev, activity.OpUpdate, "Update note", func(ctx context.Context, m *Note) error {
		if p.ClearSpaceID && p.SpaceID != nil || p.ClearPriority && p.Priority != nil || p.ClearDueAt && p.DueAt != nil {
			return activity.Invalid("patch", "cannot set and clear the same field")
		}
		if p.Title != nil {
			m.Title = strings.TrimSpace(*p.Title)
		}
		if p.Content != nil {
			m.Content = *p.Content
		}
		if p.ClearSpaceID {
			m.SpaceID = nil
		} else if p.SpaceID != nil {
			m.SpaceID = p.SpaceID
		}
		if p.ClearPriority {
			m.Priority = nil
		} else if p.Priority != nil {
			m.Priority = p.Priority
		}
		if p.ClearDueAt {
			m.DueAt = nil
			m.DueAllDay = false
		} else if p.DueAt != nil {
			utc := p.DueAt.UTC()
			m.DueAt = &utc
		}
		if p.DueAllDay != nil {
			m.DueAllDay = *p.DueAllDay
		}
		if p.SortOrder != nil {
			m.SortOrder = *p.SortOrder
		}
		if p.Pinned != nil {
			m.Pinned = *p.Pinned
		}
		if p.AutoCompleteOnChecklist != nil {
			m.AutoCompleteOnChecklist = *p.AutoCompleteOnChecklist
			if *p.AutoCompleteOnChecklist {
				items, e := s.repo.ListCheckItems(ctx, id)
				if e != nil {
					return e
				}
				s.autoComplete(m, items)
			}
		}
		return s.validate(ctx, *m)
	})
}
func (s *service) Delete(ctx context.Context, a actor.Actor, id string, rev int64) error {
	return s.audit.Write(ctx, a, "note", id, activity.OpDelete, "Delete note", func(ctx context.Context) error {
		return s.repo.Delete(ctx, rev, id)
	})
}
func (s *service) SetPinned(ctx context.Context, a actor.Actor, id string, rev int64, pinned bool) (Note, error) {
	return s.Update(ctx, a, id, rev, Patch{Pinned: &pinned})
}
func (s *service) SetStatus(ctx context.Context, a actor.Actor, id string, rev int64, status string, occurrence *time.Time) (Note, error) {
	if status != StatusActive && status != StatusCompleted {
		return Note{}, activity.Invalid("status", "unknown status")
	}
	op := activity.OpComplete
	if status == StatusActive {
		op = activity.OpReopen
	}
	return s.mutate(ctx, a, id, rev, op, "Change note completion", func(ctx context.Context, m *Note) error {
		now := s.audit.Clock.Now().UTC()
		if occurrence == nil {
			m.Status = status
			m.CompletedAt = nil
			if status == StatusCompleted {
				m.CompletedAt = &now
			}
			return nil
		}
		if s.schedules == nil || s.planner == nil {
			return fault.Unavailable("recurrence engine is required for occurrence completion")
		}
		sc, e := s.schedules.Get(ctx, id)
		if e != nil {
			return e
		}
		if sc.Freq == "" {
			return activity.Invalid("occurrence_at", "note must have a recurring schedule")
		}
		loc, e := time.LoadLocation(sc.TZ)
		if e != nil {
			return activity.Invalid("tz", "invalid schedule zone")
		}
		rule := schedule.Rule{Anchor: sc.FireAt, TZ: loc, AllDay: sc.AllDay, Freq: sc.Freq, Every: sc.Every, WeekdayMask: sc.WeekdayMask, End: schedule.End{Type: sc.EndType, Until: sc.UntilAt}}
		if sc.OccurrenceCount != nil {
			rule.End.Count = *sc.OccurrenceCount
		}
		subject := schedule.PlanSubject{NoteID: id, Title: m.Title, Rule: rule}
		at := occurrence.UTC()
		events, e := s.planner.Occurrences([]schedule.PlanSubject{subject}, at, at.Add(time.Nanosecond), true, 2)
		if e != nil {
			return e
		}
		if len(events) != 1 || !events[0].OccurrenceAt.Equal(at) {
			return activity.Invalid("occurrence_at", "must be an exact scheduled occurrence")
		}
		if status == StatusCompleted {
			e = s.repo.InsertCompletion(ctx, Completion{ID: s.audit.IDs.New(), NoteID: id, OccurrenceAt: at, CompletedAt: now})
			if e != nil && !fault.IsCode(e, fault.CodeExists) {
				return e
			}
		} else {
			if e = s.repo.DeleteCompletion(ctx, id, at); e != nil {
				return e
			}
		}
		m.Status = StatusActive
		m.CompletedAt = nil
		if status == StatusCompleted && sc.EndType != schedule.EndNever {
			cs, e := s.repo.ListCompletions(ctx, id)
			if e != nil {
				return e
			}
			var finite []schedule.Occurrence
			if sc.EndType == schedule.EndCount {
				if sc.OccurrenceCount == nil || *sc.OccurrenceCount > 100000 {
					return fault.Exhausted("series completion exceeds the occurrence budget")
				}
				ats, _, e := s.planner.Preview(rule, *sc.OccurrenceCount)
				if e != nil {
					return e
				}
				if len(ats) > 0 && !ats[len(ats)-1].After(now) {
					for _, v := range ats {
						finite = append(finite, schedule.Occurrence{OccurrenceAt: v})
					}
				}
			} else if sc.UntilAt != nil && !sc.UntilAt.After(now) {
				finite, e = s.planner.Occurrences([]schedule.PlanSubject{subject}, sc.FireAt, sc.UntilAt.Add(time.Nanosecond), true, 100001)
				if e != nil {
					return e
				}
				if len(finite) > 100000 {
					return fault.Exhausted("series completion exceeds the occurrence budget")
				}
			}
			complete := len(finite) > 0
			for _, v := range finite {
				found := false
				for _, c := range cs {
					if c.OccurrenceAt.Equal(v.OccurrenceAt) {
						found = true
						break
					}
				}
				if !found {
					complete = false
					break
				}
			}
			if complete {
				m.Status = StatusCompleted
				m.CompletedAt = &now
			}
		}
		return nil
	})
}
func (s *service) ReplaceChecklist(ctx context.Context, a actor.Actor, id string, rev int64, in []CheckItemInput) (out []CheckItem, err error) {
	_, err = s.mutate(ctx, a, id, rev, activity.OpUpdate, "Replace checklist", func(ctx context.Context, m *Note) error {
		old, e := s.repo.ListCheckItems(ctx, id)
		if e != nil {
			return e
		}
		out, e = s.checklist(ctx, id, in, old)
		if e != nil {
			return e
		}
		if e = s.repo.ReplaceCheckItems(ctx, id, out); e != nil {
			return e
		}
		s.autoComplete(m, out)
		return nil
	})
	return
}
func (s *service) ToggleCheckItem(ctx context.Context, a actor.Actor, id, itemID string, rev int64, done *bool) (out CheckItem, err error) {
	_, err = s.mutate(ctx, a, id, rev, activity.OpUpdate, "Toggle checklist item", func(ctx context.Context, m *Note) error {
		item, e := s.repo.GetCheckItem(ctx, itemID)
		if e != nil {
			return e
		}
		if item.NoteID != id {
			return activity.Invalid("item_id", "item does not belong to note")
		}
		next := !item.Done
		if done != nil {
			next = *done
		}
		now := s.audit.Clock.Now().UTC()
		if next && !item.Done {
			item.CompletedAt = &now
		} else if !next {
			item.CompletedAt = nil
		}
		item.Done = next
		item.UpdatedAt = now
		if e = s.repo.UpdateCheckItem(ctx, item); e != nil {
			return e
		}
		items, e := s.repo.ListCheckItems(ctx, id)
		if e != nil {
			return e
		}
		s.autoComplete(m, items)
		out = item
		return nil
	})
	return
}
func (s *service) SetTags(ctx context.Context, a actor.Actor, id string, rev int64, ids []string) error {
	_, e := s.mutate(ctx, a, id, rev, activity.OpUpdate, "Set note tags", func(ctx context.Context, m *Note) error {
		if e := s.checkTags(ctx, ids); e != nil {
			return e
		}
		return s.repo.SetTagIDs(ctx, id, ids)
	})
	return e
}
func sameSpace(a, b *string) bool { return a == nil && b == nil || a != nil && b != nil && *a == *b }
func (s *service) Reorder(ctx context.Context, a actor.Actor, spaceID *string, ids []string) error {
	return s.audit.Transactions.Within(ctx, func(ctx context.Context) error {
		seen := map[string]bool{}
		for i, id := range ids {
			if seen[id] {
				return activity.Invalid("ordered_ids", "duplicate note")
			}
			seen[id] = true
			m, e := s.repo.Get(ctx, id)
			if e != nil {
				return e
			}
			if !sameSpace(m.SpaceID, spaceID) {
				return activity.Invalid("space_id", "note belongs to another space")
			}
			order := i
			if _, e = s.Update(ctx, a, id, m.Rev, Patch{SortOrder: &order}); e != nil {
				return e
			}
		}
		return nil
	})
}
func (s *service) BulkAction(ctx context.Context, a actor.Actor, in BulkAction) ([]BulkItemResult, error) {
	if !slices.Contains([]string{BulkComplete, BulkReopen, BulkPin, BulkUnpin, BulkMove, BulkTag, BulkUntag, BulkDelete}, in.Action) {
		return nil, activity.Invalid("action", "unknown bulk action")
	}
	seen := map[string]bool{}
	for _, id := range in.IDs {
		if seen[id] {
			return nil, activity.Invalid("ids", "duplicate note")
		}
		seen[id] = true
	}
	out := make([]BulkItemResult, 0, len(in.IDs))
	for _, id := range in.IDs {
		e := s.audit.Transactions.Within(ctx, func(ctx context.Context) error {
			switch in.Action {
			case BulkDelete:
				return s.Delete(ctx, a, id, 0)
			case BulkComplete, BulkReopen:
				status := StatusCompleted
				if in.Action == BulkReopen {
					status = StatusActive
				}
				_, e := s.SetStatus(ctx, a, id, 0, status, nil)
				return e
			case BulkPin, BulkUnpin:
				_, e := s.SetPinned(ctx, a, id, 0, in.Action == BulkPin)
				return e
			case BulkMove:
				_, e := s.Update(ctx, a, id, 0, Patch{SpaceID: in.SpaceID, ClearSpaceID: in.SpaceID == nil})
				return e
			default:
				ids, e := s.repo.ListTagIDs(ctx, id)
				if e != nil {
					return e
				}
				if e = s.checkTags(ctx, in.TagIDs); e != nil {
					return e
				}
				for _, tagID := range in.TagIDs {
					if in.Action == BulkTag && !slices.Contains(ids, tagID) {
						ids = append(ids, tagID)
					} else if in.Action == BulkUntag {
						ids = slices.DeleteFunc(ids, func(v string) bool { return v == tagID })
					}
				}
				return s.SetTags(ctx, a, id, 0, ids)
			}
		})
		out = append(out, BulkItemResult{ID: id, Err: e})
	}
	return out, nil
}
