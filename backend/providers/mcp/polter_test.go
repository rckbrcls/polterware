package mcp

import (
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/domains/agentrun"
	"github.com/polterware/polterware/backend/domains/polter"
	"github.com/polterware/polterware/backend/providers/demoseed"
)

const polterRoadmap = `---
polter: 1
summary: Plan git import
rationale: Slice 5 needs a card before coding
---

## git-import: Git metadata import
stage: plan

- [ ] T1 Upsert commit evidence
? Include merge commits? [blocking] (yes | no)
`

// newRuns lists project runs that were not part of the seeded set.
func newRuns(t *testing.T, server *Server, seeded []agentrun.Run) []agentrun.Run {
	t.Helper()
	known := map[string]bool{}
	for _, run := range seeded {
		known[run.ID] = true
	}
	all, err := server.Store.ListAgentRuns(demoseed.ProjectID, 50)
	if err != nil {
		t.Fatal(err)
	}
	var out []agentrun.Run
	for _, run := range all {
		if !known[run.ID] {
			out = append(out, run)
		}
	}
	return out
}

func TestPolterFormatReturnsSpec(t *testing.T) {
	server := testServer(t)
	text, err := server.callTool(ToolPolterFormat, nil)
	if err != nil {
		t.Fatal(err)
	}
	if text != polter.SpecCore {
		t.Fatalf("polter.format returned %q", text)
	}
	topic, err := server.callTool(ToolPolterFormat, map[string]any{"topic": "decisions"})
	if err != nil || topic != polter.SpecTopics["decisions"] {
		t.Fatalf("polter.format decisions = %q, %v", topic, err)
	}
	if _, err := server.callTool(ToolPolterFormat, map[string]any{"topic": "nope"}); err == nil {
		t.Fatal("an unknown topic must fail")
	}
}

func TestPolterApplyUsesOneSessionRun(t *testing.T) {
	server := testServer(t)
	server.session.Label = "claude-code"
	seeded, _ := server.Store.ListAgentRuns(demoseed.ProjectID, 50)

	plan, err := server.callTool(ToolPolterApply, map[string]any{
		"project_id": demoseed.ProjectID, "text": polterRoadmap, "dry_run": true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(plan, "+ card git-import") {
		t.Fatalf("dry run plan: %s", plan)
	}
	if opened := newRuns(t, server, seeded); len(opened) != 0 {
		t.Fatalf("dry run opened %d runs", len(opened))
	}

	if _, err := server.callTool(ToolPolterApply, map[string]any{"project_id": demoseed.ProjectID, "text": polterRoadmap}); err != nil {
		t.Fatal(err)
	}
	stage := "---\npolter: 1\nsummary: Start build\nrationale: Plan approved\n---\n\n## git-import\nstage: build\n"
	if _, err := server.callTool(ToolPolterApply, map[string]any{"project_id": demoseed.ProjectID, "text": stage}); err != nil {
		t.Fatal(err)
	}
	again, err := server.callTool(ToolPolterApply, map[string]any{"project_id": demoseed.ProjectID, "text": stage})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(again, "no changes") {
		t.Fatalf("reapply: %s", again)
	}

	runs := newRuns(t, server, seeded)
	if len(runs) != 1 {
		t.Fatalf("expected one session run, got %d", len(runs))
	}
	if runs[0].Status != agentrun.StatusOpen || runs[0].AgentLabel != "claude-code" {
		t.Fatalf("session run: %+v", runs[0])
	}
	record, err := server.Store.GetAgentRunRecord(runs[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(record.Steps) != 2 {
		t.Fatalf("expected 2 change steps, got %d", len(record.Steps))
	}

	card, err := server.callTool(ToolPolterQuery, map[string]any{"project_id": demoseed.ProjectID, "query": "card git-import"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(card, "stage: build") {
		t.Fatalf("query card: %s", card)
	}

	server.session.Close(server.Store)
	run, _ := server.Store.GetAgentRun(runs[0].ID)
	if run.Status != agentrun.StatusCompleted {
		t.Fatalf("session run not completed: %s", run.Status)
	}
}

func TestPolterApplyRejectsInvalidTextWithoutRun(t *testing.T) {
	server := testServer(t)
	seeded, _ := server.Store.ListAgentRuns(demoseed.ProjectID, 50)
	bad := "---\npolter: 1\nsummary: x\nrationale: y\n---\n\n- [ ] orphan task\n"
	_, err := server.callTool(ToolPolterApply, map[string]any{"project_id": demoseed.ProjectID, "text": bad})
	if err == nil || !strings.Contains(err.Error(), "line 7") {
		t.Fatalf("expected line diagnostic, got %v", err)
	}
	missing := strings.Replace(polterRoadmap, "summary: Plan git import\n", "", 1)
	if _, err := server.callTool(ToolPolterApply, map[string]any{"project_id": demoseed.ProjectID, "text": missing}); err == nil {
		t.Fatal("expected missing summary error")
	}
	if runs := newRuns(t, server, seeded); len(runs) != 0 {
		t.Fatalf("invalid writes opened %d runs", len(runs))
	}
}
