package knowledge

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"
)

func NewItemID() string {
	var buf [12]byte
	_, _ = rand.Read(buf[:])
	return "know-" + hex.EncodeToString(buf[:])
}

type Item struct {
	ID        string
	ProjectID string
	Title     string
	Body      string
	Kind      string
	Tags      []string
	Summary   string
	Owner     string
	Status    string
	ExtraJSON string
	CreatedAt time.Time
	UpdatedAt time.Time
}

const MaxBody = 64 * 1024

var ErrInvalid = errors.New("invalid knowledge item")

// Kinds. Evidence items are notes distinguished by tags (for example `doc`,
// `runbook`, `source`); verdicts are Decisions.
const (
	KindEvidence = "evidence"
	KindVerdict  = "verdict"
)

func ValidKind(kind string) bool {
	switch kind {
	case KindEvidence, KindVerdict:
		return true
	default:
		return false
	}
}

// NormalizeKind maps the former evidence kinds (doc, runbook, source) to
// `evidence` and returns the tag that preserves the old kind.
func NormalizeKind(kind string) (string, string) {
	switch kind {
	case "doc", "runbook", "source":
		return KindEvidence, kind
	default:
		return kind, ""
	}
}

func NewItem(id, projectID, title, body, kind string, tags []string) (Item, error) {
	kind, legacyTag := NormalizeKind(kind)
	if id == "" || projectID == "" || title == "" || !ValidKind(kind) || len(body) > MaxBody {
		return Item{}, ErrInvalid
	}
	if legacyTag != "" && !hasTag(tags, legacyTag) {
		tags = append(append([]string(nil), tags...), legacyTag)
	}
	now := time.Now().UTC()
	return Item{ID: id, ProjectID: projectID, Title: title, Body: body, Kind: kind, Tags: tags, ExtraJSON: "{}", CreatedAt: now, UpdatedAt: now}, nil
}

func hasTag(tags []string, tag string) bool {
	for _, existing := range tags {
		if existing == tag {
			return true
		}
	}
	return false
}
