package demoseed

import (
	"time"

	"github.com/polterware/polterware/backend/domains/canon"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// seedFacts records the demo project's facts.
func seedFacts(store *storepkg.Store) error {
	observed := time.Date(2026, 9, 18, 10, 30, 0, 0, time.UTC)
	facts := []struct {
		fact canon.Fact
	}{
		{canon.Fact{ID: "fact-pnpm", Statement: "The workspace uses pnpm.", TruthClass: canon.TruthDeclared, Source: "package.json"}},
		{canon.Fact{ID: "fact-electron", Statement: "The Desktop is an Electron app.", TruthClass: canon.TruthDeclared, Source: "package.json"}},
		{canon.Fact{ID: "fact-sqlite", Statement: "Project state lives in a local SQLite database.", TruthClass: canon.TruthDeclared, Source: "go.mod"}},
		{canon.Fact{ID: "fact-drift-check", Statement: "Drift findings are computed from declared facts.", TruthClass: canon.TruthVerified, Source: "go test", Actor: "claude-code"}},
		{canon.Fact{ID: "fact-no-network", Statement: "Imports never call the network.", TruthClass: canon.TruthDeclared, Source: "Decision 0002"}},
		{canon.Fact{ID: "fact-redis-sessions", Statement: "Sessions are cached in Redis.", TruthClass: canon.TruthDeclared, Source: "doc-architecture"}},
		{canon.Fact{ID: "fact-webhook-queue", Statement: "Webhook retries will probably run through the event queue.", TruthClass: canon.TruthInferred, Source: "billing-webhooks"}},
	}
	for i, item := range facts {
		fact := item.fact
		at := observed.Add(time.Duration(i) * time.Minute)
		fact.ProjectID, fact.ObservedAt, fact.CreatedAt, fact.UpdatedAt = ProjectID, at, at, at
		if fact.Actor == "" {
			fact.Actor = "system"
		}
		if err := store.UpsertCanonFact(fact); err != nil {
			return err
		}
	}
	return nil
}
