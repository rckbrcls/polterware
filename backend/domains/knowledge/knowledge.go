package knowledge

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
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
	// DocType is doc for a doc and empty for a decision. Docs have no types: tags tell them apart.
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

// DocTypeDoc is the one doc type. Docs hold only what lives in Polterware
// (agents read repository files from the checkout) and are told apart by tags.
const DocTypeDoc = "doc"

// retiredDocTypeSource was a registered project file. Archived rows may still carry it.
const retiredDocTypeSource = "source"

// retiredDocTypeRunbook was a procedure; runbooks became docs tagged runbook.
const retiredDocTypeRunbook = "runbook"

// ErrSourceRetired refuses a write that names the retired source doc type.
var ErrSourceRetired = errors.New("source docs are retired: agents read repo files directly")

// CheckDocType refuses the retired source type; any other value is read by DocTypeFor.
func CheckDocType(docType string) error {
	if strings.TrimSpace(docType) == retiredDocTypeSource {
		return ErrSourceRetired
	}
	return nil
}

func ValidKind(kind string) bool {
	switch kind {
	case KindDoc, KindDecision:
		return true
	default:
		return false
	}
}

// NormalizeKind reads a kind: doc and the retired runbook name a doc, and any
// other value is kept as given.
func NormalizeKind(kind string) string {
	switch kind {
	case DocTypeDoc, retiredDocTypeRunbook:
		return KindDoc
	default:
		return kind
	}
}

// DocTypeFor returns the stored doc type of kind: doc for a doc and empty for a decision.
func DocTypeFor(kind string) string {
	if kind != KindDoc {
		return ""
	}
	return DocTypeDoc
}

func NewItem(id, projectID, title, body, kind string, tags []string) (Item, error) {
	if err := CheckDocType(kind); err != nil {
		return Item{}, err
	}
	kind = NormalizeKind(kind)
	if id == "" || projectID == "" || title == "" || !ValidKind(kind) || len(body) > MaxBody {
		return Item{}, ErrInvalid
	}
	now := time.Now().UTC()
	return Item{ID: id, ProjectID: projectID, Title: title, Body: body, Kind: kind, DocType: DocTypeFor(kind), Tags: tags, ExtraJSON: "{}", CreatedAt: now, UpdatedAt: now}, nil
}
