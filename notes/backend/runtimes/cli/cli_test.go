package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/polterware/polterware/notes/backend/compositions/core"
	"github.com/polterware/polterware/notes/backend/platform/coreclient"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
	"github.com/polterware/polterware/notes/backend/platform/listen"
	"github.com/polterware/polterware/notes/backend/platform/runstate"
)

func startLoopbackCLI(t *testing.T) (db string, clients coreclient.Clients) {
	t.Helper()
	t.Setenv("NO_COLOR", "1")
	t.Setenv("TZ", "UTC")
	db = filepath.Join(t.TempDir(), "notes.db")
	runtime, err := core.OpenRuntime(context.Background(), db)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = runtime.Close() })
	ln, endpoint, err := listen.Open("127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	state := runstate.Core{Endpoint: endpoint, Token: "test-session", Build: "cli-test", DBPath: db}
	server, err := core.Start(ln, core.Config{Token: state.Token, Build: state.Build, DBPath: db, Version: "test", Services: runtime.Services, MCP: runtime.MCP})
	if err != nil {
		ln.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			t.Error(err)
		}
	})
	t.Setenv("PWNOTES_CORE_ENDPOINT", state.Endpoint)
	t.Setenv("PWNOTES_CORE_TOKEN", state.Token)
	httpClient := &http.Client{Transport: &http.Transport{DisableKeepAlives: true}}
	clients, err = coreclient.NewWithHTTP(state, "cli", httpClient)
	if err != nil {
		t.Fatal(err)
	}
	return db, clients
}

func runCLI(t *testing.T, db string, args ...string) (stdout, stderr string, code int) {
	t.Helper()
	var out, errb bytes.Buffer
	code = run(t.Context(), append([]string{"-db", db}, args...), &out, &errb)
	return out.String(), errb.String(), code
}

var (
	ulidRe = regexp.MustCompile(`[0-9A-HJKMNP-TV-Z]{26}`)
	tsRe   = regexp.MustCompile(`[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z`)
)

func normalizeCLI(s string) string {
	s = ulidRe.ReplaceAllString(s, "ID")
	s = tsRe.ReplaceAllString(s, "TIME")
	return s
}

func createdID(t *testing.T, stdout string) string {
	t.Helper()
	fields := strings.Split(strings.TrimSpace(stdout), "\t")
	if len(fields) < 2 || fields[0] != "created" {
		t.Fatalf("created line: %q", stdout)
	}
	return fields[1]
}

func TestListEmptyJSONGolden(t *testing.T) {
	db, _ := startLoopbackCLI(t)
	stdout, stderr, code := runCLI(t, db, "list", "--json")
	if code != 0 {
		t.Fatalf("exit %d stderr=%s", code, stderr)
	}
	assertGolden(t, filepath.Join("json", "list_empty.json"), stdout)
}

func TestListEmptyHumanGolden(t *testing.T) {
	db, _ := startLoopbackCLI(t)
	stdout, stderr, code := runCLI(t, db, "list")
	if code != 0 {
		t.Fatalf("exit %d stderr=%s", code, stderr)
	}
	assertGolden(t, filepath.Join("human", "list_empty.txt"), stdout)
}

func TestAddListShowDoneSearchJSON(t *testing.T) {
	db, _ := startLoopbackCLI(t)
	stdout, stderr, code := runCLI(t, db, "add", "Buy milk")
	if code != 0 {
		t.Fatalf("add: %d %s", code, stderr)
	}
	id := createdID(t, stdout)
	stdout, stderr, code = runCLI(t, db, "list", "--json")
	if code != 0 {
		t.Fatalf("list json: %d %s", code, stderr)
	}
	assertGolden(t, filepath.Join("json", "list_one.json"), normalizeCLI(stdout))
	stdout, stderr, code = runCLI(t, db, "show", id, "--json")
	if code != 0 {
		t.Fatalf("show: %d %s", code, stderr)
	}
	assertGolden(t, filepath.Join("json", "show.json"), normalizeCLI(stdout))
	stdout, stderr, code = runCLI(t, db, "show", id)
	if code != 0 {
		t.Fatalf("show human: %d %s", code, stderr)
	}
	assertGolden(t, filepath.Join("human", "show.txt"), normalizeCLI(stdout))
	stdout, stderr, code = runCLI(t, db, "search", "milk", "--json")
	if code != 0 {
		t.Fatalf("search: %d %s", code, stderr)
	}
	assertGolden(t, filepath.Join("json", "search.json"), normalizeCLI(stdout))
	stdout, stderr, code = runCLI(t, db, "done", id)
	if code != 0 {
		t.Fatalf("done: %d %s", code, stderr)
	}
	if !strings.HasPrefix(stdout, "completed\t"+id+"\t") {
		t.Fatalf("done output: %q", stdout)
	}
}

func TestAddDueRepeatAndAgendaToday(t *testing.T) {
	db, _ := startLoopbackCLI(t)
	stdout, stderr, code := runCLI(t, db, "add", "Standup", "--due", "2099-01-01T09:00:00Z", "--repeat", "daily")
	if code != 0 {
		t.Fatalf("add repeat: %d %s %s", code, stdout, stderr)
	}
	id := createdID(t, stdout)
	stdout, stderr, code = runCLI(t, db, "show", id)
	if code != 0 {
		t.Fatalf("show: %d %s", code, stderr)
	}
	if !strings.Contains(stdout, "repeat\tdaily every 1") {
		t.Fatalf("expected repeat line: %s", stdout)
	}
	stdout, stderr, code = runCLI(t, db, "agenda", "--from", "2099-01-01", "--to", "2099-01-03", "--json")
	if code != 0 {
		t.Fatalf("agenda: %d %s", code, stderr)
	}
	assertGolden(t, filepath.Join("json", "agenda.json"), normalizeCLI(stdout))
	stdout, stderr, code = runCLI(t, db, "today", "--json")
	if code != 0 {
		t.Fatalf("today: %d %s", code, stderr)
	}
}

func TestSpaceTagReviewExportBackup(t *testing.T) {
	db, _ := startLoopbackCLI(t)
	stdout, stderr, code := runCLI(t, db, "space", "add", "Work")
	if code != 0 {
		t.Fatalf("space add: %d %s", code, stderr)
	}
	spaceID := createdID(t, stdout)
	stdout, stderr, code = runCLI(t, db, "space", "ls", "--json")
	if code != 0 {
		t.Fatalf("space ls: %d %s", code, stderr)
	}
	assertGolden(t, filepath.Join("json", "space_ls.json"), normalizeCLI(stdout))
	stdout, stderr, code = runCLI(t, db, "add", "Task", "--space", "Work")
	if code != 0 {
		t.Fatalf("add space: %d %s", code, stderr)
	}
	stdout, stderr, code = runCLI(t, db, "tag", "ls", "--json")
	if code != 0 {
		t.Fatalf("tag ls: %d %s", code, stderr)
	}
	assertGolden(t, filepath.Join("json", "tag_ls_empty.json"), stdout)
	stdout, stderr, code = runCLI(t, db, "review", "--from", "2026-10-01", "--to", "2026-10-08", "--tz", "UTC", "--json")
	if code != 0 {
		t.Fatalf("review: %d %s", code, stderr)
	}
	assertGolden(t, filepath.Join("json", "review.json"), normalizeCLI(stdout))
	zipPath := filepath.Join(t.TempDir(), "export.zip")
	stdout, stderr, code = runCLI(t, db, "export", "--out", zipPath, "--json")
	if code != 0 {
		t.Fatalf("export: %d %s", code, stderr)
	}
	if _, err := os.Stat(zipPath); err != nil {
		t.Fatal(err)
	}
	backup := filepath.Join(t.TempDir(), "backup.db")
	stdout, stderr, code = runCLI(t, db, "backup", "--out", backup)
	if code != 0 {
		t.Fatalf("backup: %d %s", code, stderr)
	}
	if _, err := os.Stat(backup); err != nil {
		t.Fatal(err)
	}
	stdout, stderr, code = runCLI(t, db, "space", "rm", spaceID)
	if code != ExitRefused {
		t.Fatalf("space rm without --yes: %d %s", code, stderr)
	}
	assertGolden(t, filepath.Join("human", "space_rm_refused.txt"), normalizeCLI(stderr))
	stdout, stderr, code = runCLI(t, db, "space", "rm", spaceID, "--yes")
	if code != 0 {
		t.Fatalf("space rm: %d %s", code, stderr)
	}
}

func TestRmRequiresYesAndDeletes(t *testing.T) {
	db, _ := startLoopbackCLI(t)
	stdout, _, code := runCLI(t, db, "add", "Temp")
	if code != 0 {
		t.Fatal(stdout)
	}
	id := createdID(t, stdout)
	_, stderr, code := runCLI(t, db, "rm", id)
	if code != ExitRefused {
		t.Fatalf("rm without --yes: %d %s", code, stderr)
	}
	assertGolden(t, filepath.Join("human", "rm_refused.txt"), normalizeCLI(stderr))
	stdout, stderr, code = runCLI(t, db, "rm", id, "--yes")
	if code != 0 {
		t.Fatalf("rm --yes: %d %s", code, stderr)
	}
	_, stderr, code = runCLI(t, db, "show", id)
	if code != ExitNotFound {
		t.Fatalf("show deleted: %d %s", code, stderr)
	}
}

func TestUnknownCommandAndUsage(t *testing.T) {
	db := filepath.Join(t.TempDir(), "notes.db")
	_, stderr, code := runCLI(t, db, "nope")
	if code != ExitUsage {
		t.Fatalf("unknown: %d %s", code, stderr)
	}
	_, stderr, code = runCLI(t, db, "add")
	if code != ExitUsage {
		t.Fatalf("add usage: %d %s", code, stderr)
	}
}

func TestConflictExitCode(t *testing.T) {
	db, clients := startLoopbackCLI(t)
	stdout, stderr, code := runCLI(t, db, "add", "Race")
	if code != 0 {
		t.Fatalf("add: %d %s", code, stderr)
	}
	id := createdID(t, stdout)
	got, err := clients.Note.Get(t.Context(), connect.NewRequest(&v1.GetNoteRequest{Id: id}))
	if err != nil {
		t.Fatal(err)
	}
	stale := got.Msg.Note.Rev
	title := "changed"
	if _, err := clients.Note.Update(t.Context(), connect.NewRequest(&v1.UpdateNoteRequest{Id: id, ExpectedRev: int64ptr(stale), Title: &title})); err != nil {
		t.Fatal(err)
	}
	err = setNoteStatus(t.Context(), clients, id, "completed", stale, ioDiscard())
	if exitCodeOf(err) != ExitConflict {
		t.Fatalf("conflict exit %d err=%v", exitCodeOf(err), err)
	}
	stdout, stderr, code = runCLI(t, db, "done", id)
	if code != 0 {
		t.Fatalf("done after bump: %d %s", code, stderr)
	}
}

func TestMCPConfigClients(t *testing.T) {
	db, _ := startLoopbackCLI(t)
	for _, client := range []string{"claude", "cursor", "claude-desktop"} {
		stdout, stderr, code := runCLI(t, db, "mcp", "config", client)
		if code != 0 {
			t.Fatalf("%s: %d %s", client, code, stderr)
		}
		assertGolden(t, filepath.Join("mcp", "live-"+client+".txt"), normalizeMCPLive(stdout))
		stdout, stderr, code = runCLI(t, db, "mcp", "config", client, "--json")
		if code != 0 {
			t.Fatalf("%s json: %d %s", client, code, stderr)
		}
		var payload map[string]any
		if err := json.Unmarshal([]byte(stdout), &payload); err != nil {
			t.Fatal(err)
		}
		if payload["claudeStdio"] == nil || payload["cursorStdioJson"] == nil {
			t.Fatalf("json keys: %v", payload)
		}
	}
	_, stderr, code := runCLI(t, db, "mcp", "config", "unknown")
	if code != ExitUsage {
		t.Fatalf("unknown client: %d %s", code, stderr)
	}
}

func normalizeMCPLive(s string) string {
	s = regexp.MustCompile(`Bearer [^\s"]+`).ReplaceAllString(s, "Bearer TOKEN")
	s = regexp.MustCompile(`http://127\.0\.0\.1:\d+/mcp`).ReplaceAllString(s, "http://127.0.0.1:PORT/mcp")
	return s
}

func TestAlreadyRunningViaEnsure(t *testing.T) {
	db, _ := startLoopbackCLI(t)
	stdout, stderr, code := runCLI(t, db, "list")
	if code != 0 {
		t.Fatalf("list against running core: %d %s %s", code, stdout, stderr)
	}
}

var (
	buildOnce sync.Once
	builtPath string
	buildErr  error
)

func builtNotes(t *testing.T) string {
	t.Helper()
	buildOnce.Do(func() {
		dir, err := os.MkdirTemp("", "notes-w2-cli-bin-*")
		if err != nil {
			buildErr = err
			return
		}
		builtPath = filepath.Join(dir, "pwnotes")
		cmd := exec.Command("go", "build", "-o", builtPath, ".")
		cmd.Dir, err = os.Getwd()
		if err != nil {
			buildErr = err
			return
		}
		out, err := cmd.CombinedOutput()
		if err != nil {
			buildErr = err
			t.Log(string(out))
		}
	})
	if buildErr != nil {
		t.Fatalf("go build pwnotes: %v", buildErr)
	}
	return builtPath
}

func TestAutoStart(t *testing.T) {
	exe := builtNotes(t)
	t.Setenv("NO_COLOR", "1")
	t.Setenv("TZ", "UTC")
	t.Setenv("PWNOTES_CORE_BIN", exe)
	t.Setenv("PWNOTES_CORE_ENDPOINT", "")
	t.Setenv("PWNOTES_CORE_TOKEN", "")
	db := filepath.Join(t.TempDir(), "notes.db")
	t.Cleanup(func() {
		if state, ok := runstate.ReadCore(db); ok {
			_ = coreclient.Stop(context.Background(), state)
		}
	})
	stdout, stderr, code := runCLI(t, db, "list", "--json")
	if code != 0 {
		t.Fatalf("auto-start list: %d stdout=%s stderr=%s", code, stdout, stderr)
	}
	assertGolden(t, filepath.Join("json", "list_empty.json"), stdout)
	if _, ok := runstate.ReadCore(db); !ok {
		t.Fatal("auto-start did not publish core.json")
	}
}
