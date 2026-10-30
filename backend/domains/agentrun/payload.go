package agentrun

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	contextpkg "github.com/polterware/polterware/backend/domains/context"
)

// ContextPayload is a light snapshot of a compiled context package.
type ContextPayload struct {
	Query    string   `json:"query,omitempty"`
	EntityID string   `json:"entity_id,omitempty"`
	ItemIDs  []string `json:"item_ids,omitempty"`
}

// ChangePayload is a change envelope. Declared-only appends omit Tool/SubjectIDs;
// audited MCP writes (B7) set Tool and SubjectIDs after a real mutation.
type ChangePayload struct {
	Summary    string   `json:"summary"`
	Rationale  string   `json:"rationale"`
	Paths      []string `json:"paths,omitempty"`
	Tool       string   `json:"tool,omitempty"`
	SubjectIDs []string `json:"subject_ids,omitempty"`
	// BatchID links the step to its change_ops rows (Polter apply).
	BatchID string `json:"batch_id,omitempty"`
}

func MarshalPayload(value any) (string, error) {
	body, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return string(body), nil
}

func ContextFromPackage(pkg contextpkg.Package) ContextPayload {
	itemIDs := make([]string, 0, len(pkg.Items))
	for _, item := range pkg.Items {
		if item.ID != "" {
			itemIDs = append(itemIDs, item.ID)
		}
	}
	return ContextPayload{
		Query:    pkg.Query,
		EntityID: pkg.EntityID,
		ItemIDs:  itemIDs,
	}
}

func ContextStepSummary(pkg contextpkg.Package) string {
	return fmt.Sprintf("context package: %d items, %d tokens", len(pkg.Items), pkg.TokensUsed)
}

func NewChangeStep(runID, summary, rationale string, paths []string, now time.Time) (Step, error) {
	return NewMutationChangeStep(runID, summary, rationale, "", nil, paths, now)
}

// NewMutationChangeStep builds a change step, optionally attributing a write tool and subject ids.
func NewMutationChangeStep(runID, summary, rationale, tool string, subjectIDs, paths []string, now time.Time) (Step, error) {
	return NewBatchChangeStep(runID, summary, rationale, tool, "", subjectIDs, paths, now)
}

// NewBatchChangeStep is NewMutationChangeStep plus the change_ops batch id.
func NewBatchChangeStep(runID, summary, rationale, tool, batchID string, subjectIDs, paths []string, now time.Time) (Step, error) {
	// The audited write already checked the rationale for its actor (a person
	// may leave it out); every step still names its change.
	if strings.TrimSpace(summary) == "" {
		return Step{}, ErrChangeIncomplete
	}
	payload, err := MarshalPayload(ChangePayload{
		Summary:    strings.TrimSpace(summary),
		Rationale:  strings.TrimSpace(rationale),
		Paths:      paths,
		Tool:       strings.TrimSpace(tool),
		SubjectIDs: subjectIDs,
		BatchID:    strings.TrimSpace(batchID),
	})
	if err != nil {
		return Step{}, err
	}
	return newStep(runID, KindChange, strings.TrimSpace(summary), payload, now), nil
}

func NewContextStep(runID string, pkg contextpkg.Package, now time.Time) (Step, error) {
	payload, err := MarshalPayload(ContextFromPackage(pkg))
	if err != nil {
		return Step{}, err
	}
	return newStep(runID, KindContext, ContextStepSummary(pkg), payload, now), nil
}

func newStep(runID, kind, summary, payloadJSON string, now time.Time) Step {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	if payloadJSON == "" {
		payloadJSON = "{}"
	}
	return Step{
		ID:          NewStepID(),
		AgentRunID:  runID,
		Kind:        kind,
		Summary:     summary,
		PayloadJSON: payloadJSON,
		CreatedAt:   now.UTC(),
	}
}
