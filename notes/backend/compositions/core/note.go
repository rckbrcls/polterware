package core

import (
	"connectrpc.com/connect"
	"context"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/note"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
)

type noteHandler struct{ services Services }

func (h noteHandler) List(ctx context.Context, r *connect.Request[v1.ListNotesRequest]) (*connect.Response[v1.ListNotesResponse], error) {
	if h.services.Notes == nil {
		return nil, unavailable("notes")
	}
	in := r.Msg
	f := note.ListFilter{SpaceID: stringPtr(in.SpaceId), IncludeDescendants: in.IncludeDescendants, InboxOnly: in.InboxOnly, Status: in.Status, Pinned: in.Pinned, TagIDs: in.TagIds, DueFrom: instantPtr(in.DueFrom), DueTo: instantPtr(in.DueTo), UpdatedFrom: instantPtr(in.UpdatedFrom), UpdatedTo: instantPtr(in.UpdatedTo), HasSchedule: in.HasSchedule, HasPlace: in.HasPlace, Query: in.Query, Order: in.Order, Limit: int(in.Limit), Cursor: in.Cursor}
	page, err := h.services.Notes.List(ctx, f)
	out := &v1.ListNotesResponse{NextCursor: page.NextCursor, Total: int32(page.Total)}
	for _, m := range page.Notes {
		out.Notes = append(out.Notes, summaryProto(m))
	}
	return response(out, err)
}
func (h noteHandler) Get(ctx context.Context, r *connect.Request[v1.GetNoteRequest]) (*connect.Response[v1.GetNoteResponse], error) {
	m, err := h.get(ctx, r.Msg.Id, r.Msg.Include)
	return response(&v1.GetNoteResponse{Note: m}, err)
}
func (h noteHandler) get(ctx context.Context, id string, include *v1.NoteInclude) (*v1.Note, error) {
	if h.services.Notes == nil {
		return nil, unavailable("notes")
	}
	i := note.Include{Content: include.GetContent(), Checklist: include.GetChecklist(), Completions: include.GetCompletions(), Tags: include.GetTags()}
	m, err := h.services.Notes.Get(ctx, id, i)
	if err != nil {
		return nil, err
	}
	out := noteProto(m.Note)
	if !i.Content {
		out.Content = ""
	}
	for _, item := range m.Checklist {
		out.Checklist = append(out.Checklist, checkProto(item))
	}
	for _, c := range m.Completions {
		out.Completions = append(out.Completions, completionProto(c))
	}
	if i.Tags {
		tags, err := h.tags(ctx, m.TagIDs)
		if err != nil {
			return nil, err
		}
		out.Tags = tags
	}
	if include.GetSchedule() {
		if h.services.ScheduleReader == nil {
			return nil, unavailable("schedule reader")
		}
		s, err := h.services.ScheduleReader.Get(ctx, id)
		if err != nil && !fault.IsCode(err, fault.CodeNotFound) {
			return nil, err
		}
		if err == nil {
			out.Schedule = scheduleProto(s)
		}
	}
	if include.GetPlace() {
		if h.services.PlaceReader == nil {
			return nil, unavailable("place reader")
		}
		p, err := h.services.PlaceReader.Get(ctx, id)
		if err != nil && !fault.IsCode(err, fault.CodeNotFound) {
			return nil, err
		}
		if err == nil {
			out.Place = placeProto(p)
		}
	}
	if include.GetAttachments() {
		if h.services.Attachments == nil {
			return nil, unavailable("attachments")
		}
		items, err := h.services.Attachments.List(ctx, id)
		if err != nil {
			return nil, err
		}
		for _, a := range items {
			out.Attachments = append(out.Attachments, attachmentProto(a))
		}
	}
	return out, nil
}
func (h noteHandler) tags(ctx context.Context, ids []string) ([]*v1.Tag, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	if h.services.Tags == nil {
		return nil, unavailable("tags")
	}
	all, err := h.services.Tags.List(ctx)
	if err != nil {
		return nil, err
	}
	wanted := make(map[string]bool, len(ids))
	for _, id := range ids {
		wanted[id] = true
	}
	out := make([]*v1.Tag, 0, len(ids))
	for _, tag := range all {
		if wanted[tag.ID] {
			out = append(out, tagProto(tag))
		}
	}
	return out, nil
}
func (h noteHandler) Create(ctx context.Context, r *connect.Request[v1.CreateNoteRequest]) (*connect.Response[v1.CreateNoteResponse], error) {
	if h.services.Notes == nil {
		return nil, unavailable("notes")
	}
	in := r.Msg
	m, err := h.services.Notes.Create(ctx, caller(ctx), note.Create{SpaceID: stringPtr(in.SpaceId), Title: in.Title, Content: in.Content, Pinned: in.Pinned, Priority: intPtr(in.Priority), DueAt: instantPtr(in.DueAt), DueAllDay: in.DueAllDay, SortOrder: int(in.SortOrder), AutoCompleteOnChecklist: in.AutoCompleteOnChecklist, TagIDs: in.TagIds, Checklist: checkInputs(in.Checklist)})
	return response(&v1.CreateNoteResponse{Note: noteProto(m)}, err)
}
func (h noteHandler) Update(ctx context.Context, r *connect.Request[v1.UpdateNoteRequest]) (*connect.Response[v1.UpdateNoteResponse], error) {
	if h.services.Notes == nil {
		return nil, unavailable("notes")
	}
	in := r.Msg
	p := note.Patch{Title: in.Title, Content: in.Content, SpaceID: in.SpaceId, ClearSpaceID: in.ClearSpaceId, Priority: intPtr(in.Priority), ClearPriority: in.ClearPriority, DueAt: instantPtr(in.DueAt), ClearDueAt: in.ClearDueAt, DueAllDay: in.DueAllDay, SortOrder: intPtr(in.SortOrder), Pinned: in.Pinned, AutoCompleteOnChecklist: in.AutoCompleteOnChecklist}
	m, err := h.services.Notes.Update(ctx, caller(ctx), in.Id, in.GetExpectedRev(), p)
	return response(&v1.UpdateNoteResponse{Note: noteProto(m)}, err)
}
func (h noteHandler) Delete(ctx context.Context, r *connect.Request[v1.DeleteNoteRequest]) (*connect.Response[v1.DeleteNoteResponse], error) {
	if h.services.Notes == nil {
		return nil, unavailable("notes")
	}
	err := h.services.Notes.Delete(ctx, caller(ctx), r.Msg.Id, r.Msg.GetExpectedRev())
	return response(&v1.DeleteNoteResponse{}, err)
}
func (h noteHandler) SetStatus(ctx context.Context, r *connect.Request[v1.SetNoteStatusRequest]) (*connect.Response[v1.SetNoteStatusResponse], error) {
	if h.services.Notes == nil {
		return nil, unavailable("notes")
	}
	in := r.Msg
	m, err := h.services.Notes.SetStatus(ctx, caller(ctx), in.Id, in.GetExpectedRev(), in.Status, instantPtr(in.OccurrenceAt))
	return response(&v1.SetNoteStatusResponse{Note: noteProto(m)}, err)
}
func (h noteHandler) SetPinned(ctx context.Context, r *connect.Request[v1.SetNotePinnedRequest]) (*connect.Response[v1.SetNotePinnedResponse], error) {
	if h.services.Notes == nil {
		return nil, unavailable("notes")
	}
	in := r.Msg
	m, err := h.services.Notes.SetPinned(ctx, caller(ctx), in.Id, in.GetExpectedRev(), in.Pinned)
	return response(&v1.SetNotePinnedResponse{Note: noteProto(m)}, err)
}
func (h noteHandler) Reorder(ctx context.Context, r *connect.Request[v1.ReorderNotesRequest]) (*connect.Response[v1.ReorderNotesResponse], error) {
	if h.services.Notes == nil {
		return nil, unavailable("notes")
	}
	err := h.services.Notes.Reorder(ctx, caller(ctx), stringPtr(r.Msg.SpaceId), r.Msg.OrderedIds)
	return response(&v1.ReorderNotesResponse{}, err)
}
func (h noteHandler) ToggleCheckItem(ctx context.Context, r *connect.Request[v1.ToggleCheckItemRequest]) (*connect.Response[v1.ToggleCheckItemResponse], error) {
	if h.services.Notes == nil {
		return nil, unavailable("notes")
	}
	in := r.Msg
	c, err := h.services.Notes.ToggleCheckItem(ctx, caller(ctx), in.NoteId, in.ItemId, in.GetExpectedRev(), in.Done)
	if err != nil {
		return nil, err
	}
	m, err := h.get(ctx, in.NoteId, nil)
	return response(&v1.ToggleCheckItemResponse{Item: checkProto(c), Note: m}, err)
}
func (h noteHandler) ReplaceChecklist(ctx context.Context, r *connect.Request[v1.ReplaceChecklistRequest]) (*connect.Response[v1.ReplaceChecklistResponse], error) {
	if h.services.Notes == nil {
		return nil, unavailable("notes")
	}
	in := r.Msg
	items, err := h.services.Notes.ReplaceChecklist(ctx, caller(ctx), in.NoteId, in.GetExpectedRev(), checkInputs(in.Items))
	if err != nil {
		return nil, err
	}
	out := &v1.ReplaceChecklistResponse{}
	for _, c := range items {
		out.Items = append(out.Items, checkProto(c))
	}
	out.Note, err = h.get(ctx, in.NoteId, nil)
	return response(out, err)
}
func (h noteHandler) SetTags(ctx context.Context, r *connect.Request[v1.SetNoteTagsRequest]) (*connect.Response[v1.SetNoteTagsResponse], error) {
	if h.services.Notes == nil {
		return nil, unavailable("notes")
	}
	in := r.Msg
	if len(in.TagIds) > 0 && h.services.Tags == nil {
		return nil, unavailable("tags")
	}
	if err := h.services.Notes.SetTags(ctx, caller(ctx), in.NoteId, in.GetExpectedRev(), in.TagIds); err != nil {
		return nil, err
	}
	m, err := h.get(ctx, in.NoteId, &v1.NoteInclude{Tags: true})
	if err != nil {
		return nil, err
	}
	return response(&v1.SetNoteTagsResponse{Note: m, Tags: m.Tags}, nil)
}
func (h noteHandler) BulkAction(ctx context.Context, r *connect.Request[v1.BulkNoteActionRequest]) (*connect.Response[v1.BulkNoteActionResponse], error) {
	if h.services.Notes == nil {
		return nil, unavailable("notes")
	}
	in := r.Msg
	items, err := h.services.Notes.BulkAction(ctx, caller(ctx), note.BulkAction{IDs: in.Ids, Action: in.Action, SpaceID: stringPtr(in.SpaceId), TagIDs: in.TagIds})
	out := &v1.BulkNoteActionResponse{}
	for _, item := range items {
		result := &v1.BulkNoteItemResult{Id: item.ID, Ok: item.Err == nil}
		if item.Err != nil {
			result.Error = mapError(item.Err).Error()
		}
		out.Results = append(out.Results, result)
	}
	return response(out, err)
}
