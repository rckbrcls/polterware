package fake

import (
	"context"
	"encoding/base64"
	"encoding/json"
	store "github.com/polterware/polterware/notes/backend/domains/activity/fake"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/focus"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/space"
	"github.com/polterware/polterware/notes/backend/domains/tag"
	"slices"
	"sort"
	"strings"
	"time"
)

type Repository struct{ Store *store.Store }

func New(s *store.Store) *Repository { return &Repository{s} }

var _ note.Repository = (*Repository)(nil)

func (r *Repository) Get(ctx context.Context, id string) (note.Note, error) {
	v, ok, err := store.Read[note.Note](ctx, r.Store, "notes", id)
	if err == nil && !ok {
		err = fault.NotFound("note", id)
	}
	return v, err
}
func (r *Repository) checkSpace(ctx context.Context, m note.Note) error {
	if m.SpaceID != nil {
		_, ok, err := store.Read[space.Space](ctx, r.Store, "spaces", *m.SpaceID)
		if err != nil {
			return err
		}
		if !ok {
			return fault.NotFound("space", *m.SpaceID)
		}
	}
	return nil
}
func (r *Repository) Insert(ctx context.Context, m note.Note) error {
	return r.Store.Within(ctx, func(ctx context.Context) error {
		if _, err := r.Get(ctx, m.ID); err == nil {
			return fault.Exists("note", m.ID)
		} else if !fault.IsCode(err, fault.CodeNotFound) {
			return err
		}
		if err := r.checkSpace(ctx, m); err != nil {
			return err
		}
		return r.Store.Put(ctx, "notes", m.ID, m)
	})
}
func (r *Repository) Update(ctx context.Context, rev int64, m note.Note) error {
	return r.Store.Within(ctx, func(ctx context.Context) error {
		old, err := r.Get(ctx, m.ID)
		if err != nil {
			return err
		}
		if rev != 0 && old.Rev != rev {
			return fault.Conflict("note", m.ID, old.Rev, old)
		}
		if err := r.checkSpace(ctx, m); err != nil {
			return err
		}
		return r.Store.Put(ctx, "notes", m.ID, m)
	})
}
func (r *Repository) Delete(ctx context.Context, rev int64, id string) error {
	return r.Store.Within(ctx, func(ctx context.Context) error {
		old, err := r.Get(ctx, id)
		if err != nil {
			return err
		}
		if rev != 0 && old.Rev != rev {
			return fault.Conflict("note", id, old.Rev, old)
		}
		items, err := r.ListCheckItems(ctx, id)
		if err != nil {
			return err
		}
		for _, item := range items {
			if err = r.Store.Remove(ctx, "check_items", item.ID); err != nil {
				return err
			}
		}
		cs, err := r.ListCompletions(ctx, id)
		if err != nil {
			return err
		}
		for _, c := range cs {
			if err = r.Store.Remove(ctx, "completions", c.ID); err != nil {
				return err
			}
		}
		attachments, err := store.All[struct{ ID, NoteID string }](ctx, r.Store, "attachments")
		if err != nil {
			return err
		}
		for _, v := range attachments {
			if v.NoteID == id {
				if err = r.Store.Remove(ctx, "attachments", v.ID); err != nil {
					return err
				}
			}
		}
		sessions, err := store.All[focus.Session](ctx, r.Store, "focus_sessions")
		if err != nil {
			return err
		}
		for _, v := range sessions {
			if v.NoteID != nil && *v.NoteID == id {
				v.NoteID = nil
				if err = r.Store.Put(ctx, "focus_sessions", v.ID, v); err != nil {
					return err
				}
			}
		}
		for _, table := range []string{"note_tags", "schedules", "places"} {
			if err = r.Store.Remove(ctx, table, id); err != nil {
				return err
			}
		}
		return r.Store.Remove(ctx, "notes", id)
	})
}
func (r *Repository) ListCheckItems(ctx context.Context, id string) ([]note.CheckItem, error) {
	all, err := store.All[note.CheckItem](ctx, r.Store, "check_items")
	out := []note.CheckItem{}
	for _, v := range all {
		if v.NoteID == id {
			out = append(out, v)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].SortOrder == out[j].SortOrder {
			return out[i].ID < out[j].ID
		}
		return out[i].SortOrder < out[j].SortOrder
	})
	return out, err
}
func (r *Repository) ReplaceCheckItems(ctx context.Context, id string, items []note.CheckItem) error {
	return r.Store.Within(ctx, func(ctx context.Context) error {
		if _, err := r.Get(ctx, id); err != nil {
			return err
		}
		seen := map[string]bool{}
		for _, v := range items {
			if v.NoteID != id || seen[v.ID] {
				return fault.Invalid(fault.Violation{Field: "checklist", Reason: "invalid identity"})
			}
			seen[v.ID] = true
			old, ok, err := store.Read[note.CheckItem](ctx, r.Store, "check_items", v.ID)
			if err != nil {
				return err
			}
			if ok && old.NoteID != id {
				return fault.Exists("check_item", v.ID)
			}
		}
		old, err := r.ListCheckItems(ctx, id)
		if err != nil {
			return err
		}
		for _, v := range old {
			if err = r.Store.Remove(ctx, "check_items", v.ID); err != nil {
				return err
			}
		}
		for _, v := range items {
			if err = r.Store.Put(ctx, "check_items", v.ID, v); err != nil {
				return err
			}
		}
		return nil
	})
}
func (r *Repository) GetCheckItem(ctx context.Context, id string) (note.CheckItem, error) {
	v, ok, err := store.Read[note.CheckItem](ctx, r.Store, "check_items", id)
	if err == nil && !ok {
		err = fault.NotFound("check_item", id)
	}
	return v, err
}
func (r *Repository) UpdateCheckItem(ctx context.Context, v note.CheckItem) error {
	return r.Store.Within(ctx, func(ctx context.Context) error {
		old, err := r.GetCheckItem(ctx, v.ID)
		if err != nil {
			return err
		}
		if old.NoteID != v.NoteID {
			return fault.Invalid(fault.Violation{Field: "note_id", Reason: "cannot move checklist item"})
		}
		return r.Store.Put(ctx, "check_items", v.ID, v)
	})
}

type tagLinks struct {
	NoteID string
	IDs    []string
}

func (r *Repository) ListTagIDs(ctx context.Context, id string) ([]string, error) {
	v, _, err := store.Read[tagLinks](ctx, r.Store, "note_tags", id)
	return v.IDs, err
}
func (r *Repository) SetTagIDs(ctx context.Context, id string, ids []string) error {
	return r.Store.Within(ctx, func(ctx context.Context) error {
		if _, err := r.Get(ctx, id); err != nil {
			return err
		}
		unique := []string{}
		for _, v := range ids {
			_, ok, err := store.Read[tag.Tag](ctx, r.Store, "tags", v)
			if err != nil {
				return err
			}
			if !ok {
				return fault.NotFound("tag", v)
			}
			if !slices.Contains(unique, v) {
				unique = append(unique, v)
			}
		}
		return r.Store.Put(ctx, "note_tags", id, tagLinks{id, unique})
	})
}
func (r *Repository) ListCompletions(ctx context.Context, id string) ([]note.Completion, error) {
	all, err := store.All[note.Completion](ctx, r.Store, "completions")
	out := []note.Completion{}
	for _, v := range all {
		if v.NoteID == id {
			out = append(out, v)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].OccurrenceAt.Before(out[j].OccurrenceAt) })
	return out, err
}
func (r *Repository) InsertCompletion(ctx context.Context, c note.Completion) error {
	return r.Store.Within(ctx, func(ctx context.Context) error {
		if _, err := r.Get(ctx, c.NoteID); err != nil {
			return err
		}
		rows, err := r.ListCompletions(ctx, c.NoteID)
		if err != nil {
			return err
		}
		for _, v := range rows {
			if v.OccurrenceAt.Equal(c.OccurrenceAt) {
				return fault.Exists("completion", v.ID)
			}
		}
		_, ok, err := store.Read[note.Completion](ctx, r.Store, "completions", c.ID)
		if err != nil {
			return err
		}
		if ok {
			return fault.Exists("completion", c.ID)
		}
		return r.Store.Put(ctx, "completions", c.ID, c)
	})
}
func (r *Repository) DeleteCompletion(ctx context.Context, id string, at time.Time) error {
	rows, err := r.ListCompletions(ctx, id)
	if err != nil {
		return err
	}
	for _, v := range rows {
		if v.OccurrenceAt.Equal(at) {
			return r.Store.Remove(ctx, "completions", v.ID)
		}
	}
	return nil
}
func (r *Repository) CountBySpaces(ctx context.Context, ids []string) (int, error) {
	rows, err := store.All[note.Note](ctx, r.Store, "notes")
	n := 0
	for _, v := range rows {
		if v.SpaceID != nil && slices.Contains(ids, *v.SpaceID) {
			n++
		}
	}
	return n, err
}
func less(a, b note.Summary, order string) bool {
	switch order {
	case note.OrderManual:
		if a.SortOrder != b.SortOrder {
			return a.SortOrder < b.SortOrder
		}
	case note.OrderDue:
		if a.DueAt == nil && b.DueAt != nil {
			return false
		}
		if a.DueAt != nil && b.DueAt == nil {
			return true
		}
		if a.DueAt != nil && !a.DueAt.Equal(*b.DueAt) {
			return a.DueAt.Before(*b.DueAt)
		}
	case note.OrderCreated:
		if !a.CreatedAt.Equal(b.CreatedAt) {
			return a.CreatedAt.After(b.CreatedAt)
		}
	default:
		if !a.UpdatedAt.Equal(b.UpdatedAt) {
			return a.UpdatedAt.After(b.UpdatedAt)
		}
	}
	return a.ID < b.ID
}
func (r *Repository) List(ctx context.Context, f note.ListFilter) (note.ListPage, error) {
	rows, err := store.All[note.Note](ctx, r.Store, "notes")
	if err != nil {
		return note.ListPage{}, err
	}
	spaces := map[string]bool{}
	if f.SpaceID != nil {
		spaces[*f.SpaceID] = true
	}
	if f.IncludeDescendants {
		nodes, e := store.All[space.Space](ctx, r.Store, "spaces")
		if e != nil {
			return note.ListPage{}, e
		}
		for changed := true; changed; {
			changed = false
			for _, n := range nodes {
				if n.ParentID != nil && spaces[*n.ParentID] && !spaces[n.ID] {
					spaces[n.ID] = true
					changed = true
				}
			}
		}
	}
	page := note.ListPage{}
	for _, m := range rows {
		if f.InboxOnly && m.SpaceID != nil || f.SpaceID != nil && (m.SpaceID == nil || !spaces[*m.SpaceID]) || f.Status != "" && m.Status != f.Status || f.Pinned != nil && m.Pinned != *f.Pinned {
			continue
		}
		if f.DueFrom != nil && (m.DueAt == nil || m.DueAt.Before(*f.DueFrom)) || f.DueTo != nil && (m.DueAt == nil || !m.DueAt.Before(*f.DueTo)) || f.UpdatedFrom != nil && m.UpdatedAt.Before(*f.UpdatedFrom) || f.UpdatedTo != nil && !m.UpdatedAt.Before(*f.UpdatedTo) {
			continue
		}
		tags, e := r.ListTagIDs(ctx, m.ID)
		if e != nil {
			return page, e
		}
		match := true
		for _, id := range f.TagIDs {
			if !slices.Contains(tags, id) {
				match = false
			}
		}
		if !match {
			continue
		}
		if f.Query != "" && !strings.Contains(strings.ToLower(m.Title+" "+m.Content), strings.ToLower(f.Query)) {
			continue
		}
		for table, want := range map[string]*bool{"schedules": f.HasSchedule, "places": f.HasPlace} {
			if want != nil {
				_, ok, e := store.Read[json.RawMessage](ctx, r.Store, table, m.ID)
				if e != nil {
					return page, e
				}
				if ok != *want {
					match = false
				}
			}
		}
		if !match {
			continue
		}
		snippet := []rune(m.Content)
		if len(snippet) > 120 {
			snippet = snippet[:120]
		}
		page.Notes = append(page.Notes, note.Summary{ID: m.ID, Title: m.Title, Status: m.Status, SpaceID: m.SpaceID, DueAt: m.DueAt, DueAllDay: m.DueAllDay, Pinned: m.Pinned, Priority: m.Priority, TagIDs: tags, Snippet: string(snippet), Rev: m.Rev, UpdatedAt: m.UpdatedAt, CreatedAt: m.CreatedAt, SortOrder: m.SortOrder})
	}
	sort.Slice(page.Notes, func(i, j int) bool { return less(page.Notes[i], page.Notes[j], f.Order) })
	page.Total = len(page.Notes)
	if f.Cursor != "" {
		b, e := base64.RawURLEncoding.DecodeString(f.Cursor)
		var last note.Summary
		if e != nil || json.Unmarshal(b, &last) != nil {
			return page, fault.Invalid(fault.Violation{Field: "cursor", Reason: "invalid cursor"})
		}
		i := 0
		for i < len(page.Notes) && !less(last, page.Notes[i], f.Order) {
			i++
		}
		page.Notes = page.Notes[i:]
	}
	limit := f.Limit
	if limit == 0 {
		limit = 50
	}
	if limit < 1 || limit > 500 {
		return page, fault.Invalid(fault.Violation{Field: "limit", Reason: "out of range"})
	}
	if len(page.Notes) > limit {
		b, _ := json.Marshal(page.Notes[limit-1])
		page.NextCursor = base64.RawURLEncoding.EncodeToString(b)
		page.Notes = page.Notes[:limit]
	}
	return page, nil
}
