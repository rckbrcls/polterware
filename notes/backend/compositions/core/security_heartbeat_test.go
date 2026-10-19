package core

import (
	"connectrpc.com/connect"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
	"testing"
)

func TestHeartbeatCannotExceedNotificationBudget(t *testing.T) {
	clients, _, _ := sqliteLoopback(t)
	for _, n := range []int32{-1, 61, 2147483647} {
		_, err := clients.Reminder.Heartbeat(t.Context(), connect.NewRequest(&v1.ReminderHeartbeatRequest{Authorization: "authorized", ArmedCount: n}))
		if connect.CodeOf(err) != connect.CodeInvalidArgument {
			t.Fatalf("accepted armed_count=%d: %v", n, err)
		}
	}
}
