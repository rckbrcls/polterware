package core

import (
	"context"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/polterware/polterware/notes/backend/domains/reminder"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
)

type planOnly struct {
	reminder.Service
	items []schedule.ReminderItem
}

func (p planOnly) Plan(context.Context, schedule.PlanQuery) ([]schedule.ReminderItem, error) {
	return p.items, nil
}

func TestPlanCarriesNativeRepeatMatchers(t *testing.T) {
	weekday, hour, minute, second := 2, 9, 30, 0
	at := time.Date(2026, 10, 5, 12, 30, 0, 0, time.UTC)
	handler := reminderHandler{s: planOnly{items: []schedule.ReminderItem{
		{ID: "rem:m1:wd2", NoteID: "m1", OccurrenceAt: at, FireAt: at, Title: "Weekly", Category: "reminder",
			Repeat: &schedule.DateComponents{TZ: "America/Sao_Paulo", Weekday: &weekday, Hour: &hour, Minute: &minute, Second: &second}},
		{ID: "rem:m2:1", NoteID: "m2", OccurrenceAt: at, FireAt: at, Title: "Once", Category: "reminder"},
	}}}
	res, err := handler.Plan(t.Context(), connect.NewRequest(&v1.PlanRemindersRequest{}))
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Msg.Items) != 2 {
		t.Fatalf("items: %d", len(res.Msg.Items))
	}
	rep := res.Msg.Items[0].Repeat
	if rep == nil || rep.Tz != "America/Sao_Paulo" || rep.GetWeekday() != 2 || rep.GetHour() != 9 || rep.GetMinute() != 30 || rep.Second == nil || rep.GetSecond() != 0 {
		t.Fatalf("repeat: %v", rep)
	}
	if res.Msg.Items[1].Repeat != nil {
		t.Fatal("one-shot must not carry a repeat matcher")
	}
}
