package canon

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"strings"
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

// EvidenceRef is a typed evidence reference written inline, such as
// `file:go.mod`, `commit:3f2a9c1`, or `url:https://example.com/spec`.
type EvidenceRef struct {
	Kind  string
	Value string
}

// ParseEvidenceRef reads a typed reference; ok is false for a plain evidence id.
func ParseEvidenceRef(ref string) (EvidenceRef, bool) {
	prefix, value, found := strings.Cut(strings.TrimSpace(ref), ":")
	value = strings.TrimSpace(value)
	if !found || value == "" {
		return EvidenceRef{}, false
	}
	switch prefix {
	case "file":
		return EvidenceRef{Kind: EvidenceKindFile, Value: value}, true
	case "commit":
		return EvidenceRef{Kind: EvidenceKindCommit, Value: value}, true
	case "url":
		return EvidenceRef{Kind: EvidenceKindOther, Value: value}, true
	}
	return EvidenceRef{}, false
}

// Evidence is the record a typed reference stands for. Its id is derived
// from the project, kind, and value, so writing the same reference twice
// links the same row.
func (ref EvidenceRef) Evidence(projectID string) Evidence {
	sum := sha256.Sum256([]byte(projectID + "\n" + ref.Kind + "\n" + ref.Value))
	summary := ref.Value
	switch ref.Kind {
	case EvidenceKindFile:
		summary = "File " + ref.Value
	case EvidenceKindCommit:
		summary = "Commit " + ref.Value
	}
	return Evidence{ID: "ev-" + ref.Kind + "-" + hex.EncodeToString(sum[:6]), ProjectID: projectID, Kind: ref.Kind, Summary: summary, Source: "polter", Path: ref.Value}
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
