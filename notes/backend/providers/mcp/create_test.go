package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/activity/fake"
	"github.com/polterware/polterware/notes/backend/domains/activity/fake/testkit"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/attachments"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/place"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
)

type transactionalSchedule struct {
	Schedules
	store *fake.Store
}

func (s transactionalSchedule) Set(ctx context.Context, _ actor.Actor, in schedule.Schedule) (schedule.Schedule, error) {
	return in, s.store.Put(ctx, "test_schedules", in.NoteID, in)
}
func (transactionalSchedule) Preview(context.Context, schedule.Schedule, int) ([]time.Time, string, error) {
	return []time.Time{time.Date(2026, 10, 5, 12, 0, 0, 0, time.UTC)}, "", nil
}

type transactionalPlace struct{ store *fake.Store }

func (p transactionalPlace) Set(ctx context.Context, _ actor.Actor, in place.Place) (place.Place, error) {
	return in, p.store.Put(ctx, "test_places", in.NoteID, in)
}
func (p transactionalPlace) Clear(ctx context.Context, _ actor.Actor, id string) error {
	return p.store.Remove(ctx, "test_places", id)
}

type transactionalLinks struct {
	attachments.Service
	store *fake.Store
}

func (a transactionalLinks) AddLink(ctx context.Context, id, url, title string, _ int64) (attachments.Attachment, error) {
	if title == "fail" {
		return attachments.Attachment{}, fmt.Errorf("injected second-link failure")
	}
	item := attachments.Attachment{ID: id, NoteID: id, Kind: attachments.KindLink, URL: &url}
	return item, a.store.Put(ctx, "test_links", id, item)
}

func TestCreateRollsBackNoteSchedulePlaceAndEarlierLinks(t *testing.T) {
	f := testkit.Setup()
	server, err := New(Deps{Notes: f.MS, Spaces: f.NS, Within: f.Store.Within, Schedules: transactionalSchedule{store: f.Store}, Places: transactionalPlace{f.Store}, Attachments: transactionalLinks{store: f.Store}})
	if err != nil {
		t.Fatal(err)
	}
	sess := NewNoteSession(f.MS, "atomic-create")
	failed := createItem{Title: "Failed item", Schedule: json.RawMessage(`{"at":"2026-10-05T12:00:00Z"}`), Place: json.RawMessage(`{"lat":0,"lng":0}`), Links: []linkIn{{URL: "https://example.com", Title: "first"}, {URL: "https://example.com", Title: "fail"}}}
	if _, err := server.createOne(t.Context(), sess, failed); err == nil {
		t.Fatal("expected injected failure")
	}
	page, err := f.MS.List(t.Context(), note.ListFilter{})
	if err != nil || page.Total != 0 {
		t.Fatalf("note persisted: %#v / %v", page, err)
	}
	for _, table := range []string{"test_schedules", "test_places", "test_links"} {
		rows, err := fake.All[json.RawMessage](t.Context(), f.Store, table)
		if err != nil || len(rows) != 0 {
			t.Fatalf("%s persisted: %d / %v", table, len(rows), err)
		}
	}
	if len(sess.reads) != 0 {
		t.Fatal("rolled-back revisions were published")
	}
	// A sibling item commits independently; its final revision is registered.
	failed.Title = "Successful sibling"
	failed.Links = failed.Links[:1]
	row, err := server.createOne(t.Context(), sess, failed)
	if err != nil {
		t.Fatal(err)
	}
	id := row["id"].(string)
	if sess.expected(id, nil) != row["rev"].(int64) {
		t.Fatal("committed revision not registered")
	}
}

type blockedFileImport struct {
	attachments.Store
	store   *fake.Store
	entered chan struct{}
	release chan struct{}
}

func (s blockedFileImport) ImportFile(context.Context, string, string, string) (attachments.ImportedFile, error) {
	close(s.entered)
	<-s.release
	return attachments.ImportedFile{}, fmt.Errorf("injected import failure")
}
func (s blockedFileImport) Insert(ctx context.Context, in attachments.Attachment) error {
	return s.store.Put(ctx, "test_links", in.ID, in)
}

func TestCompoundLinkWriteDoesNotWaitForFileImportMutex(t *testing.T) {
	f := testkit.Setup()
	m, err := f.MS.Create(t.Context(), actor.UI(), note.Create{Title: "Task"})
	if err != nil {
		t.Fatal(err)
	}
	store := blockedFileImport{store: f.Store, entered: make(chan struct{}), release: make(chan struct{})}
	svc := attachments.NewService(store, f.Audit.IDs, f.Audit.Clock).WithNoteRev(f.Mem, f.Store)
	imported := make(chan error, 1)
	go func() { _, err := svc.ImportFromPath(t.Context(), m.ID, "blocked", "", 1); imported <- err }()
	<-store.entered
	written := make(chan error, 1)
	go func() {
		written <- f.Store.Within(t.Context(), func(ctx context.Context) error {
			_, err := svc.AddLink(ctx, m.ID, "https://example.com", "", 1)
			return err
		})
	}()
	select {
	case err := <-written:
		close(store.release)
		<-imported
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		close(store.release)
		<-imported
		<-written
		t.Fatal("compound write waits for the file-import mutex while holding the writer transaction")
	}
}
