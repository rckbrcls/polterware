package core

import (
	"context"
	"testing"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/reminder"
)

func TestOneOffRemovalAndAuditCommitTogether(t *testing.T) {
	for _, outcome := range []string{"cancel", "done"} {
		for _, rejectAudit := range []bool{false, true} {
			t.Run(outcome+map[bool]string{false: "/commit", true: "/rollback"}[rejectAudit], func(t *testing.T) {
				s, audit, _ := mutationFixture(t)
				svc := reminderService{repo: s.Reminders(), clock: audit.Clock, ids: audit.IDs, audit: audit}
				ctx := context.WithValue(t.Context(), actorKey{}, actor.MCP("review"))
				o, err := svc.ArmOneOff(ctx, reminder.KindFocusPhase, "", audit.Clock.Now().Add(time.Minute), "Break", "Rest")
				if err != nil {
					t.Fatal(err)
				}
				// Delivered/opened are acknowledgements, not deletion commands.
				for _, noop := range []string{reminder.AckDelivered, reminder.AckOpened} {
					if err := svc.Ack(ctx, "one:"+o.ID, noop); err != nil {
						t.Fatal(err)
					}
				}
				if rejectAudit {
					svc.audit.Repository = rejectedActivity{audit.Repository}
				}
				remove := func() error {
					if outcome == "cancel" {
						return svc.CancelOneOff(ctx, "one:"+o.ID)
					}
					return svc.Ack(ctx, "one:"+o.ID, reminder.AckDone)
				}
				err = remove()
				if rejectAudit && err == nil || !rejectAudit && err != nil {
					t.Fatalf("remove: %v", err)
				}
				rows, err := s.Reminders().ListDue(ctx, audit.Clock.Now(), o.FireAt.Add(time.Minute))
				if err != nil {
					t.Fatal(err)
				}
				want := 0
				if rejectAudit {
					want = 1
				}
				if len(rows) != want {
					t.Fatalf("one-off escaped transaction: %+v", rows)
				}
				page, err := s.Activity().List(ctx, "", "", 50)
				if err != nil {
					t.Fatal(err)
				}
				deletes := 0
				for _, event := range page.Events {
					if event.Entity == "reminder" && event.EntityID == o.ID && event.Op == activity.OpDelete {
						deletes++
						if event.Actor != "mcp:review" {
							t.Fatalf("actor: %+v", event)
						}
					}
				}
				want = 1
				if rejectAudit {
					want = 0
				}
				if deletes != want {
					t.Fatalf("audit rows=%d want=%d", deletes, want)
				}
				if !rejectAudit {
					if err := remove(); !fault.IsCode(err, fault.CodeNotFound) {
						t.Fatalf("repeat removal: %v", err)
					}
					page, err = s.Activity().List(ctx, "", "", 50)
					if err != nil || len(page.Events) != 2 {
						t.Fatalf("missing reminder created audit row: %+v %v", page, err)
					}
				}
			})
		}
	}
}
