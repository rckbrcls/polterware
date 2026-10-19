package core

import (
	"connectrpc.com/connect"
	"context"
	"fmt"
	"github.com/polterware/polterware/notes/backend/domains/agentaccess"
	"github.com/polterware/polterware/notes/backend/domains/maintenance"
	"github.com/polterware/polterware/notes/backend/domains/reminder"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
	"google.golang.org/protobuf/proto"
	"strings"
)

type reminderHandler struct{ s reminder.Service }

func (h reminderHandler) Plan(ctx context.Context, r *connect.Request[v1.PlanRemindersRequest]) (*connect.Response[v1.PlanRemindersResponse], error) {
	if h.s == nil {
		return nil, unavailable("reminders")
	}
	in := r.Msg
	items, err := h.s.Plan(ctx, schedule.PlanQuery{Now: instant(in.Now), Budget: int(in.Budget), Horizon: in.Horizon.AsDuration()})
	out := &v1.PlanRemindersResponse{}
	for _, i := range items {
		out.Items = append(out.Items, &v1.ReminderItem{Id: i.ID, NoteId: i.NoteID, OccurrenceAt: stamp(i.OccurrenceAt), FireAt: stamp(i.FireAt), Title: i.Title, Body: i.Body, Category: i.Category, Repeat: repeatComponents(i.Repeat)})
	}
	return response(out, err)
}

func repeatComponents(c *schedule.DateComponents) *v1.ReminderDateComponents {
	if c == nil {
		return nil
	}
	out := &v1.ReminderDateComponents{Tz: c.TZ}
	if c.Weekday != nil {
		out.Weekday = proto.Int32(int32(*c.Weekday))
	}
	if c.Hour != nil {
		out.Hour = proto.Int32(int32(*c.Hour))
	}
	if c.Minute != nil {
		out.Minute = proto.Int32(int32(*c.Minute))
	}
	if c.Second != nil {
		out.Second = proto.Int32(int32(*c.Second))
	}
	return out
}
func (h reminderHandler) Ack(ctx context.Context, r *connect.Request[v1.AckReminderRequest]) (*connect.Response[v1.AckReminderResponse], error) {
	if h.s == nil {
		return nil, unavailable("reminders")
	}
	err := h.s.Ack(ctx, r.Msg.Id, r.Msg.Outcome)
	return response(&v1.AckReminderResponse{}, err)
}
func (h reminderHandler) Snooze(ctx context.Context, r *connect.Request[v1.SnoozeReminderRequest]) (*connect.Response[v1.SnoozeReminderResponse], error) {
	if r.Msg.OccurrenceAt == nil {
		return nil, invalid("occurrence_at", "required")
	}
	if h.s == nil {
		return nil, unavailable("reminders")
	}
	in := r.Msg
	o, err := h.s.Snooze(ctx, in.NoteId, instant(in.OccurrenceAt), int(in.Minutes))
	return response(&v1.SnoozeReminderResponse{OneOffId: o.ID, FireAt: stamp(o.FireAt)}, err)
}
func (h reminderHandler) ArmOneOff(ctx context.Context, r *connect.Request[v1.ArmOneOffRequest]) (*connect.Response[v1.ArmOneOffResponse], error) {
	if r.Msg.FireAt == nil {
		return nil, invalid("fire_at", "required")
	}
	if h.s == nil {
		return nil, unavailable("reminders")
	}
	in := r.Msg
	o, err := h.s.ArmOneOff(ctx, in.Kind, in.NoteId, instant(in.FireAt), in.Title, in.Body)
	return response(&v1.ArmOneOffResponse{Id: o.ID, FireAt: stamp(o.FireAt)}, err)
}
func (h reminderHandler) CancelOneOff(ctx context.Context, r *connect.Request[v1.CancelOneOffRequest]) (*connect.Response[v1.CancelOneOffResponse], error) {
	if h.s == nil {
		return nil, unavailable("reminders")
	}
	err := h.s.CancelOneOff(ctx, r.Msg.Id)
	return response(&v1.CancelOneOffResponse{}, err)
}
func (h reminderHandler) Heartbeat(ctx context.Context, r *connect.Request[v1.ReminderHeartbeatRequest]) (*connect.Response[v1.ReminderHeartbeatResponse], error) {
	if h.s == nil {
		return nil, unavailable("reminders")
	}
	t, err := h.s.Heartbeat(ctx, reminder.Heartbeat{Authorization: r.Msg.Authorization, ArmedCount: int(r.Msg.ArmedCount)})
	return response(&v1.ReminderHeartbeatResponse{LastSeenAt: stamp(t)}, err)
}
func (h reminderHandler) Status(ctx context.Context, _ *connect.Request[v1.ReminderStatusRequest]) (*connect.Response[v1.ReminderStatusResponse], error) {
	if h.s == nil {
		return nil, unavailable("reminders")
	}
	s, err := h.s.Status(ctx)
	return response(&v1.ReminderStatusResponse{Planned: int32(s.Planned), Armed: int32(s.Armed), NotifierLastSeenAt: stampPtr(s.NotifierLastSeenAt), Permission: s.Permission}, err)
}

type agentHandler struct {
	s    agentaccess.Service
	port int
}

func (h agentHandler) GetInfo(ctx context.Context, _ *connect.Request[v1.GetAgentInfoRequest]) (*connect.Response[v1.GetAgentInfoResponse], error) {
	if h.s == nil {
		return nil, unavailable("agent access")
	}
	i, err := h.s.GetInfo(ctx)
	if err == nil && h.port > 0 && i.MCPPort != h.port {
		previous := fmt.Sprintf("http://127.0.0.1:%d/mcp", i.MCPPort)
		current := fmt.Sprintf("http://127.0.0.1:%d/mcp", h.port)
		i.MCPPort = h.port
		i.ClaudeHTTP = strings.ReplaceAll(i.ClaudeHTTP, previous, current)
		i.CursorHTTPJSON = strings.ReplaceAll(i.CursorHTTPJSON, previous, current)
	}
	return response(&v1.GetAgentInfoResponse{McpPort: int32(i.MCPPort), TokenPresent: i.TokenPresent, Token: i.Token, Enabled: i.Enabled, AllowFileAttach: i.AllowFileAttach, ClaudeStdio: i.ClaudeStdio, ClaudeHttp: i.ClaudeHTTP, CursorStdioJson: i.CursorStdioJSON, CursorHttpJson: i.CursorHTTPJSON}, err)
}
func (h agentHandler) RotateToken(ctx context.Context, _ *connect.Request[v1.RotateAgentTokenRequest]) (*connect.Response[v1.RotateAgentTokenResponse], error) {
	if h.s == nil {
		return nil, unavailable("agent access")
	}
	t, err := h.s.RotateToken(ctx, caller(ctx))
	return response(&v1.RotateAgentTokenResponse{Token: t}, err)
}
func (h agentHandler) SetEnabled(ctx context.Context, r *connect.Request[v1.SetAgentEnabledRequest]) (*connect.Response[v1.SetAgentEnabledResponse], error) {
	if h.s == nil {
		return nil, unavailable("agent access")
	}
	err := h.s.SetEnabled(ctx, caller(ctx), r.Msg.Enabled)
	return response(&v1.SetAgentEnabledResponse{Enabled: r.Msg.Enabled}, err)
}
func (h agentHandler) SetAllowFileAttach(ctx context.Context, r *connect.Request[v1.SetAllowFileAttachRequest]) (*connect.Response[v1.SetAllowFileAttachResponse], error) {
	if h.s == nil {
		return nil, unavailable("agent access")
	}
	err := h.s.SetAllowFileAttach(ctx, caller(ctx), r.Msg.Allow)
	return response(&v1.SetAllowFileAttachResponse{Allow: r.Msg.Allow}, err)
}

type maintenanceHandler struct{ s maintenance.Service }

func (h maintenanceHandler) Export(ctx context.Context, r *connect.Request[v1.ExportRequest]) (*connect.Response[v1.ExportResponse], error) {
	if h.s == nil {
		return nil, unavailable("maintenance")
	}
	n, err := h.s.Export(ctx, r.Msg.ZipPath)
	return response(&v1.ExportResponse{ZipPath: r.Msg.ZipPath, Bytes: n}, err)
}
func (h maintenanceHandler) Backup(ctx context.Context, r *connect.Request[v1.BackupRequest]) (*connect.Response[v1.BackupResponse], error) {
	if h.s == nil {
		return nil, unavailable("maintenance")
	}
	path, n, err := h.s.Backup(ctx, r.Msg.DestPath)
	return response(&v1.BackupResponse{Path: path, Bytes: n}, err)
}
func (h maintenanceHandler) Doctor(ctx context.Context, _ *connect.Request[v1.DoctorRequest]) (*connect.Response[v1.DoctorResponse], error) {
	if h.s == nil {
		return response(&v1.DoctorResponse{Ok: false, Checks: []*v1.DoctorCheck{{Name: "backend", Ok: false, Detail: "maintenance backend is not wired"}}}, nil)
	}
	report, err := h.s.Doctor(ctx)
	out := &v1.DoctorResponse{Ok: report.OK}
	for _, c := range report.Checks {
		out.Checks = append(out.Checks, &v1.DoctorCheck{Name: c.Name, Ok: c.OK, Detail: c.Detail})
	}
	return response(out, err)
}
