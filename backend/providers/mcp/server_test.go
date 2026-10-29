package mcp

import (
	"bytes"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/canon"
	"github.com/polterware/polterware/backend/domains/knowledge"
	"github.com/polterware/polterware/backend/providers/demoseed"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func testServer(t *testing.T) *Server {
	t.Helper()
	store, err := storepkg.New(filepath.Join(t.TempDir(), "mcp.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	if err := demoseed.Defaults(store); err != nil {
		t.Fatal(err)
	}
	if _, err := store.SyncProjectModel(demoseed.ProjectID); err != nil {
		t.Fatal(err)
	}
	return &Server{Store: store, In: bytes.NewReader(nil), Out: &bytes.Buffer{}, Err: &bytes.Buffer{}}
}

func query(t *testing.T, server *Server, text string) string {
	t.Helper()
	out, err := server.callTool(ToolPolterQuery, map[string]any{"project_id": demoseed.ProjectID, "query": text})
	if err != nil {
		t.Fatalf("%s: %v", text, err)
	}
	return out
}

func TestToolsListStableContract(t *testing.T) {
	server := testServer(t)
	result, err := server.dispatch(rpcRequest{Method: "tools/list", ID: json.RawMessage("1")})
	if err != nil {
		t.Fatal(err)
	}
	tools, ok := result.(map[string]any)["tools"].([]map[string]any)
	if !ok {
		t.Fatalf("unexpected tools type %T", result.(map[string]any)["tools"])
	}
	want := []string{ToolPolterQuery, ToolPolterApply, ToolPolterFormat, ToolDocUpsert}
	if len(tools) != len(want) {
		t.Fatalf("expected %d tools, got %d", len(want), len(tools))
	}
	for i, name := range want {
		if got, _ := tools[i]["name"].(string); got != name {
			t.Fatalf("tool[%d]=%q, want %q", i, got, name)
		}
	}
}

func TestInitializeStableVersion(t *testing.T) {
	server := testServer(t)
	result, err := server.dispatch(rpcRequest{Method: "initialize", ID: json.RawMessage("1")})
	if err != nil {
		t.Fatal(err)
	}
	payload := result.(map[string]any)
	if info := payload["serverInfo"].(map[string]any); info["version"] != "0.6.0" {
		t.Fatalf("version=%v", info["version"])
	}
	instructions, _ := payload["instructions"].(string)
	for _, want := range []string{"polter.query", "polter.apply", "polter.format", "doc.upsert", "brief", "search", "show", "drift"} {
		if !strings.Contains(instructions, want) {
			t.Fatalf("instructions missing %q: %s", want, instructions)
		}
	}
	for name := range retiredTools {
		if strings.Contains(instructions, name) {
			t.Fatalf("instructions still name retired %s: %s", name, instructions)
		}
	}
}

func TestRetiredToolsPointToTheirReplacement(t *testing.T) {
	server := testServer(t)
	for name := range retiredTools {
		_, err := server.invokeTool(name, map[string]any{"project_id": demoseed.ProjectID})
		if err == nil || !strings.Contains(err.Error(), name+" was removed: use ") {
			t.Fatalf("%s: %v", name, err)
		}
	}
	for _, name := range []string{"search", "compile_context", "unknown"} {
		_, err := server.invokeTool(name, map[string]any{"project_id": demoseed.ProjectID})
		if err == nil || !strings.Contains(err.Error(), "unknown tool") {
			t.Fatalf("%s: %v", name, err)
		}
	}
}

func TestPolterQueryShowsOneRecordAndDrift(t *testing.T) {
	server := testServer(t)
	for id, want := range map[string]string{
		"Decision-0001":    "### Decision-0001: Local SQLite authority",
		"ev-go-mod":        "evidence ev-go-mod [file] Go module requires modernc.org/sqlite.\npath: go.mod\n",
		"fact-no-network":  "fact fact-no-network [declared] Imports never call the network.\n",
		"rb-service":       "doc rb-service \"Service recovery\" (runbook)\n",
		"doc-architecture": "doc doc-architecture \"System architecture\"\n",
	} {
		if text := query(t, server, "show "+id); !strings.Contains(text, want) {
			t.Fatalf("show %s:\n%s\nwant %q", id, text, want)
		}
	}
	if _, err := server.callTool(ToolPolterQuery, map[string]any{"project_id": demoseed.ProjectID, "query": "show nope"}); err == nil || !strings.Contains(err.Error(), "search <terms>") {
		t.Fatalf("unknown id: %v", err)
	}
	if text := query(t, server, "drift"); !strings.Contains(text, "drift findings") {
		t.Fatalf("drift: %s", text)
	}
}

func TestDocUpsertCreatesUpdatesAndScopesInTheSessionRun(t *testing.T) {
	server := testServer(t)
	if _, err := wedge.ApplyPolter(server.Store, wedge.ApplyInput{ProjectID: demoseed.ProjectID, AutoStartLabel: "cli",
		Text: "---\npolter: 1\nsummary: Map auth\nrationale: Docs need a scope\n---\n\n# services: Services\nlevel: system\n\n# services/auth: Auth\nlevel: component · under: services\n"}); err != nil {
		t.Fatal(err)
	}
	seeded, _ := server.Store.ListAgentRuns(demoseed.ProjectID, 50)
	if _, err := server.callTool(ToolDocUpsert, map[string]any{"project_id": demoseed.ProjectID, "title": "No reason"}); err == nil {
		t.Fatal("a doc write without summary and rationale must fail")
	}

	created, err := server.callTool(ToolDocUpsert, map[string]any{
		"project_id": demoseed.ProjectID, "summary": "Document sessions", "rationale": "Agents keep asking",
		"title": "Session handling", "body": "## Sessions\n\nCookies are signed.", "doc_type": "runbook",
		"tags": []any{"auth"}, "scope": "services/auth",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(created, "created doc ") || !strings.Contains(created, `"Session handling"`) {
		t.Fatalf("create: %s", created)
	}
	id := strings.Fields(created)[2]
	shown := query(t, server, "show "+id)
	for _, want := range []string{"(runbook)", "scope: services/auth", "tags: auth", "Cookies are signed."} {
		if !strings.Contains(shown, want) {
			t.Fatalf("show after create missing %q:\n%s", want, shown)
		}
	}

	if _, err := server.callTool(ToolDocUpsert, map[string]any{
		"project_id": demoseed.ProjectID, "summary": "Clarify sessions", "rationale": "Rotation was missing",
		"id": id, "body": "Cookies rotate daily.", "scope": "",
	}); err != nil {
		t.Fatal(err)
	}
	item, err := server.Store.GetKnowledge(id)
	if err != nil {
		t.Fatal(err)
	}
	if item.Title != "Session handling" || item.Body != "Cookies rotate daily." || item.DocType != knowledge.DocTypeRunbook {
		t.Fatalf("update must keep omitted fields: %+v", item)
	}
	if shown := query(t, server, "show "+id); strings.Contains(shown, "scope:") {
		t.Fatalf("empty scope must clear it:\n%s", shown)
	}

	if _, err := server.callTool(ToolDocUpsert, map[string]any{
		"project_id": demoseed.ProjectID, "summary": "x", "rationale": "y", "id": "decision-sqlite-local", "body": "overwrite",
	}); err == nil {
		t.Fatal("doc.upsert must not write a Decision")
	}

	runs := newRuns(t, server, seeded)
	if len(runs) != 1 {
		t.Fatalf("expected one session run, got %d", len(runs))
	}
	record, err := server.Store.GetAgentRunRecord(runs[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(record.Steps) != 2 {
		t.Fatalf("expected 2 change steps, got %d", len(record.Steps))
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(record.Steps[0].PayloadJSON), &payload); err != nil || payload["tool"] != ToolDocUpsert {
		t.Fatalf("change step tool: %v %v", payload["tool"], err)
	}
}

func TestPolterApplyRecordsTypedEvidenceOnFacts(t *testing.T) {
	server := testServer(t)
	text := "---\npolter: 1\nsummary: Back the core fact\nrationale: The file shows it\n---\n\n" +
		"#### one-core: One local core owns SQLite.\nevidence: file:backend/serve.go, commit:a1f3c9e, ev-go-mod\n"
	if _, err := server.callTool(ToolPolterApply, map[string]any{"project_id": demoseed.ProjectID, "text": text}); err != nil {
		t.Fatal(err)
	}
	again, err := server.callTool(ToolPolterApply, map[string]any{"project_id": demoseed.ProjectID, "text": text})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(again, "no changes") {
		t.Fatalf("typed evidence must resolve to the same ids on reapply: %s", again)
	}
	shown := query(t, server, "show one-core")
	for _, want := range []string{" file: backend/serve.go", " commit: a1f3c9e", "- ev-go-mod file: go.mod"} {
		if !strings.Contains(shown, want) {
			t.Fatalf("show one-core missing %q:\n%s", want, shown)
		}
	}
	file, _ := canon.ParseEvidenceRef("file:backend/serve.go")
	stored, err := server.Store.GetCanonEvidence(file.Evidence(demoseed.ProjectID).ID)
	if err != nil || stored.Kind != canon.EvidenceKindFile || stored.Path != "backend/serve.go" {
		t.Fatalf("stored evidence: %+v %v", stored, err)
	}
}
