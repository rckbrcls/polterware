package agentrun

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	contextpkg "github.com/polterware/polterware/backend/domains/context"
	"github.com/polterware/polterware/backend/domains/drift"
)

// ContextPayload is a light snapshot of a compiled context package.
type ContextPayload struct {
	Query       string   `json:"query,omitempty"`
	EntityID    string   `json:"entity_id,omitempty"`
	ItemIDs     []string `json:"item_ids,omitempty"`
	EvidenceIDs []string `json:"evidence_ids,omitempty"`
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

// EvidencePayload lists evidence ids attributed to the run.
type EvidencePayload struct {
	EvidenceIDs []string `json:"evidence_ids"`
}

// DriftFindingPayload is a compact drift finding for audit storage.
type DriftFindingPayload struct {
	Type       string   `json:"type"`
	Severity   string   `json:"severity"`
	Summary    string   `json:"summary"`
	SubjectIDs []string `json:"subject_ids,omitempty"`
}

// DriftPayload stores narrow checker findings attached to a run.
type DriftPayload struct {
	Findings []DriftFindingPayload `json:"findings"`
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
	seenEvidence := map[string]struct{}{}
	evidenceIDs := make([]string, 0)
	for _, item := range pkg.Items {
		if item.ID != "" {
			itemIDs = append(itemIDs, item.ID)
		}
		for _, ref := range item.Evidence {
			if ref.ID == "" {
				continue
			}
			if _, ok := seenEvidence[ref.ID]; ok {
				continue
			}
			seenEvidence[ref.ID] = struct{}{}
			evidenceIDs = append(evidenceIDs, ref.ID)
		}
	}
	return ContextPayload{
		Query:       pkg.Query,
		EntityID:    pkg.EntityID,
		ItemIDs:     itemIDs,
		EvidenceIDs: evidenceIDs,
	}
}

func ContextStepSummary(pkg contextpkg.Package) string {
	return fmt.Sprintf("context package: %d items, %d tokens", len(pkg.Items), pkg.TokensUsed)
}

func DriftFromResult(result drift.Result) DriftPayload {
	findings := make([]DriftFindingPayload, 0, len(result.Findings))
	for _, f := range result.Findings {
		findings = append(findings, DriftFindingPayload{
			Type:       f.Type,
			Severity:   f.Severity,
			Summary:    f.Summary,
			SubjectIDs: f.SubjectIDs,
		})
	}
	return DriftPayload{Findings: findings}
}

func DriftStepSummary(result drift.Result) string {
	n := len(result.Findings)
	if n == 0 {
		return "drift check: no findings"
	}
	return fmt.Sprintf("drift check: %d finding(s)", n)
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

func NewEvidenceStep(runID string, evidenceIDs []string, now time.Time) (Step, error) {
	payload, err := MarshalPayload(EvidencePayload{EvidenceIDs: evidenceIDs})
	if err != nil {
		return Step{}, err
	}
	summary := fmt.Sprintf("evidence: %d id(s)", len(evidenceIDs))
	return newStep(runID, KindEvidence, summary, payload, now), nil
}

func NewContextStep(runID string, pkg contextpkg.Package, now time.Time) (Step, error) {
	payload, err := MarshalPayload(ContextFromPackage(pkg))
	if err != nil {
		return Step{}, err
	}
	return newStep(runID, KindContext, ContextStepSummary(pkg), payload, now), nil
}

func NewDriftStep(runID string, result drift.Result, now time.Time) (Step, error) {
	payload, err := MarshalPayload(DriftFromResult(result))
	if err != nil {
		return Step{}, err
	}
	return newStep(runID, KindDrift, DriftStepSummary(result), payload, now), nil
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
