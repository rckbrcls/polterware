package core

import (
	"github.com/polterware/polterware/notes/backend/domains/attachments"
	"github.com/polterware/polterware/notes/backend/domains/focus"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/place"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
	"github.com/polterware/polterware/notes/backend/domains/settings"
	"github.com/polterware/polterware/notes/backend/domains/space"
	"github.com/polterware/polterware/notes/backend/domains/tag"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
	"google.golang.org/protobuf/types/known/timestamppb"
	"time"
)

func stamp(t time.Time) *timestamppb.Timestamp {
	if t.IsZero() {
		return nil
	}
	return timestamppb.New(t.UTC().Truncate(time.Millisecond))
}
func stampPtr(t *time.Time) *timestamppb.Timestamp {
	if t == nil {
		return nil
	}
	return stamp(*t)
}
func instant(t *timestamppb.Timestamp) time.Time {
	if t == nil {
		return time.Time{}
	}
	return t.AsTime().UTC().Truncate(time.Millisecond)
}
func instantPtr(t *timestamppb.Timestamp) *time.Time {
	if t == nil {
		return nil
	}
	v := instant(t)
	return &v
}
func stringPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
func stringValue(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
func intPtr(n *int32) *int {
	if n == nil {
		return nil
	}
	v := int(*n)
	return &v
}
func int32Ptr(n *int) *int32 {
	if n == nil {
		return nil
	}
	v := int32(*n)
	return &v
}
func valueOr[T any](p *T, fallback T) T {
	if p == nil {
		return fallback
	}
	return *p
}

func spaceProto(m space.Space) *v1.Space {
	return &v1.Space{Id: m.ID, ParentId: stringValue(m.ParentID), Name: m.Name, Color: stringValue(m.Color), Icon: stringValue(m.Icon), SortOrder: int32(m.SortOrder), CreatedAt: stamp(m.CreatedAt), UpdatedAt: stamp(m.UpdatedAt), Rev: m.Rev}
}
func tagProto(t tag.Tag) *v1.Tag {
	return &v1.Tag{Id: t.ID, Name: t.Name, Color: stringValue(t.Color), UsageCount: int32(t.UsageCount), CreatedAt: stamp(t.CreatedAt), UpdatedAt: stamp(t.UpdatedAt), Rev: t.Rev}
}
func noteProto(m note.Note) *v1.Note {
	return &v1.Note{Id: m.ID, SpaceId: stringValue(m.SpaceID), Title: m.Title, Content: m.Content, Status: m.Status, Pinned: m.Pinned, Priority: int32Ptr(m.Priority), DueAt: stampPtr(m.DueAt), DueAllDay: m.DueAllDay, SortOrder: int32(m.SortOrder), AutoCompleteOnChecklist: m.AutoCompleteOnChecklist, CompletedAt: stampPtr(m.CompletedAt), CreatedAt: stamp(m.CreatedAt), UpdatedAt: stamp(m.UpdatedAt), Rev: m.Rev}
}
func summaryProto(m note.Summary) *v1.NoteSummary {
	return &v1.NoteSummary{Id: m.ID, SpaceId: stringValue(m.SpaceID), Title: m.Title, Status: m.Status, Pinned: m.Pinned, Priority: int32Ptr(m.Priority), DueAt: stampPtr(m.DueAt), DueAllDay: m.DueAllDay, SortOrder: int32(m.SortOrder), CreatedAt: stamp(m.CreatedAt), UpdatedAt: stamp(m.UpdatedAt), Rev: m.Rev, TagIds: m.TagIDs, ScheduleLabel: m.ScheduleLabel, Snippet: m.Snippet}
}
func checkProto(c note.CheckItem) *v1.CheckItem {
	return &v1.CheckItem{Id: c.ID, NoteId: c.NoteID, Title: c.Title, Detail: c.Detail, Done: c.Done, SortOrder: int32(c.SortOrder), CompletedAt: stampPtr(c.CompletedAt), CreatedAt: stamp(c.CreatedAt), UpdatedAt: stamp(c.UpdatedAt)}
}
func completionProto(c note.Completion) *v1.OccurrenceCompletion {
	return &v1.OccurrenceCompletion{Id: c.ID, NoteId: c.NoteID, OccurrenceAt: stamp(c.OccurrenceAt), CompletedAt: stamp(c.CompletedAt)}
}
func checkInputs(items []*v1.CheckItemInput) []note.CheckItemInput {
	out := make([]note.CheckItemInput, 0, len(items))
	for _, i := range items {
		out = append(out, note.CheckItemInput{ID: i.GetId(), Title: i.GetTitle(), Detail: i.GetDetail(), Done: i.GetDone(), SortOrder: int(i.GetSortOrder())})
	}
	return out
}
func scheduleProto(s schedule.Schedule) *v1.Schedule {
	return &v1.Schedule{NoteId: s.NoteID, Active: &s.Active, FireAt: stamp(s.FireAt), Tz: s.TZ, AllDay: s.AllDay, Freq: string(s.Freq), Every: int32Ptr(&s.Every), WeekdayMask: int32(s.WeekdayMask), EndType: string(s.EndType), UntilAt: stampPtr(s.UntilAt), OccurrenceCount: int32Ptr(s.OccurrenceCount), FocusEnabled: s.FocusEnabled, FocusWorkMin: int32Ptr(s.FocusWorkMin), FocusShortBreakMin: int32Ptr(s.FocusShortBreakMin), FocusLongBreakMin: int32Ptr(s.FocusLongBreakMin), FocusCycles: int32Ptr(s.FocusCycles), FocusAutoContinue: &s.FocusAutoContinue, UpdatedAt: stamp(s.UpdatedAt)}
}
func scheduleInput(s *v1.Schedule) schedule.Schedule {
	return schedule.Schedule{NoteID: s.GetNoteId(), Active: valueOr(s.Active, true), FireAt: instant(s.FireAt), TZ: s.Tz, AllDay: s.AllDay, Freq: schedule.Freq(s.Freq), Every: int(valueOr(s.Every, int32(1))), WeekdayMask: uint8(s.WeekdayMask), EndType: schedule.EndType(s.EndType), UntilAt: instantPtr(s.UntilAt), OccurrenceCount: intPtr(s.OccurrenceCount), FocusEnabled: s.FocusEnabled, FocusWorkMin: intPtr(s.FocusWorkMin), FocusShortBreakMin: intPtr(s.FocusShortBreakMin), FocusLongBreakMin: intPtr(s.FocusLongBreakMin), FocusCycles: intPtr(s.FocusCycles), FocusAutoContinue: valueOr(s.FocusAutoContinue, true)}
}
func placeProto(p place.Place) *v1.Place {
	return &v1.Place{NoteId: p.NoteID, Name: p.Name, Lat: p.Lat, Lng: p.Lng, RadiusM: &p.RadiusM, Event: p.Event, Active: &p.Active, UpdatedAt: stamp(p.UpdatedAt)}
}
func attachmentProto(a attachments.Attachment) *v1.Attachment {
	return &v1.Attachment{Id: a.ID, NoteId: a.NoteID, Kind: a.Kind, Name: a.Name, Mime: a.Mime, SizeBytes: a.SizeBytes, Sha256: a.SHA256, RelPath: a.RelPath, Url: a.URL, Title: a.Title, SortOrder: int32(a.SortOrder), CreatedAt: stamp(a.CreatedAt)}
}
func defaultsProto(d focus.Defaults) *v1.FocusDefaults {
	return &v1.FocusDefaults{WorkMin: int32(d.WorkMin), ShortBreakMin: int32(d.ShortBreakMin), LongBreakMin: int32(d.LongBreakMin), Cycles: int32(d.Cycles), AutoContinue: d.AutoContinue, Sounds: d.Sounds, Notifications: d.Notifications}
}
func defaultsInput(d *v1.FocusDefaults) focus.Defaults {
	return focus.Defaults{WorkMin: int(d.WorkMin), ShortBreakMin: int(d.ShortBreakMin), LongBreakMin: int(d.LongBreakMin), Cycles: int(d.Cycles), AutoContinue: d.AutoContinue, Sounds: d.Sounds, Notifications: d.Notifications}
}
func sessionProto(s focus.Session) *v1.FocusSession {
	return &v1.FocusSession{Id: s.ID, NoteId: stringValue(s.NoteID), Phase: s.Phase, PlannedS: int32(s.PlannedS), ElapsedS: int32(s.ElapsedS), State: s.State, StartedAt: stamp(s.StartedAt), EndedAt: stamp(s.EndedAt)}
}
func settingsProto(s settings.Settings) *v1.Settings {
	return &v1.Settings{AppearanceTheme: s.AppearanceTheme, NotificationsSound: s.NotificationsSound, NotificationsAllDayTime: s.NotificationsAllDayTime, NotificationsSnoozeMinutes: int32(s.NotificationsSnoozeMinutes), FocusWorkMin: int32(s.FocusWorkMin), FocusShortBreakMin: int32(s.FocusShortBreakMin), FocusLongBreakMin: int32(s.FocusLongBreakMin), FocusCycles: int32(s.FocusCycles), FocusAutoContinue: s.FocusAutoContinue, FocusSounds: s.FocusSounds, FocusNotifications: s.FocusNotifications, MapOnline: s.MapOnline, MapProvider: s.MapProvider, AgentsMcpPort: int32(s.AgentsMCPPort), AgentsMcpEnabled: s.AgentsMCPEnabled, AgentsAllowFileAttach: s.AgentsAllowFileAttach, AppKeepRunningInBackground: s.AppKeepRunningInBackground, LinksFetchTitles: s.LinksFetchTitles, CalendarWeekStart: s.CalendarWeekStart, MapGeocoding: s.MapGeocoding}
}
func settingsInput(s *v1.Settings) settings.Settings {
	return settings.Settings{AppearanceTheme: s.AppearanceTheme, NotificationsSound: s.NotificationsSound, NotificationsAllDayTime: s.NotificationsAllDayTime, NotificationsSnoozeMinutes: int(s.NotificationsSnoozeMinutes), FocusWorkMin: int(s.FocusWorkMin), FocusShortBreakMin: int(s.FocusShortBreakMin), FocusLongBreakMin: int(s.FocusLongBreakMin), FocusCycles: int(s.FocusCycles), FocusAutoContinue: s.FocusAutoContinue, FocusSounds: s.FocusSounds, FocusNotifications: s.FocusNotifications, MapOnline: s.MapOnline, MapProvider: s.MapProvider, AgentsMCPPort: int(s.AgentsMcpPort), AgentsMCPEnabled: s.AgentsMcpEnabled, AgentsAllowFileAttach: s.AgentsAllowFileAttach, AppKeepRunningInBackground: s.AppKeepRunningInBackground, LinksFetchTitles: s.LinksFetchTitles, CalendarWeekStart: s.CalendarWeekStart, MapGeocoding: s.MapGeocoding}
}
