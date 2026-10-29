package demoseed

import (
	"encoding/json"
	"time"

	"github.com/polterware/polterware/backend/domains/canon"
	"github.com/polterware/polterware/backend/domains/knowledge"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func seedKnowledge(store *storepkg.Store) error {
	docsUpdated := time.Date(2026, 9, 17, 22, 0, 0, 0, time.UTC)
	runbookUpdated := time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC)
	items := []knowledge.Item{
		{
			ID: "doc-architecture", ProjectID: ProjectID, Title: "System architecture", Kind: "doc", DocType: "doc",
			Body: "This document describes the local project topology represented on the Architecture canvas.\n\n## Boundaries\n\nComponents, resources, and operational workflows stay scoped to this project.",
			Tags: []string{"architecture", "local"}, Summary: "How the local project components fit together.",
			Owner: "Platform", Status: "published", ExtraJSON: mustJSON(map[string]any{
				"author": "Project maintainer", "environment": "All",
				"componentIds": []string{"n-gw", "n-pg"}, "componentNames": []string{"API Gateway", "PostgreSQL"},
			}),
			CreatedAt: docsUpdated, UpdatedAt: docsUpdated,
		},
		{
			ID: "doc-database", ProjectID: ProjectID, Title: "Database conventions", Kind: "doc", DocType: "doc",
			Body: "Use expand-and-contract migrations and validate backups before maintenance.\n\n## Naming\n\n- Tables: `snake_case` plural\n- Indexes: `idx_<table>_<columns>`",
			Tags: []string{"database", "conventions"}, Summary: "Naming, migrations, and backup windows.",
			Owner: "Platform", Status: "draft", ExtraJSON: mustJSON(map[string]any{
				"author": "Project maintainer", "environment": "All",
				"componentIds": []string{"n-pg"}, "componentNames": []string{"PostgreSQL"},
			}),
			CreatedAt: docsUpdated.Add(-72 * time.Hour), UpdatedAt: docsUpdated.Add(-72 * time.Hour),
		},
		{
			ID: "rb-service", ProjectID: ProjectID, Title: "Service recovery", Kind: "doc", DocType: "runbook",
			Body: "## Objective\n\nRestore a local service after a failed health check.\n\n## Prerequisites\n\n- Confirm the affected environment\n- Open a visual terminal session\n\n## Steps\n\n1. Inspect the process record\n2. Review the restart command\n3. Record the expected result\n\n## Commands\n\n```bash\nsystemctl status example-api\nsystemctl restart example-api\n```\n\n## Rollback\n\nRestore the previous service version if the health check remains degraded.",
			Tags: []string{"api", "recovery"}, Summary: "Restore a local service after a failed health check.",
			Owner: "Platform", Status: "published", ExtraJSON: mustJSON(map[string]any{
				"service": "API", "severity": "high",
				"prerequisites": []string{"Confirm the affected environment", "Open a visual terminal session"},
				"steps":         []string{"Inspect the process record", "Review the restart command", "Record the expected result"},
				"commands":      []string{"systemctl status example-api", "systemctl restart example-api"},
				"rollback":      "Restore the previous service version if the health check remains degraded.",
				"lastValidated": "2026-09-14T12:00:00Z", "componentId": "n-gw", "componentName": "API Gateway",
			}),
			CreatedAt: runbookUpdated, UpdatedAt: runbookUpdated,
		},
		{
			ID: "rb-database", ProjectID: ProjectID, Title: "Database failover", Kind: "doc", DocType: "runbook",
			Body: "## Objective\n\nReview a failover sequence for the primary database.\n\n## Prerequisites\n\n- Verify the standby is healthy\n- Pause local writes\n\n## Steps\n\n1. Review replication state\n2. Promote the standby\n3. Validate application health\n\n## Commands\n\n```bash\npg_isready\npsql -c 'select now();'\n```\n\n## Rollback\n\nRestore the previous primary reference if validation fails.",
			Tags: []string{"database", "failover"}, Summary: "Review a failover sequence for the primary database.",
			Owner: "Platform", Status: "published", ExtraJSON: mustJSON(map[string]any{
				"service": "Database", "severity": "critical",
				"prerequisites": []string{"Verify the standby is healthy", "Pause local writes"},
				"steps":         []string{"Review replication state", "Promote the standby", "Validate application health"},
				"commands":      []string{"pg_isready", "psql -c 'select now();'"},
				"rollback":      "Restore the previous primary reference if validation fails.",
				"lastValidated": "2026-09-06T12:00:00Z", "componentId": "n-pg", "componentName": "PostgreSQL",
			}),
			CreatedAt: runbookUpdated.Add(-8 * 24 * time.Hour), UpdatedAt: runbookUpdated.Add(-8 * 24 * time.Hour),
		},
		{
			ID: "decision-sqlite-local", ProjectID: ProjectID, Title: "Decision 0001: Local SQLite authority", Kind: "decision",
			Body: "## Status\n\nAccepted\n\n## Context\n\nThe desktop needs durable local project state without a hosted account directory.\n\n## Decision\n\nPersist project truth in a local SQLite database owned by polterware-core.\n\n## Consequences\n\n- Desktop remains useful offline.\n- Cloud sync is optional later and must not replace local ownership.",
			Tags: []string{"storage"}, Summary: "Keep local SQLite as the desktop authority for project data.",
			Owner: "Platform", Status: "active", ExtraJSON: mustJSON(map[string]any{
				"decisionStatus": "active",
			}),
			CreatedAt: docsUpdated.Add(-48 * time.Hour), UpdatedAt: docsUpdated.Add(-48 * time.Hour),
		},
		{
			ID: "decision-deterministic-import", ProjectID: ProjectID, Title: "Decision 0002: Deterministic import", Kind: "decision",
			Body: "## Status\n\nAccepted\n\n## Context\n\nFacts imported from the repository must be reproducible and explainable.\n\n## Decision\n\nImport only a fixed set of project files and Git metadata, without network calls or model inference.\n\n## Consequences\n\n- The same checkout always yields the same facts.\n- Anything outside the MVP file set needs an explicit source.",
			Tags: []string{"import"}, Summary: "Import facts from a fixed file set with no inference.",
			Owner: "Platform", Status: "active", ExtraJSON: mustJSON(map[string]any{
				"decisionStatus": "active",
			}),
			CreatedAt: docsUpdated.Add(-36 * time.Hour), UpdatedAt: docsUpdated.Add(-36 * time.Hour),
		},
		{
			ID: "decision-bounded-context", ProjectID: ProjectID, Title: "Decision 0003: Bounded agent context", Kind: "decision",
			Body: "## Status\n\nProposed\n\n## Context\n\nAgents lose accuracy when handed the whole project at once.\n\n## Decision\n\nCompile context per session with a token budget, active invariants first.\n\n## Consequences\n\n- Sessions start faster and cheaper.\n- Budget tuning needs measurement on large projects.",
			Tags: []string{"agents"}, Summary: "Give agents a budgeted context instead of the whole project.",
			Owner: "Agents", Status: "proposed", ExtraJSON: mustJSON(map[string]any{
				"decisionStatus": "proposed",
			}),
			CreatedAt: docsUpdated.Add(-12 * time.Hour), UpdatedAt: docsUpdated.Add(-12 * time.Hour),
		},
		sourceItem("src-readme", "README", "README.md", "Project overview and setup.", docsUpdated),
		sourceItem("src-agents", "Agent instructions", "AGENTS.md", "Rules agents follow in this repository.", docsUpdated),
		sourceItem("src-package", "package.json", "package.json", "Workspace scripts and dependencies.", docsUpdated),
		sourceItem("src-gomod", "go.mod", "go.mod", "Go module and dependencies.", docsUpdated),
		principleItem("decision-principle-local-first", "Local-first truth", "Project state must stay useful on one machine.", "Project state must remain useful on one machine without requiring a hosted account.", docsUpdated.Add(-48*time.Hour)),
		principleItem("decision-principle-honest-boundaries", "Honest product boundaries", "Never describe planned work as shipped.", "Do not describe planned capabilities as shipped.", docsUpdated.Add(-48*time.Hour)),
		principleItem("decision-principle-provenance", "Provenance over inference", "Observed facts win over inferred ones.", "Declared and observed facts take precedence over inferred knowledge.", docsUpdated.Add(-48*time.Hour)),
	}
	for _, item := range items {
		if err := store.SaveKnowledge(item); err != nil {
			return err
		}
	}
	return nil
}

func seedKnowledgeLinks(store *storepkg.Store) error {
	type linkSpec struct {
		knowledgeID string
		refKind     string
		refID       string
		predicate   string
	}
	// Links to environment entities (which are synced by SyncProjectModel)
	specs := []linkSpec{
		{knowledgeID: "doc-database", refKind: canon.RefEnvironment, refID: EnvProductionID, predicate: canon.PredDocuments},
		{knowledgeID: "rb-service", refKind: canon.RefEnvironment, refID: EnvProductionID, predicate: canon.PredOperates},
		{knowledgeID: "rb-database", refKind: canon.RefEnvironment, refID: EnvProductionID, predicate: canon.PredOperates},
		{knowledgeID: "decision-sqlite-local", refKind: canon.RefEnvironment, refID: EnvProductionID, predicate: canon.PredRelatedTo},
	}
	for _, spec := range specs {
		entity, err := store.GetCanonEntityByRef(ProjectID, spec.refKind, spec.refID)
		if err != nil {
			continue
		}
		link, err := knowledge.NewEntityLink(ProjectID, spec.knowledgeID, entity.ID, spec.predicate, canon.TruthDeclared, "seed", "system")
		if err != nil {
			return err
		}
		if err := store.SaveKnowledgeLink(link); err != nil {
			return err
		}
	}
	return nil
}

func mustJSON(value any) string {
	body, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}
	return string(body)
}

// sourceItem is a registered project-relative source, shaped like the items
// ImportProjectSources writes.
func sourceItem(id, title, path, summary string, at time.Time) knowledge.Item {
	return knowledge.Item{
		ID: id, ProjectID: ProjectID, Title: title, Kind: "doc", DocType: "source",
		Tags: []string{}, Summary: summary, ExtraJSON: mustJSON(map[string]string{"path": path}),
		CreatedAt: at, UpdatedAt: at,
	}
}

func principleItem(id, title, summary, body string, at time.Time) knowledge.Item {
	return knowledge.Item{
		ID: id, ProjectID: ProjectID, Title: title, Kind: "decision",
		Body:    "## Decision\n\n" + body,
		Summary: summary, Owner: "Platform", Status: "active",
		ExtraJSON: mustJSON(map[string]string{"level": "principle"}),
		CreatedAt: at.Add(-48 * time.Hour), UpdatedAt: at,
	}
}
