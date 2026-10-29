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
	// DocType is doc, runbook, or source for a doc and empty for a decision.
	DocType   string
	Tags      []string
	Summary   string
	Owner     string
	Status    string
	ExtraJSON string
	CreatedAt time.Time
	UpdatedAt time.Time
	// ArchivedAt is zero while the item is active.
	ArchivedAt time.Time
}

// Archived reports whether the item is in the archive.
func (item Item) Archived() bool { return !item.ArchivedAt.IsZero() }

const MaxBody = 64 * 1024

var ErrInvalid = errors.New("invalid knowledge item")

// ErrDecisionArchive rejects archiving or deleting a decision: decisions are
// superseded, never removed.
var ErrDecisionArchive = errors.New("decisions are never archived or deleted: supersede them")

// ErrNotArchived rejects a permanent delete of an item that is still active.
var ErrNotArchived = errors.New("archive the item before deleting it permanently")

// ErrArchived rejects an edit of an archived item, which is read-only.
var ErrArchived = errors.New("restore the item before editing it")

// Kinds. A decision is one Decision with its lifecycle; a doc is a document
// that backs facts, typed by DocType.
const (
	KindDoc      = "doc"
	KindDecision = "decision"
)

// Doc types: a doc describes, a runbook is a procedure, and a source is a
// registered project file.
const (
	DocTypeDoc     = "doc"
	DocTypeRunbook = "runbook"
	DocTypeSource  = "source"
)

func ValidKind(kind string) bool {
	switch kind {
	case KindDoc, KindDecision:
		return true
	default:
		return false
	}
}

// NormalizeKind reads a kind and the doc type it implies: a doc type names a
// doc of that type, and a decision has no doc type.
func NormalizeKind(kind string) (string, string) {
	switch kind {
	case DocTypeDoc, DocTypeRunbook, DocTypeSource:
		return KindDoc, kind
	default:
		return kind, ""
	}
}

// DocTypeFor returns the stored doc type of kind: the given type for a doc
// (doc when empty or unknown) and empty for a decision.
func DocTypeFor(kind, docType string) string {
	if kind != KindDoc {
		return ""
	}
	switch docType {
	case DocTypeRunbook, DocTypeSource:
		return docType
	default:
		return DocTypeDoc
	}
}

func NewItem(id, projectID, title, body, kind string, tags []string) (Item, error) {
	kind, docType := NormalizeKind(kind)
	if id == "" || projectID == "" || title == "" || !ValidKind(kind) || len(body) > MaxBody {
		return Item{}, ErrInvalid
	}
	now := time.Now().UTC()
	return Item{ID: id, ProjectID: projectID, Title: title, Body: body, Kind: kind, DocType: DocTypeFor(kind, docType), Tags: tags, ExtraJSON: "{}", CreatedAt: now, UpdatedAt: now}, nil
}
