package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"

	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/polterware/polterware/notes/backend/domains/attachments"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
	"github.com/polterware/polterware/notes/backend/domains/space"
)

func (s *Server) createNotes(ctx context.Context, req *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	var in struct {
		Items []createItem `json:"items"`
	}
	if err := decodeArgs(req, &in); err != nil {
		return fail(err), nil
	}
	if len(in.Items) == 0 {
		return fail(fmt.Errorf("create_notes needs at least 1 item")), nil
	}
	if len(in.Items) > MaxBatch {
		return fail(fmt.Errorf("create_notes accepts at most %d items", MaxBatch)), nil
	}
	sess := s.session(req)
	results := make([]map[string]any, 0, len(in.Items))
	okCount := 0
	for _, item := range in.Items {
		row, err := s.createOne(ctx, sess, item)
		if err != nil {
			results = append(results, itemError("", err))
			continue
		}
		okCount++
		results = append(results, row)
	}
	return ok(fmt.Sprintf("created %d", okCount), map[string]any{"results": results, "actor": sess.Actor().Raw}), nil
}

type createItem struct {
	Title     string            `json:"title"`
	Content   string            `json:"content"`
	Space     string            `json:"space"`
	Tags      []string          `json:"tags"`
	Due       string            `json:"due"`
	Pinned    bool              `json:"pinned"`
	Checklist []json.RawMessage `json:"checklist"`
	Schedule  json.RawMessage   `json:"schedule"`
	Place     json.RawMessage   `json:"place"`
	Links     []linkIn          `json:"links"`
}

type linkIn struct {
	URL   string `json:"url"`
	Title string `json:"title"`
}

func (s *Server) createOne(ctx context.Context, sess *NoteSession, item createItem) (map[string]any, error) {
	if err := s.validateCreateExtras(item); err != nil {
		return nil, err
	}
	if s.deps.Within == nil {
		if len(item.Schedule) > 0 || len(item.Place) > 0 || len(item.Links) > 0 {
			return nil, fault.Unavailable("atomic creation backend is not wired")
		}
		return s.createOneInTx(ctx, sess, item)
	}
	var row map[string]any
	// Do not publish revisions from a rolled-back item into the real session.
	provisional := NewNoteSession(s.deps.Notes, "unknown")
	provisional.actor = sess.Actor()
	err := s.deps.Within(ctx, func(ctx context.Context) error {
		var err error
		row, err = s.createOneInTx(ctx, provisional, item)
		if err != nil {
			return err
		}
		got, err := s.deps.Notes.Get(ctx, row["id"].(string), note.Include{})
		if err == nil {
			row["rev"] = got.Note.Rev
		}
		return err
	})
	if err != nil {
		return nil, err
	}
	sess.observe(row["id"].(string), row["rev"].(int64))
	return row, nil
}

func (s *Server) validateCreateExtras(item createItem) error {
	if len(item.Schedule) > 0 && string(item.Schedule) != "null" {
		if s.deps.Schedules == nil {
			return fault.Unavailable("schedule backend is not wired")
		}
		if _, _, err := parseSchedule(item.Schedule, "pending"); err != nil {
			return err
		}
	}
	if len(item.Place) > 0 && string(item.Place) != "null" {
		if s.deps.Places == nil {
			return fault.Unavailable("place backend is not wired")
		}
		if _, err := parsePlace(item.Place, "pending"); err != nil {
			return err
		}
	}
	if len(item.Links) > 0 && s.deps.Attachments == nil {
		return fault.Unavailable("attachments backend is not wired")
	}
	for _, link := range item.Links {
		u, err := url.ParseRequestURI(link.URL)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" {
			return fmt.Errorf("link must be an absolute HTTP(S) URL")
		}
	}
	return nil
}

func (s *Server) createOneInTx(ctx context.Context, sess *NoteSession, item createItem) (map[string]any, error) {
	in := note.Create{Title: item.Title, Content: item.Content, Pinned: item.Pinned}
	if item.Space != "" {
		id, err := optionalSpace(ctx, s.deps.Spaces, item.Space)
		if err != nil {
			return nil, err
		}
		in.SpaceID = id
	}
	if len(item.Tags) > 0 {
		if s.deps.Tags == nil {
			return nil, fault.Unavailable("tags backend is not wired")
		}
		ids, err := resolveTags(ctx, s.deps.Tags, item.Tags)
		if err != nil {
			return nil, err
		}
		in.TagIDs = ids
	}
	due, allDay, err := parseDue(item.Due)
	if err != nil {
		return nil, err
	}
	in.DueAt, in.DueAllDay = due, allDay
	if len(item.Checklist) > 0 {
		in.Checklist, err = parseChecklist(item.Checklist)
		if err != nil {
			return nil, err
		}
	}
	created, err := sess.Create(ctx, in)
	if err != nil {
		return nil, err
	}
	extra := map[string]any{"rev": created.Rev, "title": created.Title}
	if len(item.Schedule) > 0 && string(item.Schedule) != "null" {
		next, err := s.setSchedule(ctx, sess, created.ID, item.Schedule)
		if err != nil {
			return nil, err
		}
		if len(next) > 0 {
			extra["nextOccurrences"] = next
		}
	}
	if len(item.Place) > 0 && string(item.Place) != "null" {
		if err := s.setPlace(ctx, sess, created.ID, item.Place); err != nil {
			return nil, err
		}
	}
	if err := s.addLinks(ctx, created.ID, item.Links); err != nil {
		return nil, err
	}
	return itemOK(created.ID, extra), nil
}

func (s *Server) updateNotes(ctx context.Context, req *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	var in struct {
		Items []updateItem `json:"items"`
	}
	if err := decodeArgs(req, &in); err != nil {
		return fail(err), nil
	}
	if len(in.Items) == 0 {
		return fail(fmt.Errorf("update_notes needs at least 1 item")), nil
	}
	if len(in.Items) > MaxBatch {
		return fail(fmt.Errorf("update_notes accepts at most %d items", MaxBatch)), nil
	}
	sess := s.session(req)
	results := make([]map[string]any, 0, len(in.Items))
	okCount := 0
	for _, item := range in.Items {
		row, err := s.updateOne(ctx, sess, item)
		if err != nil {
			results = append(results, itemError(item.ID, err))
			continue
		}
		okCount++
		results = append(results, row)
	}
	return ok(fmt.Sprintf("updated %d", okCount), map[string]any{"results": results}), nil
}

type updateItem struct {
	ID          string            `json:"id"`
	ExpectedRev *int64            `json:"expectedRev"`
	Title       nullable[string]  `json:"title"`
	Content     nullable[string]  `json:"content"`
	Space       nullable[string]  `json:"space"`
	Tags        []string          `json:"tags"`
	AddTags     []string          `json:"addTags"`
	RemoveTags  []string          `json:"removeTags"`
	Due         nullable[string]  `json:"due"`
	Pinned      nullable[bool]    `json:"pinned"`
	Checklist   []json.RawMessage `json:"checklist"`
	Schedule    json.RawMessage   `json:"schedule"`
	Place       json.RawMessage   `json:"place"`
	Links       []linkIn          `json:"links"`
}

func (s *Server) updateOne(ctx context.Context, sess *NoteSession, item updateItem) (map[string]any, error) {
	if item.ID == "" {
		return nil, fmt.Errorf("id is required")
	}
	if s.deps.Within == nil {
		if item.Checklist != nil || item.Tags != nil || len(item.AddTags)+len(item.RemoveTags)+len(item.Schedule)+len(item.Place)+len(item.Links) > 0 {
			return nil, fault.Unavailable("atomic update backend is not wired")
		}
		// A field-only update already returns its final domain revision.
		return s.updateOneInTx(ctx, sess, item)
	}
	// Stage session observations until every relation write and the final
	// snapshot have committed. The snapshot uses the same writer transaction.
	provisional := sess.provisional()
	var row map[string]any
	err := s.deps.Within(ctx, func(ctx context.Context) error {
		var err error
		row, err = s.updateOneInTx(ctx, provisional, item)
		if err != nil {
			return err
		}
		got, err := s.deps.Notes.Get(ctx, item.ID, note.Include{})
		if err == nil {
			row["rev"] = got.Note.Rev
		}
		return err
	})
	if err != nil {
		return nil, err
	}
	sess.observe(item.ID, row["rev"].(int64))
	return row, nil
}

func (s *Server) updateOneInTx(ctx context.Context, sess *NoteSession, item updateItem) (map[string]any, error) {
	patch := note.Patch{}
	if item.Title.Set && !item.Title.Null {
		patch.Title = &item.Title.Value
	}
	if item.Content.Set {
		if item.Content.Null {
			empty := ""
			patch.Content = &empty
		} else {
			patch.Content = &item.Content.Value
		}
	}
	if item.Space.Set {
		if item.Space.Null || item.Space.Value == "" {
			patch.ClearSpaceID = true
		} else {
			id, err := optionalSpace(ctx, s.deps.Spaces, item.Space.Value)
			if err != nil {
				return nil, err
			}
			patch.SpaceID = id
		}
	}
	if item.Due.Set {
		if item.Due.Null || item.Due.Value == "" {
			patch.ClearDueAt = true
		} else {
			due, allDay, err := parseDue(item.Due.Value)
			if err != nil {
				return nil, err
			}
			patch.DueAt, patch.DueAllDay = due, &allDay
		}
	}
	if item.Pinned.Set && !item.Pinned.Null {
		patch.Pinned = &item.Pinned.Value
	}
	updated, err := sess.Update(ctx, item.ID, item.ExpectedRev, patch)
	if err != nil {
		return nil, err
	}
	if item.Checklist != nil {
		items, err := parseChecklist(item.Checklist)
		if err != nil {
			return nil, err
		}
		if _, err := s.deps.Notes.ReplaceChecklist(ctx, sess.Actor(), item.ID, updated.Rev, items); err != nil {
			return nil, err
		}
		updated.Rev++
		sess.observe(updated.ID, updated.Rev)
	}
	updated.Rev, err = s.applyTagChanges(ctx, sess, item, updated.Rev)
	if err != nil {
		return nil, err
	}
	extra := map[string]any{"rev": updated.Rev, "title": updated.Title}
	if len(item.Schedule) > 0 {
		if string(item.Schedule) == "null" {
			if s.deps.Schedules == nil {
				return nil, fault.Unavailable("schedule backend is not wired")
			}
			if err := s.deps.Schedules.Clear(ctx, sess.Actor(), item.ID); err != nil && !fault.IsCode(err, fault.CodeNotFound) {
				return nil, err
			}
		} else {
			next, err := s.setSchedule(ctx, sess, item.ID, item.Schedule)
			if err != nil {
				return nil, err
			}
			if len(next) > 0 {
				extra["nextOccurrences"] = next
			}
		}
	}
	if len(item.Place) > 0 {
		if string(item.Place) == "null" {
			if s.deps.Places != nil {
				if err := s.deps.Places.Clear(ctx, sess.Actor(), item.ID); err != nil && !fault.IsCode(err, fault.CodeNotFound) {
					return nil, err
				}
			}
		} else if err := s.setPlace(ctx, sess, item.ID, item.Place); err != nil {
			return nil, err
		}
	}
	if err := s.addLinks(ctx, item.ID, item.Links); err != nil {
		return nil, err
	}
	return itemOK(item.ID, extra), nil
}

func (s *Server) applyTagChanges(ctx context.Context, sess *NoteSession, item updateItem, rev int64) (int64, error) {
	if item.Tags == nil && len(item.AddTags) == 0 && len(item.RemoveTags) == 0 {
		return rev, nil
	}
	if s.deps.Tags == nil {
		return rev, fault.Unavailable("tags backend is not wired")
	}
	current, err := s.deps.Notes.Get(ctx, item.ID, note.Include{Tags: true})
	if err != nil {
		return rev, err
	}
	ids := append([]string{}, current.TagIDs...)
	if item.Tags != nil {
		ids, err = resolveTags(ctx, s.deps.Tags, item.Tags)
		if err != nil {
			return rev, err
		}
	}
	if len(item.AddTags) > 0 {
		add, err := resolveTags(ctx, s.deps.Tags, item.AddTags)
		if err != nil {
			return rev, err
		}
		ids = union(ids, add)
	}
	if len(item.RemoveTags) > 0 {
		remove, err := resolveTags(ctx, s.deps.Tags, item.RemoveTags)
		if err != nil {
			return rev, err
		}
		ids = subtract(ids, remove)
	}
	if err := s.deps.Notes.SetTags(ctx, sess.Actor(), item.ID, rev, ids); err != nil {
		return rev, err
	}
	// SetTags increments exactly once under its revision check.
	rev++
	sess.observe(item.ID, rev)
	return rev, nil
}

func (s *Server) setNoteStatus(ctx context.Context, req *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	var in struct {
		ID          string `json:"id"`
		Status      string `json:"status"`
		Occurrence  string `json:"occurrence"`
		ExpectedRev *int64 `json:"expectedRev"`
	}
	if err := decodeArgs(req, &in); err != nil {
		return fail(err), nil
	}
	if in.ID == "" || in.Status == "" {
		return fail(fmt.Errorf("id and status are required")), nil
	}
	var occurrence *time.Time
	if in.Occurrence != "" {
		at, err := parseInstant(in.Occurrence, "occurrence")
		if err != nil {
			return fail(err), nil
		}
		occurrence = at
	}
	updated, err := s.session(req).SetStatus(ctx, in.ID, in.ExpectedRev, in.Status, occurrence)
	if err != nil {
		return fail(err), nil
	}
	return ok(updated.Title+" is "+updated.Status, map[string]any{"id": updated.ID, "status": updated.Status, "rev": updated.Rev}), nil
}

func (s *Server) toggleCheckItem(ctx context.Context, req *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	var in struct {
		NoteID      string `json:"noteId"`
		ItemID      string `json:"itemId"`
		ItemTitle   string `json:"itemTitle"`
		ExpectedRev *int64 `json:"expectedRev"`
	}
	if err := decodeArgs(req, &in); err != nil {
		return fail(err), nil
	}
	if in.NoteID == "" {
		return fail(fmt.Errorf("noteId is required")), nil
	}
	sess := s.session(req)
	itemID := in.ItemID
	explicit := in.ExpectedRev
	if itemID == "" {
		if in.ItemTitle == "" {
			return fail(fmt.Errorf("itemId or itemTitle is required")), nil
		}
		expected := sess.expected(in.NoteID, explicit)
		got, err := s.deps.Notes.Get(ctx, in.NoteID, note.Include{Checklist: true})
		if err != nil {
			return fail(err), nil
		}
		// The title lookup is internal, not a snapshot returned to the agent.
		// Preserve a prior read revision; on the first write, pin this lookup.
		if explicit == nil {
			if expected == 0 {
				expected = got.Note.Rev
			}
			explicit = &expected
		}
		for _, item := range got.Checklist {
			if strings.EqualFold(item.Title, in.ItemTitle) {
				itemID = item.ID
				break
			}
		}
		if itemID == "" {
			return fail(fmt.Errorf("checklist item %q not found", in.ItemTitle)), nil
		}
	}
	item, rev, err := sess.ToggleWithRevision(ctx, in.NoteID, itemID, explicit, nil)
	if err != nil {
		return fail(err), nil
	}
	return ok(item.Title, map[string]any{"id": item.ID, "title": item.Title, "done": item.Done, "noteId": in.NoteID, "rev": rev}), nil
}

func (s *Server) deleteNotes(ctx context.Context, req *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	var in struct {
		IDs         []string         `json:"ids"`
		Confirm     bool             `json:"confirm"`
		ExpectedRev map[string]int64 `json:"expectedRev"`
	}
	if err := decodeArgs(req, &in); err != nil {
		return fail(err), nil
	}
	if len(in.IDs) == 0 {
		return fail(fmt.Errorf("ids is required")), nil
	}
	if len(in.IDs) > MaxBatch {
		return fail(fmt.Errorf("delete_notes accepts at most %d ids", MaxBatch)), nil
	}
	titles := make([]string, 0, len(in.IDs))
	for _, id := range in.IDs {
		got, err := s.deps.Notes.Get(ctx, id, note.Include{})
		if err != nil {
			titles = append(titles, id)
			continue
		}
		titles = append(titles, got.Note.Title)
	}
	if !in.Confirm {
		return fail(fmt.Errorf("refusing to delete. Set confirm true. Would delete: %s", strings.Join(titles, ", "))), nil
	}
	sess := s.session(req)
	results := make([]map[string]any, 0, len(in.IDs))
	okCount := 0
	for _, id := range in.IDs {
		var explicit *int64
		if rev, ok := in.ExpectedRev[id]; ok {
			explicit = &rev
		}
		if err := sess.Delete(ctx, id, explicit); err != nil {
			results = append(results, itemError(id, err))
			continue
		}
		okCount++
		results = append(results, itemOK(id, nil))
	}
	return ok(fmt.Sprintf("deleted %d", okCount), map[string]any{"results": results}), nil
}

func (s *Server) createSpace(ctx context.Context, req *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	var in struct {
		Name      string `json:"name"`
		Parent    string `json:"parent"`
		Color     string `json:"color"`
		Icon      string `json:"icon"`
		SortOrder int    `json:"sortOrder"`
	}
	if err := decodeArgs(req, &in); err != nil {
		return fail(err), nil
	}
	create := space.Create{Name: in.Name, SortOrder: in.SortOrder}
	if in.Parent != "" {
		id, err := optionalSpace(ctx, s.deps.Spaces, in.Parent)
		if err != nil {
			return fail(err), nil
		}
		create.ParentID = id
	}
	if in.Color != "" {
		create.Color = &in.Color
	}
	if in.Icon != "" {
		create.Icon = &in.Icon
	}
	created, err := s.deps.Spaces.Create(ctx, s.session(req).Actor(), create)
	if err != nil {
		return fail(err), nil
	}
	s.session(req).observeSpace(created.ID, created.Rev)
	return ok(created.Name, spaceJSON(created)), nil
}

func (s *Server) updateSpace(ctx context.Context, req *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	var in struct {
		ID          string           `json:"id"`
		Name        string           `json:"name"`
		NewName     string           `json:"newName"`
		Parent      nullable[string] `json:"parent"`
		Color       nullable[string] `json:"color"`
		Icon        nullable[string] `json:"icon"`
		SortOrder   *int             `json:"sortOrder"`
		ExpectedRev *int64           `json:"expectedRev"`
	}
	if err := decodeArgs(req, &in); err != nil {
		return fail(err), nil
	}
	ref := in.ID
	if ref == "" {
		ref = in.Name
	}
	if ref == "" {
		return fail(fmt.Errorf("id or name is required")), nil
	}
	got, err := resolveSpace(ctx, s.deps.Spaces, ref)
	if err != nil {
		return fail(err), nil
	}
	patch := space.Patch{SortOrder: in.SortOrder}
	if in.NewName != "" {
		patch.Name = &in.NewName
	} else if in.Name != "" && in.ID != "" {
		patch.Name = &in.Name
	}
	if in.Parent.Set {
		if in.Parent.Null || in.Parent.Value == "" {
			patch.ClearParent = true
		} else {
			id, err := optionalSpace(ctx, s.deps.Spaces, in.Parent.Value)
			if err != nil {
				return fail(err), nil
			}
			patch.ParentID = id
		}
	}
	if in.Color.Set {
		if in.Color.Null {
			patch.ClearColor = true
		} else {
			patch.Color = &in.Color.Value
		}
	}
	if in.Icon.Set {
		if in.Icon.Null {
			patch.ClearIcon = true
		} else {
			patch.Icon = &in.Icon.Value
		}
	}
	sess := s.session(req)
	updated, err := s.deps.Spaces.Update(ctx, sess.Actor(), got.ID, sess.expectedSpace(got.ID, in.ExpectedRev), patch)
	if err != nil {
		return fail(err), nil
	}
	sess.observeSpace(updated.ID, updated.Rev)
	return ok(updated.Name, spaceJSON(updated)), nil
}

func (s *Server) deleteSpace(ctx context.Context, req *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	var in struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		Confirm     bool   `json:"confirm"`
		ExpectedRev *int64 `json:"expectedRev"`
	}
	if err := decodeArgs(req, &in); err != nil {
		return fail(err), nil
	}
	ref := in.ID
	if ref == "" {
		ref = in.Name
	}
	if ref == "" {
		return fail(fmt.Errorf("id or name is required")), nil
	}
	got, err := resolveSpace(ctx, s.deps.Spaces, ref)
	if err != nil {
		return fail(err), nil
	}
	if !in.Confirm {
		return fail(fmt.Errorf("refusing to delete space %q. Children are deleted and notes move to Inbox. Set confirm true", got.Name)), nil
	}
	sess := s.session(req)
	if s.deps.Within == nil {
		return fail(fault.Unavailable("atomic space deletion backend is not wired")), nil
	}
	var result space.DeleteResult
	revisions := map[string]int64{}
	err = s.deps.Within(ctx, func(ctx context.Context) error {
		// Only advance notes whose pre-delete revision the session knew.
		// An unseen UI edit must remain a conflict on the next note write.
		var moved []string
		filter := note.ListFilter{SpaceID: &got.ID, IncludeDescendants: true, Limit: 500}
		for {
			page, err := s.deps.Notes.List(ctx, filter)
			if err != nil {
				return err
			}
			for _, m := range page.Notes {
				expected := sess.expected(m.ID, nil)
				if expected == 0 || expected == m.Rev {
					moved = append(moved, m.ID)
				}
			}
			if page.NextCursor == "" {
				break
			}
			filter.Cursor = page.NextCursor
		}
		var err error
		result, err = s.deps.Spaces.Delete(ctx, sess.Actor(), got.ID, sess.expectedSpace(got.ID, in.ExpectedRev))
		if err != nil {
			return err
		}
		for _, id := range moved {
			m, err := s.deps.Notes.Get(ctx, id, note.Include{})
			if err != nil {
				return err
			}
			revisions[id] = m.Note.Rev
		}
		return nil
	})
	if err != nil {
		return fail(err), nil
	}
	for id, rev := range revisions {
		sess.observe(id, rev)
	}
	for _, id := range result.DeletedSpaceIDs {
		sess.forgetSpace(id)
	}
	return ok("deleted "+got.Name, map[string]any{"deletedSpaceIds": result.DeletedSpaceIDs, "movedNoteCount": result.MovedNoteCount, "noteRevisions": revisions}), nil
}

func (s *Server) addAttachments(ctx context.Context, req *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	var in struct {
		NoteID      string   `json:"noteId"`
		Links       []linkIn `json:"links"`
		ExpectedRev *int64   `json:"expectedRev"`
		Files       []struct {
			Path string `json:"path"`
		} `json:"files"`
	}
	if err := decodeArgs(req, &in); err != nil {
		return fail(err), nil
	}
	if in.NoteID == "" {
		return fail(fmt.Errorf("noteId is required")), nil
	}
	got, err := s.deps.Notes.Get(ctx, in.NoteID, note.Include{})
	if err != nil {
		return fail(err), nil
	}
	if len(in.Files) > 0 {
		allowed, err := s.fileAttachAllowed(ctx)
		if err != nil {
			return fail(err), nil
		}
		if !allowed {
			return fail(fmt.Errorf("file attachments are off. Enable them in Settings > Agents > Allow file attach")), nil
		}
		for _, file := range in.Files {
			if err := checkAttachPath(file.Path); err != nil {
				return fail(err), nil
			}
		}
	}
	if s.deps.Attachments == nil {
		return fail(fault.Unavailable("attachments backend is not wired")), nil
	}
	sess := s.session(req)
	expected := sess.expected(in.NoteID, in.ExpectedRev)
	if expected == 0 {
		expected = got.Note.Rev
	}
	// Attachments check but do not increment Note.Rev. Pin that checked
	// revision, including on a first write; never read it after the commit.
	var out []map[string]any
	for _, link := range in.Links {
		a, err := s.deps.Attachments.AddLink(ctx, in.NoteID, link.URL, link.Title, expected)
		if err != nil {
			return fail(err), nil
		}
		sess.observe(in.NoteID, expected)
		row := map[string]any{"id": a.ID, "kind": a.Kind}
		if a.URL != nil {
			row["url"] = *a.URL
		}
		out = append(out, row)
	}
	for _, file := range in.Files {
		a, err := s.deps.Attachments.ImportFromPath(attachments.WithImportLimit(ctx, 50<<20), in.NoteID, file.Path, "", expected)
		if err != nil {
			return fail(err), nil
		}
		sess.observe(in.NoteID, expected)
		out = append(out, map[string]any{"id": a.ID, "kind": a.Kind})
	}
	return ok(fmt.Sprintf("added %d", len(out)), map[string]any{"attachments": out, "rev": expected}), nil
}

func (s *Server) setSchedule(ctx context.Context, sess *NoteSession, noteID string, raw json.RawMessage) ([]string, error) {
	if s.deps.Schedules == nil {
		return nil, fault.Unavailable("schedule backend is not wired")
	}
	row, rule, err := parseSchedule(raw, noteID)
	if err != nil {
		return nil, err
	}
	if _, err := s.deps.Schedules.Set(ctx, sess.Actor(), row); err != nil {
		return nil, err
	}
	times, _, err := s.deps.Schedules.Preview(ctx, row, 3)
	if err != nil {
		times, _, err = schedule.Preview(rule, 3)
		if err != nil {
			return nil, err
		}
	}
	return nextOccurrences(times), nil
}

func (s *Server) setPlace(ctx context.Context, sess *NoteSession, noteID string, raw json.RawMessage) error {
	if s.deps.Places == nil {
		return fault.Unavailable("place backend is not wired")
	}
	p, err := parsePlace(raw, noteID)
	if err != nil {
		return err
	}
	_, err = s.deps.Places.Set(ctx, sess.Actor(), p)
	return err
}

func (s *Server) addLinks(ctx context.Context, noteID string, links []linkIn) error {
	if len(links) == 0 {
		return nil
	}
	if s.deps.Attachments == nil {
		return fault.Unavailable("attachments backend is not wired")
	}
	for _, link := range links {
		if _, err := s.deps.Attachments.AddLink(ctx, noteID, link.URL, link.Title, 0); err != nil {
			return err
		}
	}
	return nil
}

func union(a, b []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, id := range append(append([]string{}, a...), b...) {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

func subtract(ids, remove []string) []string {
	drop := map[string]bool{}
	for _, id := range remove {
		drop[id] = true
	}
	out := []string{}
	for _, id := range ids {
		if !drop[id] {
			out = append(out, id)
		}
	}
	return out
}
