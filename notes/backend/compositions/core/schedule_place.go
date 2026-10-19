package core

import (
	"connectrpc.com/connect"
	"context"
	"github.com/polterware/polterware/notes/backend/domains/place"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
)

type scheduleHandler struct{ s ScheduleUseCases }

func scheduleRequired(s *v1.Schedule) error {
	if s == nil {
		return invalid("schedule", "required")
	}
	if s.FireAt == nil {
		return invalid("schedule.fire_at", "required")
	}
	if s.WeekdayMask < 0 || s.WeekdayMask > 127 {
		return invalid("schedule.weekday_mask", "must be between 0 and 127")
	}
	return nil
}
func (h scheduleHandler) Set(ctx context.Context, r *connect.Request[v1.SetScheduleRequest]) (*connect.Response[v1.SetScheduleResponse], error) {
	if err := scheduleRequired(r.Msg.Schedule); err != nil {
		return nil, err
	}
	if h.s == nil {
		return nil, unavailable("schedules")
	}
	s, err := h.s.Set(ctx, caller(ctx), scheduleInput(r.Msg.Schedule))
	return response(&v1.SetScheduleResponse{Schedule: scheduleProto(s)}, err)
}
func (h scheduleHandler) Clear(ctx context.Context, r *connect.Request[v1.ClearScheduleRequest]) (*connect.Response[v1.ClearScheduleResponse], error) {
	if h.s == nil {
		return nil, unavailable("schedules")
	}
	err := h.s.Clear(ctx, caller(ctx), r.Msg.NoteId)
	return response(&v1.ClearScheduleResponse{}, err)
}
func (h scheduleHandler) Preview(ctx context.Context, r *connect.Request[v1.PreviewScheduleRequest]) (*connect.Response[v1.PreviewScheduleResponse], error) {
	if err := scheduleRequired(r.Msg.Schedule); err != nil {
		return nil, err
	}
	if h.s == nil {
		return nil, unavailable("schedules")
	}
	times, description, err := h.s.Preview(ctx, scheduleInput(r.Msg.Schedule), int(r.Msg.Limit))
	out := &v1.PreviewScheduleResponse{Description: description}
	for _, t := range times {
		out.Occurrences = append(out.Occurrences, stamp(t))
	}
	return response(out, err)
}
func (h scheduleHandler) ListOccurrences(ctx context.Context, r *connect.Request[v1.ListOccurrencesRequest]) (*connect.Response[v1.ListOccurrencesResponse], error) {
	if r.Msg.From == nil || r.Msg.To == nil {
		return nil, invalid("range", "from and to are required")
	}
	if h.s == nil {
		return nil, unavailable("schedules")
	}
	in := r.Msg
	items, err := h.s.ListOccurrences(ctx, OccurrenceQuery{From: instant(in.From), To: instant(in.To), SpaceID: stringPtr(in.SpaceId), IncludeDescendants: in.IncludeDescendants, TagIDs: in.TagIds, IncludeCompleted: in.IncludeCompleted, Limit: int(in.Limit)})
	out := &v1.ListOccurrencesResponse{}
	for _, o := range items {
		out.Occurrences = append(out.Occurrences, &v1.Occurrence{NoteId: o.NoteID, Title: o.Title, OccurrenceAt: stamp(o.OccurrenceAt), FireAt: stamp(o.FireAt), Completed: o.Completed, Overdue: o.Overdue, AllDay: o.AllDay, SpaceId: stringValue(o.SpaceID), Tz: o.TZ})
	}
	return response(out, err)
}
func (h scheduleHandler) CompleteOccurrence(ctx context.Context, r *connect.Request[v1.CompleteOccurrenceRequest]) (*connect.Response[v1.CompleteOccurrenceResponse], error) {
	if r.Msg.OccurrenceAt == nil {
		return nil, invalid("occurrence_at", "required")
	}
	if h.s == nil {
		return nil, unavailable("schedules")
	}
	c, err := h.s.CompleteOccurrence(ctx, caller(ctx), r.Msg.NoteId, instant(r.Msg.OccurrenceAt))
	return response(&v1.CompleteOccurrenceResponse{Completion: completionProto(c)}, err)
}
func (h scheduleHandler) ReopenOccurrence(ctx context.Context, r *connect.Request[v1.ReopenOccurrenceRequest]) (*connect.Response[v1.ReopenOccurrenceResponse], error) {
	if r.Msg.OccurrenceAt == nil {
		return nil, invalid("occurrence_at", "required")
	}
	if h.s == nil {
		return nil, unavailable("schedules")
	}
	err := h.s.ReopenOccurrence(ctx, caller(ctx), r.Msg.NoteId, instant(r.Msg.OccurrenceAt))
	return response(&v1.ReopenOccurrenceResponse{}, err)
}
func (h scheduleHandler) SetFocusRecipe(ctx context.Context, r *connect.Request[v1.SetFocusRecipeRequest]) (*connect.Response[v1.SetFocusRecipeResponse], error) {
	if h.s == nil {
		return nil, unavailable("schedules")
	}
	in := r.Msg
	s, err := h.s.SetFocusRecipe(ctx, caller(ctx), in.NoteId, schedule.FocusRecipe{Enabled: in.Enabled, WorkMin: int(in.WorkMin), ShortBreakMin: int(in.ShortBreakMin), LongBreakMin: int(in.LongBreakMin), Cycles: int(in.Cycles), AutoContinue: in.AutoContinue})
	return response(&v1.SetFocusRecipeResponse{Schedule: scheduleProto(s)}, err)
}

type placeHandler struct{ s place.Service }

func (h placeHandler) Set(ctx context.Context, r *connect.Request[v1.SetPlaceRequest]) (*connect.Response[v1.SetPlaceResponse], error) {
	if r.Msg.Place == nil {
		return nil, invalid("place", "required")
	}
	if h.s == nil {
		return nil, unavailable("places")
	}
	in := r.Msg.Place
	p := place.Place{NoteID: in.NoteId, Name: in.Name, Lat: in.Lat, Lng: in.Lng, RadiusM: valueOr(in.RadiusM, place.DefaultRadiusM), Event: in.Event, Active: valueOr(in.Active, true)}
	if p.Event == "" {
		p.Event = place.EventEnter
	}
	p, err := h.s.Set(ctx, p, r.Msg.GetExpectedRev())
	return response(&v1.SetPlaceResponse{Place: placeProto(p)}, err)
}
func (h placeHandler) Clear(ctx context.Context, r *connect.Request[v1.ClearPlaceRequest]) (*connect.Response[v1.ClearPlaceResponse], error) {
	if h.s == nil {
		return nil, unavailable("places")
	}
	err := h.s.Clear(ctx, r.Msg.NoteId, r.Msg.GetExpectedRev())
	return response(&v1.ClearPlaceResponse{}, err)
}
func (h placeHandler) ListInBounds(ctx context.Context, r *connect.Request[v1.ListPlacesInBoundsRequest]) (*connect.Response[v1.ListPlacesInBoundsResponse], error) {
	if h.s == nil {
		return nil, unavailable("places")
	}
	in := r.Msg
	items, err := h.s.ListInBounds(ctx, place.Bounds{South: in.South, West: in.West, North: in.North, East: in.East})
	out := &v1.ListPlacesInBoundsResponse{}
	for _, p := range items {
		out.Places = append(out.Places, placeProto(p))
	}
	return response(out, err)
}
