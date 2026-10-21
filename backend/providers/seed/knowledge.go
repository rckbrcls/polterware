package seed

import (
	"encoding/json"
	"time"

	"github.com/polterware/polterware/backend/domains/knowledge"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// principles apply to the whole project. They are pinned Decisions, not a separate document.
var principles = []struct{ id, title, summary, body string }{
	{"verdict-principle-local-first", "Local-first truth", "Project state must stay useful on one machine.", "Project state must remain useful on one machine without requiring a hosted account."},
	{"verdict-principle-honest-boundaries", "Honest product boundaries", "Never describe planned work as shipped.", "Do not describe planned capabilities as shipped. Post-wedge depth (Change Gates, Web App, Cloud) is direction, not behavior."},
	{"verdict-principle-provenance", "Provenance over inference", "Observed facts win over inferred ones.", "Declared and observed facts take precedence over inferred knowledge. Inference never silently becomes project truth."},
	{"verdict-principle-one-authority", "One authority per database", "Only the local core opens SQLite.", "Only the local core opens SQLite; every other surface is a client."},
	{"verdict-principle-shared-interface", "Opaque, shared interface", "Product UI uses the shared design system.", "Product UI uses the shared design system: opaque surfaces, token colors and radii, one icon set."},
}

// docs are the repository documents that define Polterware. The store holds a
// pointer and a summary; the file stays the source.
var docs = []struct{ id, title, path, summary string }{
	{"doc-future", "Future work", "docs/future.md", "Planned direction that is not implemented: Cloud, Jev, enrichment, research."},
	{"doc-design", "Desktop design", "DESIGN.md", "The visual and interaction contract for the Desktop."},
}

func seedKnowledge(store *storepkg.Store) error {
	at := time.Now().UTC()
	var items []knowledge.Item
	for _, principle := range principles {
		items = append(items, knowledge.Item{
			ID: principle.id, ProjectID: ProjectID, Title: principle.title, Kind: "verdict",
			Body:    "## Decision\n\n" + principle.body,
			Summary: principle.summary, Tags: []string{"principle"}, Owner: "Platform", Status: "active",
			ExtraJSON: mustJSON(map[string]string{"scope": "principle"}), CreatedAt: at, UpdatedAt: at,
		})
	}
	for _, doc := range docs {
		items = append(items, knowledge.Item{
			ID: doc.id, ProjectID: ProjectID, Title: doc.title, Kind: "evidence",
			Body:    doc.summary + "\n\nSource: " + doc.path,
			Summary: doc.summary, Tags: []string{"doc", "polterware"}, Owner: "Platform", Status: "published",
			ExtraJSON: mustJSON(map[string]string{"path": doc.path}), CreatedAt: at, UpdatedAt: at,
		})
	}
	for _, item := range items {
		if err := store.SaveKnowledge(item); err != nil {
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
