package seed

import (
	"time"

	"github.com/polterware/polterware/backend/domains/canon"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// seedFacts declares what AGENTS.md says, each backed by that file. Observed facts and Git evidence come from the scan.
func seedFacts(store *storepkg.Store) error {
	at := time.Now().UTC()
	evidence := []canon.Evidence{
		{ID: "ev-agents", Kind: canon.EvidenceKindFile, Summary: "AGENTS.md states the product boundary and architecture rules.", Source: "seed", Path: "AGENTS.md"},
	}
	for _, item := range evidence {
		item.ProjectID, item.Actor, item.ObservedAt, item.CreatedAt, item.UpdatedAt = ProjectID, "system", at, at, at
		if err := store.UpsertCanonEvidence(item); err != nil {
			return err
		}
	}
	facts := []struct {
		id, statement, source, evidence string
	}{
		{"fact-single-core", "Only the local core process opens SQLite.", "AGENTS.md", "ev-agents"},
		{"fact-core-daemon", "The core is a detached daemon that keeps running until stopped.", "AGENTS.md", "ev-agents"},
		{"fact-renderer-bridge", "The renderer reads and writes only through window.polterware.", "AGENTS.md", "ev-agents"},
		{"fact-no-credentials", "Provider credentials are never persisted in SQLite.", "AGENTS.md", "ev-agents"},
		{"fact-category", "The category is Project Context and Change Intelligence for AI Coding.", "AGENTS.md", "ev-agents"},
		{"fact-store-truth", "The Polterware store is the source of truth; Polter text is input, not storage.", "AGENTS.md", "ev-agents"},
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
		if err := store.LinkCanonEvidenceToFact(ProjectID, fact.ID, item.evidence); err != nil {
			return err
		}
	}
	return nil
}
