package core

import (
	"connectrpc.com/connect"
	"context"
	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/focus"
	"github.com/polterware/polterware/notes/backend/domains/review"
	"github.com/polterware/polterware/notes/backend/domains/settings"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
)

type focusHandler struct{ s focus.Service }

func (h focusHandler) GetDefaults(ctx context.Context, _ *connect.Request[v1.GetFocusDefaultsRequest]) (*connect.Response[v1.GetFocusDefaultsResponse], error) {
	if h.s == nil {
		return nil, unavailable("focus")
	}
	d, err := h.s.GetDefaults(ctx)
	return response(&v1.GetFocusDefaultsResponse{Defaults: defaultsProto(d)}, err)
}
func (h focusHandler) SetDefaults(ctx context.Context, r *connect.Request[v1.SetFocusDefaultsRequest]) (*connect.Response[v1.SetFocusDefaultsResponse], error) {
	if r.Msg.Defaults == nil {
		return nil, invalid("defaults", "required")
	}
	if h.s == nil {
		return nil, unavailable("focus")
	}
	d, err := h.s.SetDefaults(ctx, caller(ctx), defaultsInput(r.Msg.Defaults))
	return response(&v1.SetFocusDefaultsResponse{Defaults: defaultsProto(d)}, err)
}
func (h focusHandler) RecordSession(ctx context.Context, r *connect.Request[v1.RecordFocusSessionRequest]) (*connect.Response[v1.RecordFocusSessionResponse], error) {
	if r.Msg.StartedAt == nil || r.Msg.EndedAt == nil {
		return nil, invalid("range", "started_at and ended_at required")
	}
	if h.s == nil {
		return nil, unavailable("focus")
	}
	in := r.Msg
	s, err := h.s.RecordSession(ctx, caller(ctx), focus.Session{NoteID: stringPtr(in.NoteId), Phase: in.Phase, PlannedS: int(in.PlannedS), ElapsedS: int(in.ElapsedS), State: in.State, StartedAt: instant(in.StartedAt), EndedAt: instant(in.EndedAt)})
	return response(&v1.RecordFocusSessionResponse{Session: sessionProto(s)}, err)
}
func (h focusHandler) ListSessions(ctx context.Context, r *connect.Request[v1.ListFocusSessionsRequest]) (*connect.Response[v1.ListFocusSessionsResponse], error) {
	if r.Msg.From == nil || r.Msg.To == nil {
		return nil, invalid("range", "from and to required")
	}
	if h.s == nil {
		return nil, unavailable("focus")
	}
	items, err := h.s.ListSessions(ctx, instant(r.Msg.From), instant(r.Msg.To))
	out := &v1.ListFocusSessionsResponse{}
	for _, s := range items {
		out.Sessions = append(out.Sessions, sessionProto(s))
	}
	return response(out, err)
}

type reviewHandler struct{ s review.Service }

func (h reviewHandler) Get(ctx context.Context, r *connect.Request[v1.GetReviewRequest]) (*connect.Response[v1.GetReviewResponse], error) {
	if r.Msg.From == nil || r.Msg.To == nil {
		return nil, invalid("range", "from and to required")
	}
	if h.s == nil {
		return nil, unavailable("review")
	}
	report, err := h.s.Get(ctx, instant(r.Msg.From), instant(r.Msg.To), r.Msg.Tz)
	out := &v1.GetReviewResponse{From: stamp(report.From), To: stamp(report.To), Tz: report.TZ, Streak: int32(report.Streak), CompletedTotal: int32(report.CompletedTotal), FocusMinutes: int32(report.FocusMinutes), StreakMood: report.StreakMood, CompletedMood: report.CompletedMood}
	for _, d := range report.Days {
		out.Days = append(out.Days, dayProto(d))
	}
	for _, d := range report.Contribution {
		out.Contribution = append(out.Contribution, dayProto(d))
	}
	return response(out, err)
}
func dayProto(d review.Day) *v1.ReviewDay {
	return &v1.ReviewDay{Date: d.Date, Completed: int32(d.Completed), Morning: int32(d.Morning), Afternoon: int32(d.Afternoon), Evening: int32(d.Evening), Night: int32(d.Night), FocusMinutes: int32(d.FocusMinutes)}
}

type activityHandler struct{ s activity.Service }

func (h activityHandler) List(ctx context.Context, r *connect.Request[v1.ListActivityRequest]) (*connect.Response[v1.ListActivityResponse], error) {
	if h.s == nil {
		return nil, unavailable("activity")
	}
	page, err := h.s.List(ctx, r.Msg.Cursor, r.Msg.Actor, int(r.Msg.Limit))
	out := &v1.ListActivityResponse{NextCursor: page.NextCursor}
	for _, e := range page.Events {
		out.Events = append(out.Events, &v1.ActivityEvent{Id: e.ID, At: stamp(e.At), Actor: e.Actor, Entity: e.Entity, EntityId: e.EntityID, Op: e.Op, Summary: e.Summary})
	}
	return response(out, err)
}

type settingsHandler struct{ s settings.Service }

func (h settingsHandler) Get(ctx context.Context, _ *connect.Request[v1.GetSettingsRequest]) (*connect.Response[v1.GetSettingsResponse], error) {
	if h.s == nil {
		return nil, unavailable("settings")
	}
	s, err := h.s.Get(ctx)
	return response(&v1.GetSettingsResponse{Settings: settingsProto(s)}, err)
}
func (h settingsHandler) Set(ctx context.Context, r *connect.Request[v1.SetSettingsRequest]) (*connect.Response[v1.SetSettingsResponse], error) {
	if r.Msg.Settings == nil {
		return nil, invalid("settings", "required")
	}
	if h.s == nil {
		return nil, unavailable("settings")
	}
	s, err := h.s.Set(ctx, caller(ctx), r.Msg.Keys, settingsInput(r.Msg.Settings))
	return response(&v1.SetSettingsResponse{Settings: settingsProto(s)}, err)
}
