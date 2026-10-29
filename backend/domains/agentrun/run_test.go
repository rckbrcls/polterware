package agentrun

import (
	"errors"
	"strings"
	"testing"
	"time"

	contextpkg "github.com/polterware/polterware/backend/domains/context"
	"github.com/polterware/polterware/backend/domains/drift"
)

func TestStartAndComplete(t *testing.T) {
	now := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)
	run, err := Start("proj-1", "Fix import drift", "cursor", now)
	if err != nil {
		t.Fatal(err)
	}
	if run.Status != StatusOpen || run.ID == "" || run.Task != "Fix import drift" {
		t.Fatalf("unexpected run: %+v", run)
	}
	if run.ActorKind != ActorKindAgent {
		t.Fatalf("expected agent actor kind, got %q", run.ActorKind)
	}
	human, err := StartWithActor("proj-1", "Edit decision", "Desktop", ActorKindHuman, now)
	if err != nil {
		t.Fatal(err)
	}
	if human.ActorKind != ActorKindHuman {
		t.Fatalf("expected human actor kind, got %q", human.ActorKind)
	}
	done, err := Complete(run, now.Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if done.Status != StatusCompleted || done.CompletedAt == nil {
		t.Fatalf("expected completed: %+v", done)
	}
	if _, err := Complete(done, now); !errors.Is(err, ErrRunNotOpen) {
		t.Fatalf("expected ErrRunNotOpen, got %v", err)
	}
}

func TestStartValidation(t *testing.T) {
	if _, err := Start("", "task", "", time.Time{}); !errors.Is(err, ErrEmptyProject) {
		t.Fatalf("got %v", err)
	}
	if _, err := Start("p", "  ", "", time.Time{}); !errors.Is(err, ErrEmptyTask) {
		t.Fatalf("got %v", err)
	}
}

func TestChangeStepRequiresEnvelope(t *testing.T) {
	if _, err := NewChangeStep("arun-1", "", "why", nil, time.Time{}); !errors.Is(err, ErrChangeIncomplete) {
		t.Fatalf("got %v", err)
	}
	step, err := NewChangeStep("arun-1", "Add DEPENDS_ON", "Matches Decision", []string{"docs/decision/0004.md"}, time.Time{})
	if err != nil {
		t.Fatal(err)
	}
	if step.Kind != KindChange || !strings.Contains(step.PayloadJSON, "rationale") {
		t.Fatalf("unexpected step: %+v", step)
	}
}

func TestValidateAuditedWrite(t *testing.T) {
	if err := ValidateAuditedWrite("s", "r", ""); !errors.Is(err, ErrMissingAgentRunID) {
		t.Fatalf("got %v", err)
	}
	if err := ValidateAuditedWrite("", "r", "arun-1"); !errors.Is(err, ErrChangeIncomplete) {
		t.Fatalf("got %v", err)
	}
	if err := ValidateAuditedWrite("s", "r", "arun-1"); err != nil {
		t.Fatal(err)
	}
}

func TestMatchProject(t *testing.T) {
	run := Run{ProjectID: "proj-1", Status: StatusOpen}
	if err := MatchProject(run, "proj-2"); !errors.Is(err, ErrProjectMismatch) {
		t.Fatalf("got %v", err)
	}
	if err := MatchProject(run, "proj-1"); err != nil {
		t.Fatal(err)
	}
}

func TestMutationChangeStepIncludesTool(t *testing.T) {
	step, err := NewMutationChangeStep(
		"arun-1", "Add fact", "From Decision", "fact.upsert",
		[]string{"fact-1"}, []string{"docs/decision/0004.md"}, time.Time{},
	)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(step.PayloadJSON, `"tool":"fact.upsert"`) {
		t.Fatalf("missing tool in payload: %s", step.PayloadJSON)
	}
	if !strings.Contains(step.PayloadJSON, "fact-1") {
		t.Fatalf("missing subject id: %s", step.PayloadJSON)
	}
}

func TestContextAndDriftPayloads(t *testing.T) {
	pkg := contextpkg.Package{
		Query: "sqlite", EntityID: "ent-1", TokensUsed: 40,
		Items: []contextpkg.Item{
			{ID: "item-1", Evidence: []contextpkg.EvidenceRef{{ID: "ev-1"}, {ID: "ev-1"}}},
			{ID: "item-2"},
		},
	}
	step, err := NewContextStep("arun-1", pkg, time.Time{})
	if err != nil {
		t.Fatal(err)
	}
	if step.Kind != KindContext || !strings.Contains(step.PayloadJSON, "item-1") {
		t.Fatalf("unexpected context step: %+v", step)
	}

	result := drift.Result{
		Findings: []drift.Finding{{Type: drift.TypeDependencyAdded, Severity: drift.SeverityInfo, Summary: "new dep"}},
	}
	driftStep, err := NewDriftStep("arun-1", result, time.Time{})
	if err != nil {
		t.Fatal(err)
	}
	if driftStep.Kind != KindDrift || !strings.Contains(driftStep.Summary, "1 finding") {
		t.Fatalf("unexpected drift step: %+v", driftStep)
	}
}
