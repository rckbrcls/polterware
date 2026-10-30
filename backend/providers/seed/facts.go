package seed

import (
	"time"

	"github.com/polterware/polterware/backend/domains/canon"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// seedFacts declares what AGENTS.md says.
func seedFacts(store *storepkg.Store) error {
	at := time.Now().UTC()
	facts := []struct {
		id, statement, source string
	}{
		{"fact-single-core", "Only the local core process opens SQLite.", "AGENTS.md"},
		{"fact-core-daemon", "The core is a detached daemon that keeps running until stopped.", "AGENTS.md"},
		{"fact-renderer-bridge", "The renderer reads and writes only through window.polterware.", "AGENTS.md"},
		{"fact-no-credentials", "Provider credentials are never persisted in SQLite.", "AGENTS.md"},
		{"fact-category", "The category is Project Context and Change Intelligence for AI Coding.", "AGENTS.md"},
		{"fact-store-truth", "The Polterware store is the source of truth; Polter text is input, not storage.", "AGENTS.md"},
	}
	for i, item := range facts {
		when := at.Add(time.Duration(i) * time.Second)
		fact := canon.Fact{
			ID: item.id, ProjectID: ProjectID, Statement: item.statement, TruthClass: canon.TruthDeclared,
			Source: item.source, Actor: "system", ObservedAt: when, CreatedAt: when, UpdatedAt: when,
		}
		if err := store.UpsertCanonFact(fact); err != nil {
			return err
		}
	}
	return nil
}
