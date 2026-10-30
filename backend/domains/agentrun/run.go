package agentrun

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"
)

const (
	StatusOpen      = "open"
	StatusCompleted = "completed"
)

const (
	KindContext = "context"
	KindChange  = "change"
	KindDrift   = "drift"
)

const (
	// ActorAgent is the provenance actor for audited MCP writes.
	ActorAgent = "agent"
	// ActorHuman is the provenance actor for audited Desktop writes.
	ActorHuman = "human"
	// SourceMCP is the provenance source for audited MCP writes.
	SourceMCP = "mcp"
	// SourceDesktop is the provenance source for audited Desktop writes.
	SourceDesktop = "desktop"

	// ActorKindAgent labels AgentRuns started by coding agents.
	ActorKindAgent = "agent"
	// ActorKindHuman labels AgentRuns started by Desktop humans.
	ActorKindHuman = "human"
)

var (
	ErrUnknownRun        = errors.New("unknown agent run")
	ErrRunNotOpen        = errors.New("agent run is not open")
	ErrInvalidKind       = errors.New("invalid agent run step kind")
	ErrInvalidActorKind  = errors.New("invalid actor kind")
	ErrChangeIncomplete  = errors.New("change step requires summary and rationale")
	ErrMissingAgentRunID = errors.New("agent_run_id is required")
	ErrProjectMismatch   = errors.New("project_id does not match agent run")
	ErrEmptyTask         = errors.New("task is required")
	ErrEmptyProject      = errors.New("project_id is required")
)

// Run is a minimal AgentRun audit header (task lives here, not as a step).
type Run struct {
	ID          string
	ProjectID   string
	Task        string
	AgentLabel  string
	ActorKind   string
	Status      string
	CreatedAt   time.Time
	CompletedAt *time.Time
}

// Step is one link in context → change → drift.
type Step struct {
	ID          string
	AgentRunID  string
	Kind        string
	Summary     string
	PayloadJSON string
	CreatedAt   time.Time
}

// Record is a run plus ordered steps for reconstruction.
type Record struct {
	Run   Run
	Steps []Step
}

func NewRunID() string {
	return "arun-" + randomHex(12)
}

func NewStepID() string {
	return "astep-" + randomHex(12)
}

func randomHex(n int) string {
	buf := make([]byte, n)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}

func NormalizeKind(kind string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case KindContext:
		return KindContext, nil
	case KindChange:
		return KindChange, nil
	case KindDrift:
		return KindDrift, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrInvalidKind, kind)
	}
}

func ValidateStart(projectID, task string) error {
	if strings.TrimSpace(projectID) == "" {
		return ErrEmptyProject
	}
	if strings.TrimSpace(task) == "" {
		return ErrEmptyTask
	}
	return nil
}

// NormalizeActorKind returns human|agent. Empty defaults to agent for MCP compatibility.
func NormalizeActorKind(kind string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "", ActorKindAgent:
		return ActorKindAgent, nil
	case ActorKindHuman:
		return ActorKindHuman, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrInvalidActorKind, kind)
	}
}

func ValidateChange(summary, rationale string) error {
	if strings.TrimSpace(summary) == "" || strings.TrimSpace(rationale) == "" {
		return ErrChangeIncomplete
	}
	return nil
}

// ValidateChangeAs checks the envelope for one actor: every write needs a
// summary, and an agent's also needs a rationale. A person may leave the
// reason out; Activity shows that no reason was given.
func ValidateChangeAs(actorKind, summary, rationale string) error {
	if actorKind == ActorKindHuman {
		if strings.TrimSpace(summary) == "" {
			return ErrChangeIncomplete
		}
		return nil
	}
	return ValidateChange(summary, rationale)
}

// ValidateAuditedWrite requires the B7 mutation envelope before any Canon/Knowledge write.
func ValidateAuditedWrite(summary, rationale, agentRunID string) error {
	if strings.TrimSpace(agentRunID) == "" {
		return ErrMissingAgentRunID
	}
	return ValidateChange(summary, rationale)
}

// MatchProject ensures the mutation targets the same project as the open run.
func MatchProject(run Run, projectID string) error {
	if strings.TrimSpace(projectID) == "" {
		return ErrEmptyProject
	}
	if run.ProjectID != strings.TrimSpace(projectID) {
		return ErrProjectMismatch
	}
	return nil
}

func CanAppend(run Run) error {
	if run.Status != StatusOpen {
		return ErrRunNotOpen
	}
	return nil
}

func CanComplete(run Run) error {
	if run.Status != StatusOpen {
		return ErrRunNotOpen
	}
	return nil
}

func Start(projectID, task, agentLabel string, now time.Time) (Run, error) {
	return StartWithActor(projectID, task, agentLabel, ActorKindAgent, now)
}

// StartWithActor creates an open AgentRun for the given actor kind (human|agent).
func StartWithActor(projectID, task, agentLabel, actorKind string, now time.Time) (Run, error) {
	if err := ValidateStart(projectID, task); err != nil {
		return Run{}, err
	}
	kind, err := NormalizeActorKind(actorKind)
	if err != nil {
		return Run{}, err
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	return Run{
		ID:         NewRunID(),
		ProjectID:  strings.TrimSpace(projectID),
		Task:       strings.TrimSpace(task),
		AgentLabel: strings.TrimSpace(agentLabel),
		ActorKind:  kind,
		Status:     StatusOpen,
		CreatedAt:  now.UTC(),
	}, nil
}

func Complete(run Run, now time.Time) (Run, error) {
	if err := CanComplete(run); err != nil {
		return Run{}, err
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	completed := now.UTC()
	run.Status = StatusCompleted
	run.CompletedAt = &completed
	return run, nil
}
