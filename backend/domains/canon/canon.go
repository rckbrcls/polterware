package canon

import (
	"crypto/sha1"
	"encoding/hex"
	"errors"
	"fmt"
	"time"
)

const (
	KindComponent   = "component"
	KindEnvironment = "environment"

	RefArchitectureNode = "architecture_node"
	RefEnvironment      = "environment"

	TruthDeclared    = "declared"
	TruthObserved    = "observed"
	TruthOperational = "operational"
	TruthInferred    = "inferred"

	PredDocuments = "DOCUMENTS"
	PredOperates  = "OPERATES"
	PredRelatedTo = "RELATED_TO"
	PredDefines   = "DEFINES"
	PredDependsOn = "DEPENDS_ON"
	PredCalls     = "CALLS"

	SourceArchitectureLayout = "architecture_layout"
)

type Entity struct {
	ID         string
	ProjectID  string
	Kind       string
	RefKind    string
	RefID      string
	Title      string
	TruthClass string
	Source     string
	Actor      string
	ObservedAt time.Time
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

type Relationship struct {
	ID              string
	ProjectID       string
	SubjectEntityID string
	Predicate       string
	ObjectEntityID  string
	TruthClass      string
	Source          string
	Actor           string
	ObservedAt      time.Time
	CreatedAt       time.Time
}

type LayoutNode struct {
	ID    string
	Title string
}

var (
	ErrInvalid       = errors.New("invalid canon value")
	ErrUnknownEntity = errors.New("unknown canon entity")
)

func ValidKind(kind string) bool {
	switch kind {
	case KindComponent, KindEnvironment:
		return true
	default:
		return false
	}
}

func ValidRefKind(refKind string) bool {
	switch refKind {
	case RefArchitectureNode, RefEnvironment:
		return true
	default:
		return false
	}
}

func ValidTruthClass(value string) bool {
	switch value {
	case TruthDeclared, TruthObserved, TruthOperational, TruthInferred:
		return true
	default:
		return false
	}
}

func ValidPredicate(value string) bool {
	switch value {
	case PredDocuments, PredOperates, PredRelatedTo, PredDefines, PredDependsOn, PredCalls:
		return true
	default:
		return false
	}
}

// DependencyPredicates are edge types checked against active decisions.
func DependencyPredicates() []string {
	return []string{PredDependsOn, PredCalls}
}

func IsDependencyPredicate(value string) bool {
	return value == PredDependsOn || value == PredCalls
}

func EntityID(projectID, refKind, refID string) string {
	sum := sha1.Sum([]byte(projectID + "|" + refKind + "|" + refID))
	return "ent-" + hex.EncodeToString(sum[:12])
}

func RelationshipID(projectID, subjectID, predicate, objectID string) string {
	sum := sha1.Sum([]byte(projectID + "|" + subjectID + "|" + predicate + "|" + objectID))
	return "rel-" + hex.EncodeToString(sum[:12])
}

func NewEntity(projectID, kind, refKind, refID, title, truthClass, source, actor string) (Entity, error) {
	if projectID == "" || refID == "" || title == "" || !ValidKind(kind) || !ValidRefKind(refKind) {
		return Entity{}, ErrInvalid
	}
	if truthClass == "" {
		truthClass = TruthDeclared
	}
	if !ValidTruthClass(truthClass) {
		return Entity{}, ErrInvalid
	}
	if source == "" {
		source = "polterware"
	}
	if actor == "" {
		actor = "system"
	}
	now := time.Now().UTC()
	return Entity{
		ID:         EntityID(projectID, refKind, refID),
		ProjectID:  projectID,
		Kind:       kind,
		RefKind:    refKind,
		RefID:      refID,
		Title:      title,
		TruthClass: truthClass,
		Source:     source,
		Actor:      actor,
		ObservedAt: now,
		CreatedAt:  now,
		UpdatedAt:  now,
	}, nil
}

func NewRelationship(projectID, subjectID, predicate, objectID, truthClass, source, actor string) (Relationship, error) {
	if projectID == "" || subjectID == "" || objectID == "" || !ValidPredicate(predicate) {
		return Relationship{}, ErrInvalid
	}
	if truthClass == "" {
		truthClass = TruthDeclared
	}
	if !ValidTruthClass(truthClass) {
		return Relationship{}, ErrInvalid
	}
	if source == "" {
		source = "polterware"
	}
	if actor == "" {
		actor = "system"
	}
	now := time.Now().UTC()
	return Relationship{
		ID:              RelationshipID(projectID, subjectID, predicate, objectID),
		ProjectID:       projectID,
		SubjectEntityID: subjectID,
		Predicate:       predicate,
		ObjectEntityID:  objectID,
		TruthClass:      truthClass,
		Source:          source,
		Actor:           actor,
		ObservedAt:      now,
		CreatedAt:       now,
	}, nil
}

func DefaultPredicateForKnowledge(kind string) string {
	switch kind {
	case "runbook":
		return PredOperates
	default:
		return PredDocuments
	}
}

func FormatPath(entity Entity) string {
	return fmt.Sprintf("canon/%s/%s", entity.Kind, entity.RefID)
}
