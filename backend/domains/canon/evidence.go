package canon

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

// Evidence is durable support for one or more facts.
type Evidence struct {
	ID         string
	ProjectID  string
	Kind       string
	Summary    string
	Source     string
	Path       string
	Actor      string
	ObservedAt time.Time
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

func NewEvidenceID() string {
	var buf [12]byte
	_, _ = rand.Read(buf[:])
	return "ev-" + hex.EncodeToString(buf[:])
}

func ValidEvidenceKind(kind string) bool {
	switch kind {
	case EvidenceKindFile, EvidenceKindObservation, EvidenceKindTest, EvidenceKindCommit, EvidenceKindOther:
		return true
	default:
		return false
	}
}

func NewEvidence(projectID, kind, summary, source, path, actor string) (Evidence, error) {
	if projectID == "" || !ValidEvidenceKind(kind) {
		return Evidence{}, ErrInvalid
	}
	if source == "" {
		source = "polterware"
	}
	if actor == "" {
		actor = "system"
	}
	now := time.Now().UTC()
	return Evidence{
		ID:         NewEvidenceID(),
		ProjectID:  projectID,
		Kind:       kind,
		Summary:    summary,
		Source:     source,
		Path:       path,
		Actor:      actor,
		ObservedAt: now,
		CreatedAt:  now,
		UpdatedAt:  now,
	}, nil
}

func ValidateEvidence(evidence Evidence) error {
	if evidence.ID == "" || evidence.ProjectID == "" || !ValidEvidenceKind(evidence.Kind) {
		return ErrInvalid
	}
	if evidence.Source == "" || evidence.Actor == "" {
		return ErrInvalid
	}
	return nil
}
