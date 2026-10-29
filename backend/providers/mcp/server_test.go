package mcp

import (
	"bytes"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/domains/canon"
	"github.com/polterware/polterware/backend/domains/drift"
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

func TestToolsListStableContract(t *testing.T) {
	server := testServer(t)
	result, err := server.dispatch(rpcRequest{Method: "tools/list", ID: json.RawMessage("1")})
	if err != nil {
		t.Fatal(err)
	}
	payload, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("unexpected result type %T", result)
	}
	tools, ok := payload["tools"].([]map[string]any)
	if !ok {
		t.Fatalf("unexpected tools type %T", payload["tools"])
	}
	want := []string{
		ToolPolterFormat, ToolPolterQuery, ToolPolterApply,
		ToolContextGet, ToolEntityGet, ToolEvidenceGet, ToolDriftCheck,
		ToolAgentRunStart, ToolAgentRunAppend, ToolAgentRunComplete, ToolAgentRunGet, ToolAgentRunList,
		ToolFactUpsert, ToolEvidenceUpsert, ToolEvidenceLink, ToolKnowledgeUpsert, ToolKnowledgeLink,
	}
	if len(tools) != len(want) {
		t.Fatalf("expected %d tools, got %d", len(want), len(tools))
	}
	for i, name := range want {
		got, _ := tools[i]["name"].(string)
		if got != name {
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
	info := payload["serverInfo"].(map[string]any)
	if info["version"] != "0.5.0" {
		t.Fatalf("version=%v", info["version"])
	}
	instructions, _ := payload["instructions"].(string)
	if strings.Contains(strings.ToLower(instructions), "experimental") {
		t.Fatalf("instructions still experimental: %s", instructions)
	}
	if !strings.Contains(instructions, "polter.apply") {
		t.Fatalf("instructions missing polter.apply: %s", instructions)
	}
	if !strings.Contains(instructions, "agent_run") {
		t.Fatalf("instructions missing agent_run: %s", instructions)
	}
	if !strings.Contains(instructions, "fact.upsert") {
		t.Fatalf("instructions missing audited writes: %s", instructions)
	}
}

func TestContextGetHappyPath(t *testing.T) {
	server := testServer(t)
	text, err := server.callTool(ToolContextGet, map[string]any{
		"project_id": demoseed.ProjectID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(text, demoseed.ProjectID) || !strings.Contains(text, `"Items"`) {
		t.Fatalf("unexpected package: %s", text)
	}
}

func TestEntityGetHappyPath(t *testing.T) {
	server := testServer(t)
	entities, err := server.Store.ListCanonEntities(demoseed.ProjectID, "")
	if err != nil || len(entities) == 0 {
		t.Fatalf("need seeded entities: %v len=%d", err, len(entities))
	}
	text, err := server.callTool(ToolEntityGet, map[string]any{"id": entities[0].ID})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(text, entities[0].ID) {
		t.Fatalf("unexpected entity: %s", text)
	}
}

func TestEvidenceGetHappyPath(t *testing.T) {
	server := testServer(t)
	evidence, err := canon.NewEvidence(
		demoseed.ProjectID,
		canon.EvidenceKindFile,
		"README describes polterware-core",
		"fs",
		"README.md",
		"system",
	)
	if err != nil {
		t.Fatal(err)
	}
	if err := server.Store.UpsertCanonEvidence(evidence); err != nil {
		t.Fatal(err)
	}
	text, err := server.callTool(ToolEvidenceGet, map[string]any{"id": evidence.ID})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(text, evidence.ID) || !strings.Contains(text, "README.md") {
		t.Fatalf("unexpected evidence: %s", text)
	}
}

func TestDriftCheckNarrow(t *testing.T) {
	server := testServer(t)
	text, err := server.callTool(ToolDriftCheck, map[string]any{
		"project_id": demoseed.ProjectID,
		"entity_id":  "ent-example",
	})
	if err != nil {
		t.Fatal(err)
	}
	var result drift.Result
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		t.Fatal(err)
	}
	if result.Status != "ok" || result.Checker != drift.CheckerNarrow {
		t.Fatalf("unexpected result: %+v", result)
	}
	if result.ProjectID != demoseed.ProjectID || result.EntityID != "ent-example" {
		t.Fatalf("unexpected ids: %+v", result)
	}
	if result.Findings == nil {
		t.Fatal("findings must be a slice, got nil")
	}
}

func TestUnknownAndLegacyToolsRejected(t *testing.T) {
	server := testServer(t)
	for _, name := range []string{"search", "compile_context", "get_entity", "unknown"} {
		_, err := server.invokeTool(name, map[string]any{"project_id": demoseed.ProjectID})
		if err == nil {
			t.Fatalf("expected error for %q", name)
		}
		if !strings.Contains(err.Error(), "unknown tool") {
			t.Fatalf("unexpected error for %q: %v", name, err)
		}
	}
}

func TestAgentRunAuditChain(t *testing.T) {
	server := testServer(t)

	startText, err := server.callTool(ToolAgentRunStart, map[string]any{
		"project_id":  demoseed.ProjectID,
		"task":        "Validate import drift",
		"agent_label": "test",
	})
	if err != nil {
		t.Fatal(err)
	}
	var started map[string]any
	if err := json.Unmarshal([]byte(startText), &started); err != nil {
		t.Fatal(err)
	}
	runID, _ := started["id"].(string)
	if runID == "" || started["status"] != "open" {
		t.Fatalf("unexpected start: %s", startText)
	}

	if _, err := server.callTool(ToolContextGet, map[string]any{
		"project_id":   demoseed.ProjectID,
		"agent_run_id": runID,
	}); err != nil {
		t.Fatal(err)
	}

	if _, err := server.callTool(ToolAgentRunAppend, map[string]any{
		"agent_run_id": runID,
		"kind":         "change",
		"summary":      "Document DEPENDS_ON edge",
		"rationale":    "Matches accepted Decision scope",
		"paths":        []any{"docs/decision/0004-product-positioning-and-wedge.md"},
	}); err != nil {
		t.Fatal(err)
	}

	evidence, err := canon.NewEvidence(
		demoseed.ProjectID,
		canon.EvidenceKindFile,
		"Decision text",
		"fs",
		"docs/decision/0004-product-positioning-and-wedge.md",
		"system",
	)
	if err != nil {
		t.Fatal(err)
	}
	if err := server.Store.UpsertCanonEvidence(evidence); err != nil {
		t.Fatal(err)
	}
	if _, err := server.callTool(ToolAgentRunAppend, map[string]any{
		"agent_run_id": runID,
		"kind":         "evidence",
		"evidence_ids": []any{evidence.ID},
	}); err != nil {
		t.Fatal(err)
	}

	if _, err := server.callTool(ToolDriftCheck, map[string]any{
		"project_id":   demoseed.ProjectID,
		"agent_run_id": runID,
	}); err != nil {
		t.Fatal(err)
	}

	if _, err := server.callTool(ToolAgentRunComplete, map[string]any{
		"agent_run_id": runID,
	}); err != nil {
		t.Fatal(err)
	}

	getText, err := server.callTool(ToolAgentRunGet, map[string]any{"id": runID})
	if err != nil {
		t.Fatal(err)
	}
	var record map[string]any
	if err := json.Unmarshal([]byte(getText), &record); err != nil {
		t.Fatal(err)
	}
	if record["status"] != "completed" {
		t.Fatalf("expected completed: %s", getText)
	}
	steps, ok := record["steps"].([]any)
	if !ok || len(steps) != 4 {
		t.Fatalf("expected 4 steps, got %#v", record["steps"])
	}
	kinds := make([]string, 0, 4)
	for _, raw := range steps {
		step := raw.(map[string]any)
		kinds = append(kinds, step["kind"].(string))
	}
	wantKinds := []string{"context", "change", "evidence", "drift"}
	for i, want := range wantKinds {
		if kinds[i] != want {
			t.Fatalf("step[%d]=%q, want %q (all=%v)", i, kinds[i], want, kinds)
		}
	}

	listText, err := server.callTool(ToolAgentRunList, map[string]any{
		"project_id": demoseed.ProjectID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(listText, runID) {
		t.Fatalf("list missing run: %s", listText)
	}
}

func TestAuditedWritesRequireEnvelopeAndMutate(t *testing.T) {
	server := testServer(t)

	startText, err := server.callTool(ToolAgentRunStart, map[string]any{
		"project_id": demoseed.ProjectID,
		"task":       "Record Decision fact",
	})
	if err != nil {
		t.Fatal(err)
	}
	var started map[string]any
	if err := json.Unmarshal([]byte(startText), &started); err != nil {
		t.Fatal(err)
	}
	runID, _ := started["id"].(string)

	_, err = server.callTool(ToolFactUpsert, map[string]any{
		"project_id": demoseed.ProjectID,
		"statement":  "SQLite is the local store",
	})
	if err == nil {
		t.Fatal("expected missing envelope error")
	}

	factText, err := server.callTool(ToolFactUpsert, map[string]any{
		"project_id":   demoseed.ProjectID,
		"agent_run_id": runID,
		"summary":      "Add local store fact",
		"rationale":    "Matches accepted Decision",
		"statement":    "SQLite is the local store",
		"truth_class":  canon.TruthDeclared,
	})
	if err != nil {
		t.Fatal(err)
	}
	var factOut map[string]any
	if err := json.Unmarshal([]byte(factText), &factOut); err != nil {
		t.Fatal(err)
	}
	factResult := factOut["result"].(map[string]any)
	factID, _ := factResult["id"].(string)
	if factID == "" || factResult["actor"] != "agent" || factResult["source"] != "mcp" {
		t.Fatalf("unexpected fact result: %s", factText)
	}

	evText, err := server.callTool(ToolEvidenceUpsert, map[string]any{
		"project_id":       demoseed.ProjectID,
		"agent_run_id":     runID,
		"summary":          "Attach Decision evidence",
		"rationale":        "File backs the fact",
		"kind":             canon.EvidenceKindFile,
		"evidence_summary": "Decision text",
		"path":             "docs/decision/0004-product-positioning-and-wedge.md",
	})
	if err != nil {
		t.Fatal(err)
	}
	var evOut map[string]any
	if err := json.Unmarshal([]byte(evText), &evOut); err != nil {
		t.Fatal(err)
	}
	evidenceID, _ := evOut["result"].(map[string]any)["id"].(string)

	if _, err := server.callTool(ToolEvidenceLink, map[string]any{
		"project_id":   demoseed.ProjectID,
		"agent_run_id": runID,
		"summary":      "Link evidence to fact",
		"rationale":    "Provenance chain",
		"fact_id":      factID,
		"evidence_id":  evidenceID,
	}); err != nil {
		t.Fatal(err)
	}

	knowText, err := server.callTool(ToolKnowledgeUpsert, map[string]any{
		"project_id":   demoseed.ProjectID,
		"agent_run_id": runID,
		"summary":      "Add Decision library item",
		"rationale":    "Document the decision",
		"title":        "Local SQLite Decision",
		"kind":         "decision",
		"body":         "Use SQLite for Desktop.",
		"tags":         []any{"storage"},
	})
	if err != nil {
		t.Fatal(err)
	}
	var knowOut map[string]any
	if err := json.Unmarshal([]byte(knowText), &knowOut); err != nil {
		t.Fatal(err)
	}
	knowledgeID, _ := knowOut["result"].(map[string]any)["id"].(string)
	if knowledgeID == "" {
		t.Fatalf("missing knowledge id: %s", knowText)
	}

	entities, err := server.Store.ListCanonEntities(demoseed.ProjectID, "")
	if err != nil || len(entities) == 0 {
		t.Fatalf("need entities: %v", err)
	}
	if _, err := server.callTool(ToolKnowledgeLink, map[string]any{
		"project_id":   demoseed.ProjectID,
		"agent_run_id": runID,
		"summary":      "Link Decision to entity",
		"rationale":    "Documents the component",
		"knowledge_id": knowledgeID,
		"entity_id":    entities[0].ID,
		"predicate":    canon.PredDocuments,
	}); err != nil {
		t.Fatal(err)
	}

	stored, err := server.Store.GetCanonFact(factID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Statement != "SQLite is the local store" || stored.Actor != "agent" {
		t.Fatalf("fact not persisted: %+v", stored)
	}
	linked, err := server.Store.ListCanonEvidenceForFact(factID)
	if err != nil || len(linked) != 1 || linked[0].ID != evidenceID {
		t.Fatalf("evidence link missing: %v %#v", err, linked)
	}

	getText, err := server.callTool(ToolAgentRunGet, map[string]any{"id": runID})
	if err != nil {
		t.Fatal(err)
	}
	var record map[string]any
	if err := json.Unmarshal([]byte(getText), &record); err != nil {
		t.Fatal(err)
	}
	steps, ok := record["steps"].([]any)
	if !ok || len(steps) != 5 {
		t.Fatalf("expected 5 change steps from writes, got %#v", record["steps"])
	}
	first := steps[0].(map[string]any)
	payload := first["payload"].(map[string]any)
	if payload["tool"] != ToolFactUpsert {
		t.Fatalf("first change tool=%v", payload["tool"])
	}
}

func TestAuditedWriteRejectsClosedRun(t *testing.T) {
	server := testServer(t)
	startText, err := server.callTool(ToolAgentRunStart, map[string]any{
		"project_id": demoseed.ProjectID,
		"task":       "closed write",
	})
	if err != nil {
		t.Fatal(err)
	}
	var started map[string]any
	_ = json.Unmarshal([]byte(startText), &started)
	runID, _ := started["id"].(string)
	if _, err := server.callTool(ToolAgentRunComplete, map[string]any{"agent_run_id": runID}); err != nil {
		t.Fatal(err)
	}
	_, err = server.callTool(ToolFactUpsert, map[string]any{
		"project_id":   demoseed.ProjectID,
		"agent_run_id": runID,
		"summary":      "late",
		"rationale":    "should fail",
		"statement":    "nope",
	})
	if err == nil {
		t.Fatal("expected closed-run rejection")
	}
}
