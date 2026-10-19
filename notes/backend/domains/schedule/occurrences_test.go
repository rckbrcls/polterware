package schedule

import (
	"testing"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/fault"
)

type fixedClock struct{ now time.Time }

func (c fixedClock) Now() time.Time { return c.now }

func TestListOccurrencesFiltersAndState(t *testing.T) {
	r := daily(t)
	r.Freq = FreqHourly
	parent, child, other := "parent", "child", "other"
	q := OccurrenceQuery{From: r.Anchor, To: r.Anchor.Add(3 * time.Hour), Now: r.Anchor.Add(90 * time.Minute),
		SpaceID: &parent, SpaceIDs: []string{child}, TagIDs: []string{"a", "b"}, IncludeCompleted: true}
	subjects := []PlanSubject{
		{NoteID: "b", Title: "Child", Rule: r, SpaceID: &child, TagIDs: []string{"a", "b"}, CompletedAt: []time.Time{r.Anchor}},
		{NoteID: "a", Title: "Parent", Rule: r, SpaceID: &parent, TagIDs: []string{"b", "a"}},
		{NoteID: "other", Rule: r, SpaceID: &other, TagIDs: []string{"a", "b"}},
		{NoteID: "tag-filtered", Rule: r, SpaceID: &parent, TagIDs: []string{"a"}},
		{NoteID: "inbox", Rule: r, TagIDs: []string{"a", "b"}},
		{NoteID: "disabled", Rule: Rule{}, SpaceID: &parent, TagIDs: []string{"a", "b"}, ScheduleInactive: true},
	}
	got, err := ListOccurrences(subjects, q)
	if err != nil || len(got) != 6 {
		t.Fatalf("filters: %v %v", got, err)
	}
	if got[0].NoteID != "a" || got[1].NoteID != "b" || !got[0].Overdue || !got[1].Completed || got[1].Overdue || got[4].Overdue {
		t.Fatalf("state/order %v", got)
	}
	q.IncludeCompleted = false
	got, err = ListOccurrences(subjects, q)
	if err != nil || len(got) != 5 {
		t.Fatalf("hide completed %v %v", got, err)
	}
	// Completion of 09:00 never completes the 10:00 occurrence on the same day.
	if got[2].Completed || !got[2].Overdue {
		t.Fatalf("exact completion key: %v", got)
	}
	q.Limit = 2
	got, err = ListOccurrences(subjects, q)
	if err != nil || len(got) != 2 || got[0].NoteID != "a" || got[1].NoteID != "a" {
		t.Fatalf("global prefix %v %v", got, err)
	}
}

func TestListOccurrencesCap(t *testing.T) {
	r := daily(t)
	r.Freq = FreqMinutely
	subjects := []PlanSubject{{NoteID: "dense", Rule: r}, {NoteID: "other", Rule: r}}
	q := OccurrenceQuery{From: r.Anchor, To: r.Anchor.AddDate(0, 1, 0), Now: r.Anchor, PerNoteLimit: 3}
	got, err := ListOccurrences(subjects, q)
	if err != nil || len(got) != 6 {
		t.Fatalf("per-note cap: %d %v", len(got), err)
	}
	for _, at := range []time.Time{r.Anchor, r.Anchor.Add(time.Minute), r.Anchor.Add(2 * time.Minute)} {
		subjects[0].CompletedAt = append(subjects[0].CompletedAt, at)
	}
	got, err = ListOccurrences(subjects, q)
	if err != nil || len(got) != 3 {
		t.Fatalf("cap before completions: %d %v", len(got), err)
	}
	q.PerNoteLimit = 0
	got, err = ListOccurrences(subjects[1:], q)
	if err != nil || len(got) != DefaultPerNoteLimit {
		t.Fatalf("default cap: %d %v", len(got), err)
	}
	q.PerNoteLimit = MaxOccurrences + 1
	if _, err := ListOccurrences(subjects, q); !fault.IsCode(err, fault.CodeInvalid) {
		t.Fatal(err)
	}
}

func TestListOccurrencesAllDayAndPort(t *testing.T) {
	r := daily(t)
	r.AllDay = true
	r.TZ = location(t, "America/Sao_Paulo")
	r.Anchor = instant(t, "2026-10-03T18:00:00-03:00")
	from := instant(t, "2026-10-03T00:00:00-03:00")
	now := instant(t, "2026-10-03T08:00:00-03:00")
	e := Engine{Clock: fixedClock{now: now}, PerNoteLimit: 2, AllDayTime: "09:00"}
	subjects := []PlanSubject{{NoteID: "all", Rule: r}}
	got, err := e.Occurrences(subjects, from, from.AddDate(0, 0, 3), false, 0)
	if err != nil || len(got) != 2 || !got[0].AllDay || got[0].Overdue || !got[0].OccurrenceAt.Equal(from) || !got[0].FireAt.Equal(now.Add(time.Hour)) {
		t.Fatalf("%v %v", got, err)
	}
	if _, err := (Engine{}).Occurrences(subjects, from, now, false, 1); !fault.IsCode(err, fault.CodeInvalid) {
		t.Fatal("clock required", err)
	}
}
