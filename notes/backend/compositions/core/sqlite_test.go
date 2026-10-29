package core

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/polterware/polterware/notes/backend/platform/coreclient"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
	"github.com/polterware/polterware/notes/backend/platform/listen"
	"github.com/polterware/polterware/notes/backend/platform/runstate"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func sqliteLoopback(t *testing.T) (coreclient.Clients, runstate.Core, *Server) {
	t.Helper()
	db := filepath.Join(t.TempDir(), "notes.db")
	runtime, err := OpenRuntime(context.Background(), db)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = runtime.Close() })
	ln, endpoint, err := listen.Open("127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	state := runstate.Core{Endpoint: endpoint, Token: "test-session", Build: "123-456", DBPath: db}
	s, err := Start(ln, Config{Token: state.Token, Build: state.Build, DBPath: db, Version: "test", Services: runtime.Services, MCP: runtime.MCP})
	if err != nil {
		ln.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := s.Shutdown(ctx); err != nil {
			t.Error(err)
		}
	})
	httpClient := &http.Client{Transport: &http.Transport{DisableKeepAlives: true}}
	clients, err := coreclient.NewWithHTTP(state, "cli", httpClient)
	if err != nil {
		t.Fatal(err)
	}
	return clients, state, s
}

func TestSqliteEveryRPCAgainstTempDB(t *testing.T) {
	_, state, _ := sqliteLoopback(t)
	count := 0
	httpClient := &http.Client{Transport: &http.Transport{DisableKeepAlives: true}}
	protoregistry.GlobalFiles.RangeFiles(func(file protoreflect.FileDescriptor) bool {
		if !strings.HasPrefix(file.Path(), "notes/v1/") {
			return true
		}
		for i := 0; i < file.Services().Len(); i++ {
			service := file.Services().Get(i)
			for j := 0; j < service.Methods().Len(); j++ {
				method := service.Methods().Get(j)
				if method.IsStreamingServer() {
					continue
				}
				count++
				t.Run(string(service.Name())+"/"+string(method.Name()), func(t *testing.T) {
					url := state.Endpoint + "/" + string(service.FullName()) + "/" + string(method.Name())
					unauthorized, err := http.NewRequestWithContext(t.Context(), "POST", url, strings.NewReader("{}"))
					if err != nil {
						t.Fatal(err)
					}
					unauthorized.Header.Set("Content-Type", "application/json")
					unauthorized.Header.Set("Connect-Protocol-Version", "1")
					res, err := httpClient.Do(unauthorized)
					if err != nil {
						t.Fatal(err)
					}
					body, err := io.ReadAll(res.Body)
					res.Body.Close()
					if err != nil {
						t.Fatal(err)
					}
					if res.StatusCode != 401 {
						t.Fatalf("unauthenticated %d: %s", res.StatusCode, body)
					}
					authorized, err := http.NewRequestWithContext(t.Context(), "POST", url, strings.NewReader("{}"))
					if err != nil {
						t.Fatal(err)
					}
					authorized.Header.Set("Content-Type", "application/json")
					authorized.Header.Set("Connect-Protocol-Version", "1")
					authorized.Header.Set("Authorization", "Bearer "+state.Token)
					res, err = httpClient.Do(authorized)
					if err != nil {
						t.Fatal(err)
					}
					body, err = io.ReadAll(res.Body)
					res.Body.Close()
					if err != nil {
						t.Fatal(err)
					}
					if res.StatusCode == 200 {
						return
					}
					var failure struct{ Code string }
					if err := json.Unmarshal(body, &failure); err != nil {
						t.Fatal(err)
					}
					switch failure.Code {
					case "invalid_argument", "not_found", "unavailable", "failed_precondition":
					default:
						t.Fatalf("unexpected %d %s", res.StatusCode, body)
					}
				})
			}
		}
		return true
	})
	if count != 68 {
		t.Fatalf("RPC coverage changed: %d unary RPCs", count)
	}
}

func TestSqliteRevConflictAndConcurrentWriters(t *testing.T) {
	clients, state, _ := sqliteLoopback(t)
	created, err := clients.Note.Create(t.Context(), connect.NewRequest(&v1.CreateNoteRequest{Title: "initial"}))
	if err != nil {
		t.Fatal(err)
	}
	id, rev := created.Msg.Note.Id, created.Msg.Note.Rev
	httpClient := &http.Client{Transport: &http.Transport{DisableKeepAlives: true}}
	other, err := coreclient.NewWithHTTP(state, "desktop", httpClient)
	if err != nil {
		t.Fatal(err)
	}
	const writers = 32
	results := make(chan error, writers)
	var wg sync.WaitGroup
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			title := fmt.Sprintf("writer-%d", i)
			client := clients.Note
			if i%2 == 0 {
				client = other.Note
			}
			_, err := client.Update(t.Context(), connect.NewRequest(&v1.UpdateNoteRequest{Id: id, ExpectedRev: &rev, Title: &title}))
			results <- err
		}(i)
	}
	wg.Wait()
	close(results)
	success, conflicts := 0, 0
	for err := range results {
		if err == nil {
			success++
			continue
		}
		if connect.CodeOf(err) != connect.CodeFailedPrecondition {
			t.Fatal(err)
		}
		conflicts++
		var ce *connect.Error
		if !errors.As(err, &ce) || len(ce.Details()) != 1 {
			t.Fatal(err)
		}
		value, err := ce.Details()[0].Value()
		if err != nil {
			t.Fatal(err)
		}
		detail := value.(*v1.PreconditionDetail)
		if detail.Reason != "rev_conflict" || detail.Entity != "note" || detail.EntityId != id {
			t.Fatalf("conflict detail: %v", detail)
		}
	}
	if success != 1 || conflicts != writers-1 {
		t.Fatalf("writers success=%d conflicts=%d", success, conflicts)
	}
}

func TestSqliteWatchWriteLatencyReplayAndShutdown(t *testing.T) {
	clients, _, server := sqliteLoopback(t)
	ctx, cancel := context.WithTimeout(t.Context(), 8*time.Second)
	defer cancel()
	stream, err := clients.Change.Watch(ctx, connect.NewRequest(&v1.WatchChangesRequest{}))
	if err != nil {
		t.Fatal(err)
	}
	defer stream.Close()
	if !stream.Receive() || !stream.Msg().Snapshot {
		t.Fatalf("snapshot: %v", stream.Err())
	}
	start := time.Now()
	created, err := clients.Note.Create(ctx, connect.NewRequest(&v1.CreateNoteRequest{Title: "watched"}))
	if err != nil {
		t.Fatal(err)
	}
	if !stream.Receive() {
		t.Fatal(stream.Err())
	}
	if time.Since(start) > 100*time.Millisecond {
		t.Fatalf("watch delivery took %s", time.Since(start))
	}
	if stream.Msg().Snapshot || stream.Msg().Changes[0].Id != created.Msg.Note.Id {
		t.Fatal(stream.Msg())
	}
	firstSeq := stream.Msg().Seq
	const extra = 16
	var wg sync.WaitGroup
	for i := 0; i < extra; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, err := clients.Note.Create(ctx, connect.NewRequest(&v1.CreateNoteRequest{Title: fmt.Sprintf("w-%d", i)}))
			if err != nil {
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	seen := map[int64]bool{firstSeq: true}
	for len(seen) < extra+1 {
		if !stream.Receive() {
			t.Fatal(stream.Err())
		}
		seq := stream.Msg().Seq
		if seq <= firstSeq-1 || seen[seq] {
			t.Fatalf("out of order: %d", seq)
		}
		seen[seq] = true
	}
	replay, err := clients.Change.Watch(ctx, connect.NewRequest(&v1.WatchChangesRequest{SinceSeq: firstSeq}))
	if err != nil {
		t.Fatal(err)
	}
	defer replay.Close()
	if !replay.Receive() || !replay.Msg().Snapshot {
		t.Fatal("replay snapshot")
	}
	for i := 0; i < extra; i++ {
		if !replay.Receive() || replay.Msg().Snapshot {
			t.Fatal(replay.Err())
		}
	}
	stream.Close()
	replay.Close()
	shutdown, stop := context.WithTimeout(context.Background(), 2*time.Second)
	if err := server.Shutdown(shutdown); err != nil {
		t.Error(err)
	}
	stop()
}

func TestSqlitePlanCarriesNativeRepeats(t *testing.T) {
	clients, _, _ := sqliteLoopback(t)
	created, err := clients.Note.Create(t.Context(), connect.NewRequest(&v1.CreateNoteRequest{Title: "daily"}))
	if err != nil {
		t.Fatal(err)
	}
	active := true
	every := int32(1)
	_, err = clients.Schedule.Set(t.Context(), connect.NewRequest(&v1.SetScheduleRequest{Schedule: &v1.Schedule{
		NoteId: created.Msg.Note.Id, Active: &active, FireAt: timestamppb.New(time.Date(2026, 1, 1, 9, 0, 0, 0, time.UTC)),
		Tz: "UTC", Freq: "daily", Every: &every,
	}}))
	if err != nil {
		t.Fatal(err)
	}
	now := timestamppb.New(time.Date(2026, 10, 4, 12, 0, 0, 0, time.UTC))
	plan, err := clients.Reminder.Plan(t.Context(), connect.NewRequest(&v1.PlanRemindersRequest{Now: now}))
	if err != nil {
		t.Fatal(err)
	}
	repeats := 0
	for _, item := range plan.Msg.Items {
		native := strings.Contains(item.Id, ":repeat") || strings.Contains(item.Id, ":wd")
		if native != (item.Repeat != nil) {
			t.Fatalf("native repeat id %s without matcher (or the reverse): %v", item.Id, item.Repeat)
		}
		if native {
			repeats++
		}
	}
	if repeats == 0 {
		t.Fatal("open-ended daily rule was not planned as a native repeat")
	}
	until := timestamppb.New(time.Date(2026, 10, 10, 9, 0, 0, 0, time.UTC))
	end := "until"
	_, err = clients.Schedule.Set(t.Context(), connect.NewRequest(&v1.SetScheduleRequest{Schedule: &v1.Schedule{
		NoteId: created.Msg.Note.Id, Active: &active, FireAt: timestamppb.New(time.Date(2026, 10, 4, 15, 0, 0, 0, time.UTC)),
		Tz: "UTC", Freq: "daily", Every: &every, EndType: end, UntilAt: until,
	}}))
	if err != nil {
		t.Fatal(err)
	}
	plan, err = clients.Reminder.Plan(t.Context(), connect.NewRequest(&v1.PlanRemindersRequest{Now: now}))
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Msg.Items) == 0 {
		t.Fatal("bounded one-shots were dropped")
	}
	for _, item := range plan.Msg.Items {
		if item.NoteId != created.Msg.Note.Id {
			continue
		}
		if !strings.HasPrefix(item.Id, "rem:"+created.Msg.Note.Id+":") {
			t.Fatalf("expected concrete one-shot id, got %s", item.Id)
		}
		if strings.HasSuffix(item.Id, ":repeat") {
			t.Fatal(item.Id)
		}
	}
}

func TestSqliteDoctorAndHealth(t *testing.T) {
	clients, state, _ := sqliteLoopback(t)
	if err := coreclient.Check(t.Context(), state); err != nil {
		t.Fatal(err)
	}
	report, err := clients.Maintenance.Doctor(t.Context(), connect.NewRequest(&v1.DoctorRequest{}))
	if err != nil || !report.Msg.Ok {
		t.Fatalf("doctor: %v %v", report, err)
	}
}

func TestSqliteHeartbeatDoesNotBreakSettings(t *testing.T) {
	clients, _, _ := sqliteLoopback(t)
	_, err := clients.Reminder.Heartbeat(t.Context(), connect.NewRequest(&v1.ReminderHeartbeatRequest{Authorization: "authorized", ArmedCount: 3}))
	if err != nil {
		t.Fatal(err)
	}
	got, err := clients.Settings.Get(t.Context(), connect.NewRequest(&v1.GetSettingsRequest{}))
	if err != nil {
		t.Fatal(err)
	}
	if got.Msg.Settings.NotificationsAllDayTime != "09:00" {
		t.Fatal(got.Msg.Settings)
	}
}

func TestSqliteExportAndBackup(t *testing.T) {
	clients, _, _ := sqliteLoopback(t)
	if _, err := clients.Note.Create(t.Context(), connect.NewRequest(&v1.CreateNoteRequest{Title: "exported"})); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	zipPath := filepath.Join(dir, "export.zip")
	exp, err := clients.Maintenance.Export(t.Context(), connect.NewRequest(&v1.ExportRequest{ZipPath: zipPath}))
	if err != nil || exp.Msg.Bytes == 0 {
		t.Fatalf("export: %v %v", exp, err)
	}
	if _, err := os.Stat(zipPath); err != nil {
		t.Fatal(err)
	}
	backup := filepath.Join(dir, "backup.db")
	res, err := clients.Maintenance.Backup(t.Context(), connect.NewRequest(&v1.BackupRequest{DestPath: backup}))
	if err != nil || res.Msg.Bytes == 0 {
		t.Fatalf("backup: %v %v", res, err)
	}
}

func TestSqliteOccurrenceCarriesZoneAndWeekStartPersists(t *testing.T) {
	clients, _, _ := sqliteLoopback(t)
	created, err := clients.Note.Create(t.Context(), connect.NewRequest(&v1.CreateNoteRequest{Title: "dinner"}))
	if err != nil {
		t.Fatal(err)
	}
	active := true
	_, err = clients.Schedule.Set(t.Context(), connect.NewRequest(&v1.SetScheduleRequest{Schedule: &v1.Schedule{
		NoteId: created.Msg.Note.Id, Active: &active, FireAt: timestamppb.New(time.Date(2026, 10, 12, 23, 0, 0, 0, time.UTC)),
		Tz: "America/New_York", AllDay: true,
	}}))
	if err != nil {
		t.Fatal(err)
	}
	list, err := clients.Schedule.ListOccurrences(t.Context(), connect.NewRequest(&v1.ListOccurrencesRequest{
		From: timestamppb.New(time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)), To: timestamppb.New(time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)),
	}))
	if err != nil {
		t.Fatal(err)
	}
	if len(list.Msg.Occurrences) == 0 || list.Msg.Occurrences[0].Tz != "America/New_York" {
		t.Fatalf("occurrence zone: %v", list.Msg.Occurrences)
	}
	got, err := clients.Settings.Get(t.Context(), connect.NewRequest(&v1.GetSettingsRequest{}))
	if err != nil || got.Msg.Settings.CalendarWeekStart != "mon" {
		t.Fatalf("default week start: %v / %v", got, err)
	}
	set, err := clients.Settings.Set(t.Context(), connect.NewRequest(&v1.SetSettingsRequest{Keys: []string{"calendar.weekStart"}, Settings: &v1.Settings{CalendarWeekStart: "sun"}}))
	if err != nil || set.Msg.Settings.CalendarWeekStart != "sun" {
		t.Fatalf("set week start: %v / %v", set, err)
	}
	if _, err := clients.Settings.Set(t.Context(), connect.NewRequest(&v1.SetSettingsRequest{Keys: []string{"calendar.weekStart"}, Settings: &v1.Settings{CalendarWeekStart: "tue"}})); err == nil {
		t.Fatal("invalid week start accepted")
	}
}

func TestSqlitePlaceWritesCheckExpectedRev(t *testing.T) {
	clients, _, _ := sqliteLoopback(t)
	created, err := clients.Note.Create(t.Context(), connect.NewRequest(&v1.CreateNoteRequest{Title: "spot"}))
	if err != nil {
		t.Fatal(err)
	}
	id := created.Msg.Note.Id
	rev := created.Msg.Note.Rev
	name := "Home"
	place := &v1.Place{NoteId: id, Lat: -23.55, Lng: -46.63, Name: &name}
	if _, err := clients.Place.Set(t.Context(), connect.NewRequest(&v1.SetPlaceRequest{Place: place, ExpectedRev: &rev})); err != nil {
		t.Fatalf("set with the current revision: %v", err)
	}
	stale := rev
	if _, err := clients.Place.Set(t.Context(), connect.NewRequest(&v1.SetPlaceRequest{Place: place, ExpectedRev: &stale})); connect.CodeOf(err) != connect.CodeAborted && connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Fatalf("stale set must conflict, got %v", err)
	}
	if _, err := clients.Place.Clear(t.Context(), connect.NewRequest(&v1.ClearPlaceRequest{NoteId: id, ExpectedRev: &stale})); connect.CodeOf(err) != connect.CodeAborted && connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Fatalf("stale clear must conflict, got %v", err)
	}
	list, err := clients.Place.ListInBounds(t.Context(), connect.NewRequest(&v1.ListPlacesInBoundsRequest{South: -24, West: -47, North: -23, East: -46}))
	if err != nil || len(list.Msg.Places) != 1 {
		t.Fatalf("the stale clear must not delete the place: %v / %v", list, err)
	}
	if _, err := clients.Place.Clear(t.Context(), connect.NewRequest(&v1.ClearPlaceRequest{NoteId: id})); err != nil {
		t.Fatalf("unchecked clear: %v", err)
	}
}

func TestSqliteMapGeocodingSettingDefaultsOff(t *testing.T) {
	clients, _, _ := sqliteLoopback(t)
	got, err := clients.Settings.Get(t.Context(), connect.NewRequest(&v1.GetSettingsRequest{}))
	if err != nil || got.Msg.Settings.MapGeocoding {
		t.Fatalf("geocoding must default to false: %v / %v", got, err)
	}
	set, err := clients.Settings.Set(t.Context(), connect.NewRequest(&v1.SetSettingsRequest{Keys: []string{"map.geocoding"}, Settings: &v1.Settings{MapGeocoding: true}}))
	if err != nil || !set.Msg.Settings.MapGeocoding {
		t.Fatalf("set geocoding: %v / %v", set, err)
	}
}
