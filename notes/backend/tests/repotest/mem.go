package repotest

import (
	"context"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/attachments"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/focus"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/place"
	"github.com/polterware/polterware/notes/backend/domains/reminder"
	"github.com/polterware/polterware/notes/backend/domains/review"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
	"github.com/polterware/polterware/notes/backend/domains/space"
	"github.com/polterware/polterware/notes/backend/domains/tag"
	"github.com/polterware/polterware/notes/backend/domains/tx"
)

type txKey struct{}

// Mem is a minimal in-memory fake of the repository ports for the shared suite.
type Mem struct {
	mu          sync.Mutex
	spaces      map[string]space.Space
	notes       map[string]note.Note
	tags        map[string]tag.Tag
	noteTags    map[string][]string
	checks      map[string][]note.CheckItem
	completions map[string][]note.Completion
	schedules   map[string]schedule.Schedule
	places      map[string]place.Place
	sessions    []focus.Session
	activity    []activity.Event
	settings    map[string]string
}

func NewMem() *Mem {
	return &Mem{
		spaces:      map[string]space.Space{},
		notes:       map[string]note.Note{},
		tags:        map[string]tag.Tag{},
		noteTags:    map[string][]string{},
		checks:      map[string][]note.CheckItem{},
		completions: map[string][]note.Completion{},
		schedules:   map[string]schedule.Schedule{},
		places:      map[string]place.Place{},
		settings:    map[string]string{},
	}
}

func (m *Mem) Repos() Repos {
	return Repos{
		Tx: m, Spaces: memSpaces{m}, Notes: memNotes{m}, Tags: memTags{m},
		Schedules: memSchedules{m}, Places: memPlaces{m}, Attachments: memAttach{m},
		Focus: memFocus{m}, Activity: memActivity{m}, Settings: memSettings{m},
		Reminders: memReminders{m}, Review: memReview{m},
	}
}

var _ tx.Manager = (*Mem)(nil)

func (m *Mem) Within(ctx context.Context, fn func(context.Context) error) error {
	if inTx(ctx) {
		return fn(ctx)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	snap := m.clone()
	if err := fn(context.WithValue(ctx, txKey{}, true)); err != nil {
		m.restore(snap)
		return err
	}
	return nil
}

func inTx(ctx context.Context) bool {
	v, _ := ctx.Value(txKey{}).(bool)
	return v
}

func (m *Mem) lock(ctx context.Context) func() {
	if inTx(ctx) {
		return func() {}
	}
	m.mu.Lock()
	return m.mu.Unlock
}

type snap struct {
	spaces      map[string]space.Space
	notes       map[string]note.Note
	tags        map[string]tag.Tag
	noteTags    map[string][]string
	checks      map[string][]note.CheckItem
	completions map[string][]note.Completion
	schedules   map[string]schedule.Schedule
	places      map[string]place.Place
	sessions    []focus.Session
	activity    []activity.Event
	settings    map[string]string
}

func (m *Mem) clone() snap {
	s := snap{
		spaces: map[string]space.Space{}, notes: map[string]note.Note{}, tags: map[string]tag.Tag{},
		noteTags: map[string][]string{}, checks: map[string][]note.CheckItem{},
		completions: map[string][]note.Completion{}, schedules: map[string]schedule.Schedule{},
		places: map[string]place.Place{}, settings: map[string]string{},
	}
	for k, v := range m.spaces {
		s.spaces[k] = v
	}
	for k, v := range m.notes {
		s.notes[k] = v
	}
	for k, v := range m.tags {
		s.tags[k] = v
	}
	for k, v := range m.noteTags {
		s.noteTags[k] = append([]string{}, v...)
	}
	for k, v := range m.checks {
		s.checks[k] = append([]note.CheckItem{}, v...)
	}
	for k, v := range m.completions {
		s.completions[k] = append([]note.Completion{}, v...)
	}
	for k, v := range m.schedules {
		s.schedules[k] = v
	}
	for k, v := range m.places {
		s.places[k] = v
	}
	s.sessions = append([]focus.Session{}, m.sessions...)
	s.activity = append([]activity.Event{}, m.activity...)
	for k, v := range m.settings {
		s.settings[k] = v
	}
	return s
}

func (m *Mem) restore(s snap) {
	m.spaces, m.notes, m.tags = s.spaces, s.notes, s.tags
	m.noteTags, m.checks, m.completions = s.noteTags, s.checks, s.completions
	m.schedules, m.places, m.sessions = s.schedules, s.places, s.sessions
	m.activity, m.settings = s.activity, s.settings
}

type memSpaces struct{ *Mem }

func (r memSpaces) List(ctx context.Context) ([]space.Space, error) {
	unlock := r.lock(ctx)
	defer unlock()
	out := make([]space.Space, 0, len(r.spaces))
	for _, m := range r.spaces {
		out = append(out, m)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

func (r memSpaces) Get(ctx context.Context, id string) (space.Space, error) {
	unlock := r.lock(ctx)
	defer unlock()
	m, ok := r.spaces[id]
	if !ok {
		return space.Space{}, fault.NotFound("space", id)
	}
	return m, nil
}

func (r memSpaces) Insert(ctx context.Context, m space.Space) error {
	unlock := r.lock(ctx)
	defer unlock()
	if _, ok := r.spaces[m.ID]; ok {
		return fault.Exists("space", m.ID)
	}
	r.spaces[m.ID] = m
	return nil
}

func (r memSpaces) Update(ctx context.Context, expectedRev int64, m space.Space) error {
	unlock := r.lock(ctx)
	defer unlock()
	cur, ok := r.spaces[m.ID]
	if !ok {
		return fault.NotFound("space", m.ID)
	}
	if expectedRev != 0 && cur.Rev != expectedRev {
		return fault.Conflict("space", m.ID, cur.Rev, cur)
	}
	r.spaces[m.ID] = m
	return nil
}

func (r memSpaces) Delete(ctx context.Context, expectedRev int64, id string) error {
	unlock := r.lock(ctx)
	defer unlock()
	cur, ok := r.spaces[id]
	if !ok {
		return fault.NotFound("space", id)
	}
	if expectedRev != 0 && cur.Rev != expectedRev {
		return fault.Conflict("space", id, cur.Rev, cur)
	}
	r.deleteSpaceLocked(id)
	return nil
}

func (m *Mem) deleteSpaceLocked(id string) {
	for _, child := range m.spaces {
		if child.ParentID != nil && *child.ParentID == id {
			m.deleteSpaceLocked(child.ID)
		}
	}
	for k, mem := range m.notes {
		if mem.SpaceID != nil && *mem.SpaceID == id {
			mem.SpaceID = nil
			m.notes[k] = mem
		}
	}
	delete(m.spaces, id)
}

type memNotes struct{ *Mem }

func (r memNotes) Get(ctx context.Context, id string) (note.Note, error) {
	unlock := r.lock(ctx)
	defer unlock()
	m, ok := r.notes[id]
	if !ok {
		return note.Note{}, fault.NotFound("note", id)
	}
	return m, nil
}

func (r memNotes) Insert(ctx context.Context, m note.Note) error {
	unlock := r.lock(ctx)
	defer unlock()
	if _, ok := r.notes[m.ID]; ok {
		return fault.Exists("note", m.ID)
	}
	r.notes[m.ID] = m
	return nil
}

func (r memNotes) Update(ctx context.Context, expectedRev int64, m note.Note) error {
	unlock := r.lock(ctx)
	defer unlock()
	cur, ok := r.notes[m.ID]
	if !ok {
		return fault.NotFound("note", m.ID)
	}
	if expectedRev != 0 && cur.Rev != expectedRev {
		return fault.Conflict("note", m.ID, cur.Rev, cur)
	}
	r.notes[m.ID] = m
	return nil
}

func (r memNotes) Delete(ctx context.Context, expectedRev int64, id string) error {
	unlock := r.lock(ctx)
	defer unlock()
	cur, ok := r.notes[id]
	if !ok {
		return fault.NotFound("note", id)
	}
	if expectedRev != 0 && cur.Rev != expectedRev {
		return fault.Conflict("note", id, cur.Rev, cur)
	}
	delete(r.notes, id)
	delete(r.checks, id)
	delete(r.noteTags, id)
	delete(r.completions, id)
	delete(r.schedules, id)
	delete(r.places, id)
	return nil
}

func (r memNotes) ListCheckItems(ctx context.Context, noteID string) ([]note.CheckItem, error) {
	unlock := r.lock(ctx)
	defer unlock()
	return append([]note.CheckItem{}, r.checks[noteID]...), nil
}

func (r memNotes) ReplaceCheckItems(ctx context.Context, noteID string, items []note.CheckItem) error {
	unlock := r.lock(ctx)
	defer unlock()
	if _, ok := r.notes[noteID]; !ok {
		return fault.NotFound("note", noteID)
	}
	r.checks[noteID] = append([]note.CheckItem{}, items...)
	return nil
}

func (r memNotes) GetCheckItem(ctx context.Context, id string) (note.CheckItem, error) {
	unlock := r.lock(ctx)
	defer unlock()
	for _, items := range r.checks {
		for _, item := range items {
			if item.ID == id {
				return item, nil
			}
		}
	}
	return note.CheckItem{}, fault.NotFound("check_item", id)
}

func (r memNotes) UpdateCheckItem(ctx context.Context, item note.CheckItem) error {
	unlock := r.lock(ctx)
	defer unlock()
	items := r.checks[item.NoteID]
	for i, cur := range items {
		if cur.ID == item.ID {
			items[i] = item
			r.checks[item.NoteID] = items
			return nil
		}
	}
	return fault.NotFound("check_item", item.ID)
}

func (r memNotes) ListTagIDs(ctx context.Context, noteID string) ([]string, error) {
	unlock := r.lock(ctx)
	defer unlock()
	return append([]string{}, r.noteTags[noteID]...), nil
}

func (r memNotes) SetTagIDs(ctx context.Context, noteID string, tagIDs []string) error {
	unlock := r.lock(ctx)
	defer unlock()
	if _, ok := r.notes[noteID]; !ok {
		return fault.NotFound("note", noteID)
	}
	r.noteTags[noteID] = append([]string{}, tagIDs...)
	return nil
}

func (r memNotes) ListCompletions(ctx context.Context, noteID string) ([]note.Completion, error) {
	unlock := r.lock(ctx)
	defer unlock()
	return append([]note.Completion{}, r.completions[noteID]...), nil
}

func (r memNotes) InsertCompletion(ctx context.Context, c note.Completion) error {
	unlock := r.lock(ctx)
	defer unlock()
	r.completions[c.NoteID] = append(r.completions[c.NoteID], c)
	return nil
}

func (r memNotes) DeleteCompletion(ctx context.Context, noteID string, occurrenceAt time.Time) error {
	unlock := r.lock(ctx)
	defer unlock()
	cur := r.completions[noteID]
	next := cur[:0:0]
	found := false
	for _, c := range cur {
		if c.OccurrenceAt.Equal(occurrenceAt) {
			found = true
			continue
		}
		next = append(next, c)
	}
	if !found {
		return fault.NotFound("completion", noteID)
	}
	r.completions[noteID] = next
	return nil
}

func (r memNotes) CountBySpaces(ctx context.Context, spaceIDs []string) (int, error) {
	unlock := r.lock(ctx)
	defer unlock()
	set := map[string]bool{}
	for _, id := range spaceIDs {
		set[id] = true
	}
	n := 0
	for _, m := range r.notes {
		if m.SpaceID != nil && set[*m.SpaceID] {
			n++
		}
	}
	return n, nil
}

func (r memNotes) List(ctx context.Context, filter note.ListFilter) (note.ListPage, error) {
	unlock := r.lock(ctx)
	defer unlock()
	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	type row struct {
		m note.Note
	}
	var all []row
	for _, m := range r.notes {
		if filter.InboxOnly && m.SpaceID != nil {
			continue
		}
		if filter.SpaceID != nil && (m.SpaceID == nil || *m.SpaceID != *filter.SpaceID) && !filter.IncludeDescendants {
			continue
		}
		if filter.Status != "" && m.Status != filter.Status {
			continue
		}
		all = append(all, row{m})
	}
	sort.Slice(all, func(i, j int) bool {
		if !all[i].m.UpdatedAt.Equal(all[j].m.UpdatedAt) {
			return all[i].m.UpdatedAt.After(all[j].m.UpdatedAt)
		}
		return all[i].m.ID > all[j].m.ID
	})
	start := 0
	if filter.Cursor != "" {
		for i, item := range all {
			if item.m.ID == strings.TrimPrefix(filter.Cursor, "id:") {
				start = i + 1
				break
			}
		}
	}
	total := len(all)
	end := start + limit
	next := ""
	if end < total {
		next = "id:" + all[end-1].m.ID
	} else {
		end = total
	}
	if start > total {
		start = total
	}
	page := []note.Summary{}
	for _, item := range all[start:end] {
		page = append(page, note.Summary{
			ID: item.m.ID, Title: item.m.Title, Status: item.m.Status, SpaceID: item.m.SpaceID,
			DueAt: item.m.DueAt, DueAllDay: item.m.DueAllDay, Pinned: item.m.Pinned, Priority: item.m.Priority,
			TagIDs: append([]string{}, r.noteTags[item.m.ID]...), Rev: item.m.Rev,
			UpdatedAt: item.m.UpdatedAt, CreatedAt: item.m.CreatedAt, SortOrder: item.m.SortOrder,
		})
	}
	return note.ListPage{Notes: page, NextCursor: next, Total: total}, nil
}

type memTags struct{ *Mem }

func (r memTags) List(ctx context.Context) ([]tag.Tag, error) {
	unlock := r.lock(ctx)
	defer unlock()
	out := []tag.Tag{}
	for _, t := range r.tags {
		t.UsageCount = r.usageLocked(t.ID)
		out = append(out, t)
	}
	return out, nil
}

func (r memTags) usageLocked(id string) int {
	n := 0
	for _, ids := range r.noteTags {
		for _, tagID := range ids {
			if tagID == id {
				n++
			}
		}
	}
	return n
}

func (r memTags) Get(ctx context.Context, id string) (tag.Tag, error) {
	unlock := r.lock(ctx)
	defer unlock()
	t, ok := r.tags[id]
	if !ok {
		return tag.Tag{}, fault.NotFound("tag", id)
	}
	t.UsageCount = r.usageLocked(id)
	return t, nil
}

func (r memTags) GetByName(ctx context.Context, name string) (tag.Tag, error) {
	unlock := r.lock(ctx)
	defer unlock()
	for _, t := range r.tags {
		if strings.EqualFold(t.Name, name) {
			t.UsageCount = r.usageLocked(t.ID)
			return t, nil
		}
	}
	return tag.Tag{}, fault.NotFound("tag", name)
}

func (r memTags) Insert(ctx context.Context, t tag.Tag) error {
	unlock := r.lock(ctx)
	defer unlock()
	r.tags[t.ID] = t
	return nil
}

func (r memTags) Update(ctx context.Context, expectedRev int64, t tag.Tag) error {
	unlock := r.lock(ctx)
	defer unlock()
	cur, ok := r.tags[t.ID]
	if !ok {
		return fault.NotFound("tag", t.ID)
	}
	if expectedRev != 0 && cur.Rev != expectedRev {
		return fault.Conflict("tag", t.ID, cur.Rev, cur)
	}
	r.tags[t.ID] = t
	return nil
}

func (r memTags) Delete(ctx context.Context, id string) error {
	unlock := r.lock(ctx)
	defer unlock()
	delete(r.tags, id)
	for mem, ids := range r.noteTags {
		next := ids[:0:0]
		for _, tagID := range ids {
			if tagID != id {
				next = append(next, tagID)
			}
		}
		r.noteTags[mem] = next
	}
	return nil
}

func (r memTags) Retarget(ctx context.Context, fromID, toID string) (int, error) {
	unlock := r.lock(ctx)
	defer unlock()
	moved := 0
	for mem, ids := range r.noteTags {
		next := []string{}
		seen := map[string]bool{}
		for _, id := range ids {
			if id == fromID {
				id = toID
				moved++
			}
			if seen[id] {
				continue
			}
			seen[id] = true
			next = append(next, id)
		}
		r.noteTags[mem] = next
	}
	return moved, nil
}

func (r memTags) Names(ctx context.Context) ([]string, error) {
	unlock := r.lock(ctx)
	defer unlock()
	out := []string{}
	for _, t := range r.tags {
		out = append(out, t.Name)
	}
	return out, nil
}

type memSchedules struct{ *Mem }

func (r memSchedules) Get(ctx context.Context, noteID string) (schedule.Schedule, error) {
	unlock := r.lock(ctx)
	defer unlock()
	s, ok := r.schedules[noteID]
	if !ok {
		return schedule.Schedule{}, fault.NotFound("schedule", noteID)
	}
	return s, nil
}

func (r memSchedules) Upsert(ctx context.Context, s schedule.Schedule) error {
	unlock := r.lock(ctx)
	defer unlock()
	r.schedules[s.NoteID] = s
	return nil
}

func (r memSchedules) Delete(ctx context.Context, noteID string) error {
	unlock := r.lock(ctx)
	defer unlock()
	if _, ok := r.schedules[noteID]; !ok {
		return fault.NotFound("schedule", noteID)
	}
	delete(r.schedules, noteID)
	return nil
}

func (r memSchedules) ListActive(ctx context.Context) ([]schedule.Schedule, error) {
	unlock := r.lock(ctx)
	defer unlock()
	out := []schedule.Schedule{}
	for _, s := range r.schedules {
		if s.Active {
			out = append(out, s)
		}
	}
	return out, nil
}

type memPlaces struct{ *Mem }

func (r memPlaces) Get(ctx context.Context, noteID string) (place.Place, error) {
	unlock := r.lock(ctx)
	defer unlock()
	p, ok := r.places[noteID]
	if !ok {
		return place.Place{}, fault.NotFound("place", noteID)
	}
	return p, nil
}

func (r memPlaces) Upsert(ctx context.Context, p place.Place) error {
	unlock := r.lock(ctx)
	defer unlock()
	r.places[p.NoteID] = p
	return nil
}

func (r memPlaces) Delete(ctx context.Context, noteID string) error {
	unlock := r.lock(ctx)
	defer unlock()
	delete(r.places, noteID)
	return nil
}

func (r memPlaces) ListInBounds(ctx context.Context, b place.Bounds) ([]place.Place, error) {
	unlock := r.lock(ctx)
	defer unlock()
	out := []place.Place{}
	for _, p := range r.places {
		if p.Lat < b.South || p.Lat > b.North {
			continue
		}
		if b.West <= b.East {
			if p.Lng < b.West || p.Lng > b.East {
				continue
			}
		} else if p.Lng < b.West && p.Lng > b.East {
			continue
		}
		out = append(out, p)
	}
	return out, nil
}

type memAttach struct{ *Mem }

func (memAttach) List(context.Context, string) ([]attachments.Attachment, error) {
	return []attachments.Attachment{}, nil
}
func (memAttach) Get(_ context.Context, id string) (attachments.Attachment, error) {
	return attachments.Attachment{}, fault.NotFound("attachment", id)
}
func (memAttach) Insert(context.Context, attachments.Attachment) error { return nil }
func (memAttach) Delete(context.Context, string) error                 { return nil }
func (memAttach) Reorder(context.Context, string, []string) error      { return nil }
func (memAttach) ImportFile(context.Context, string, string, string) (attachments.ImportedFile, error) {
	return attachments.ImportedFile{}, fault.Unavailable("fake")
}
func (memAttach) AbsolutePath(string) (string, error) { return "", fault.Unavailable("fake") }
func (memAttach) RemoveFile(context.Context, string) error {
	return fault.Unavailable("fake")
}

type memFocus struct{ *Mem }

func (r memFocus) InsertSession(ctx context.Context, s focus.Session) error {
	unlock := r.lock(ctx)
	defer unlock()
	r.sessions = append(r.sessions, s)
	return nil
}

func (r memFocus) ListSessions(ctx context.Context, from, to time.Time) ([]focus.Session, error) {
	unlock := r.lock(ctx)
	defer unlock()
	out := []focus.Session{}
	for _, s := range r.sessions {
		if !s.StartedAt.Before(from) && !s.StartedAt.After(to) {
			out = append(out, s)
		}
	}
	return out, nil
}

type memActivity struct{ *Mem }

func (r memActivity) Append(ctx context.Context, e activity.Event) error {
	unlock := r.lock(ctx)
	defer unlock()
	r.activity = append(r.activity, e)
	return nil
}

func (r memActivity) List(ctx context.Context, cursor, actor string, limit int) (activity.Page, error) {
	unlock := r.lock(ctx)
	defer unlock()
	if limit <= 0 {
		limit = 50
	}
	items := append([]activity.Event{}, r.activity...)
	sort.Slice(items, func(i, j int) bool {
		if !items[i].At.Equal(items[j].At) {
			return items[i].At.After(items[j].At)
		}
		return items[i].ID > items[j].ID
	})
	filtered := []activity.Event{}
	for _, e := range items {
		if actor != "" && e.Actor != actor {
			continue
		}
		filtered = append(filtered, e)
	}
	start := 0
	if cursor != "" {
		for i, e := range filtered {
			if e.ID == strings.TrimPrefix(cursor, "id:") {
				start = i + 1
				break
			}
		}
	}
	end := start + limit
	next := ""
	if end < len(filtered) {
		next = "id:" + filtered[end-1].ID
	} else {
		end = len(filtered)
	}
	if start > len(filtered) {
		start = len(filtered)
	}
	return activity.Page{Events: filtered[start:end], NextCursor: next}, nil
}

type memSettings struct{ *Mem }

func (r memSettings) Get(ctx context.Context, key string) (string, bool, error) {
	unlock := r.lock(ctx)
	defer unlock()
	v, ok := r.settings[key]
	return v, ok, nil
}

func (r memSettings) Set(ctx context.Context, key, valueJSON string) error {
	unlock := r.lock(ctx)
	defer unlock()
	r.settings[key] = valueJSON
	return nil
}

func (r memSettings) List(ctx context.Context) (map[string]string, error) {
	unlock := r.lock(ctx)
	defer unlock()
	out := map[string]string{}
	for k, v := range r.settings {
		out[k] = v
	}
	return out, nil
}

type memReminders struct{ *Mem }

func (memReminders) ListDue(context.Context, time.Time, time.Time) ([]reminder.OneOff, error) {
	return []reminder.OneOff{}, nil
}
func (memReminders) Insert(context.Context, reminder.OneOff) error { return nil }
func (memReminders) Delete(context.Context, string) error          { return nil }
func (memReminders) Prune(context.Context, time.Time) error        { return nil }
func (memReminders) SetHeartbeat(context.Context, time.Time, string, int) error {
	return nil
}
func (memReminders) LastSeen(context.Context) (time.Time, string, int, bool, error) {
	return time.Time{}, "", 0, false, nil
}

type memReview struct{ *Mem }

func (memReview) Completions(context.Context, time.Time, time.Time) ([]review.Completion, error) {
	return []review.Completion{}, nil
}
func (memReview) FocusSpans(context.Context, time.Time, time.Time) ([]review.FocusSpan, error) {
	return []review.FocusSpan{}, nil
}
