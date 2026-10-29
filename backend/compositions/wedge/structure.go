package wedge

import (
	"github.com/polterware/polterware/backend/domains/drift"
	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// StructureRows derives status for the project's nodes. A drift read that fails
// leaves every node without the drift mark rather than failing the read.
func StructureRows(store *storepkg.Store, snapshot work.Snapshot) []structure.Row {
	return structureRows(store, snapshot)
}

func structureRows(store *storepkg.Store, snapshot work.Snapshot) []structure.Row {
	driftSlugs := map[string]bool{}
	if findings, err := DriftFindings(store, snapshot.ProjectID); err == nil {
		for _, finding := range findings {
			if finding.Severity != drift.SeverityWarning && finding.Severity != drift.SeverityConflict {
				continue
			}
			if slug := finding.Details["slug"]; slug != "" {
				driftSlugs[slug] = true
			}
		}
	}
	features := make([]structure.Feature, 0, len(snapshot.Cards))
	for _, card := range snapshot.Cards {
		if card.Status != work.CardActive {
			continue
		}
		open := 0
		for _, question := range card.Questions {
			if question.State == work.QuestionOpen {
				open++
			}
		}
		features = append(features, structure.Feature{
			Slug: card.Slug, Title: card.Title, Under: card.Under, Stage: card.Stage,
			OpenQuestions: open, Drift: driftSlugs[card.Slug],
		})
	}
	return structure.Decorate(snapshot.Nodes, features)
}

// DriftSlugs returns card slugs named by a warning or conflict finding.
func DriftSlugs(store *storepkg.Store, projectID string) []string {
	findings, err := DriftFindings(store, projectID)
	if err != nil {
		return nil
	}
	var slugs []string
	seen := map[string]bool{}
	for _, finding := range findings {
		if finding.Severity != drift.SeverityWarning && finding.Severity != drift.SeverityConflict {
			continue
		}
		slug := finding.Details["slug"]
		if slug == "" || seen[slug] {
			continue
		}
		seen[slug] = true
		slugs = append(slugs, slug)
	}
	return slugs
}
