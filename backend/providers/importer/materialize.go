package importer

import (
	"fmt"
	"time"

	"github.com/polterware/polterware/backend/domains/canon"
)

// Materialize converts a FileResult into domain facts and evidence with stable IDs.
func Materialize(projectID string, file FileResult, now time.Time) (canon.Evidence, []canon.Fact, error) {
	if file.Skipped {
		return canon.Evidence{}, nil, fmt.Errorf("skipped: %s", file.Reason)
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	evidenceID := StableEvidenceID(projectID, file.Path)
	evidence := canon.Evidence{
		ID:         evidenceID,
		ProjectID:  projectID,
		Kind:       canon.EvidenceKindFile,
		Summary:    file.Evidence.Summary,
		Source:     file.Evidence.Source,
		Path:       file.Path,
		Actor:      "system",
		ObservedAt: now,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if err := canon.ValidateEvidence(evidence); err != nil {
		return canon.Evidence{}, nil, err
	}
	facts := make([]canon.Fact, 0, len(file.Facts))
	for _, draft := range file.Facts {
		fact := canon.Fact{
			ID:         StableFactID(projectID, file.Path, draft.Key),
			ProjectID:  projectID,
			Statement:  draft.Statement,
			TruthClass: canon.TruthObserved,
			Source:     draft.Source,
			Actor:      "system",
			ObservedAt: now,
			CreatedAt:  now,
			UpdatedAt:  now,
		}
		if err := canon.ValidateFact(fact); err != nil {
			return canon.Evidence{}, nil, err
		}
		facts = append(facts, fact)
	}
	return evidence, facts, nil
}
