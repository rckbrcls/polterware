package canon

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"
)

const TruthVerified = "verified"

var (
	ErrUnknownFact = errors.New("unknown canon fact")
	// ErrVerifiedRequiresActor is returned when truth_class is verified without a human actor.
	ErrVerifiedRequiresActor = errors.New("verified facts require a non-system actor")
)

// Fact is a project claim with provenance. Truth classes exclude operational
// (that class remains on entities only).
type Fact struct {
	ID         string
	ProjectID  string
	Statement  string
	TruthClass string
	Source     string
	Actor      string
	ObservedAt time.Time
	EntityID   string
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

func NewFactID() string {
	var buf [12]byte
	_, _ = rand.Read(buf[:])
	return "fact-" + hex.EncodeToString(buf[:])
}

func ValidFactTruthClass(value string) bool {
	switch value {
	case TruthDeclared, TruthInferred, TruthVerified:
		return true
	default:
		return false
	}
}

func NewFact(projectID, statement, truthClass, source, actor, entityID string) (Fact, error) {
	if projectID == "" || statement == "" {
		return Fact{}, ErrInvalid
	}
	if truthClass == "" {
		truthClass = TruthDeclared
	}
	if !ValidFactTruthClass(truthClass) {
		return Fact{}, ErrInvalid
	}
	if source == "" {
		source = "polterware"
	}
	if actor == "" {
		actor = "system"
	}
	if truthClass == TruthVerified && (actor == "" || actor == "system") {
		return Fact{}, ErrVerifiedRequiresActor
	}
	now := time.Now().UTC()
	return Fact{
		ID:         NewFactID(),
		ProjectID:  projectID,
		Statement:  statement,
		TruthClass: truthClass,
		Source:     source,
		Actor:      actor,
		ObservedAt: now,
		EntityID:   entityID,
		CreatedAt:  now,
		UpdatedAt:  now,
	}, nil
}

// ValidateFact checks an existing or client-supplied fact before upsert.
func ValidateFact(fact Fact) error {
	if fact.ID == "" || fact.ProjectID == "" || fact.Statement == "" {
		return ErrInvalid
	}
	if !ValidFactTruthClass(fact.TruthClass) {
		return ErrInvalid
	}
	if fact.TruthClass == TruthVerified && (fact.Actor == "" || fact.Actor == "system") {
		return ErrVerifiedRequiresActor
	}
	if fact.Source == "" || fact.Actor == "" {
		return ErrInvalid
	}
	return nil
}
