package wedge

import (
	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// StructureRows derives status for the project's nodes from their cards.
func StructureRows(store *storepkg.Store, snapshot work.Snapshot) []structure.Row {
	return structureRows(store, snapshot)
}

func structureRows(_ *storepkg.Store, snapshot work.Snapshot) []structure.Row {
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
			OpenQuestions: open,
		})
	}
	return structure.Decorate(snapshot.Nodes, features)
}
