package sqlite_test

import (
	"testing"
	"time"

	"github.com/polterware/polterware/backend/domains/projects"
	"github.com/polterware/polterware/backend/domains/work"
)

func TestMilestoneStoreArchiveMovesCardsToBacklog(t *testing.T) {
	store := newStore(t)
	now := time.Now().UTC()
	if err := store.SaveProject(projects.Project{ID: "proj", Name: "proj", RootPath: "/proj", CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatal(err)
	}
	beta, err := store.CreateMilestone("proj", "", "batch-1", work.Milestone{Slug: "beta", Name: "Beta", State: work.MilestoneActive, ExitCriteria: []string{"ships"}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.ApplyWorkOps("proj", "", "batch-2", []work.Op{
		{Kind: work.OpCreate, Entity: work.EntityCard, EntityID: "card-a", CardID: "card-a", CardSlug: "a",
			Fields: map[string]any{"slug": "a", "title": "A", "stage": work.StageBuild, "status": work.CardActive, "milestone": beta.ID}},
		{Kind: work.OpCreate, Entity: work.EntityCard, EntityID: "card-b", CardID: "card-b", CardSlug: "b",
			Fields: map[string]any{"slug": "b", "title": "B", "stage": work.StageShape, "status": work.CardActive, "milestone": ""}},
	}); err != nil {
		t.Fatal(err)
	}
	snapshot, err := store.LoadWorkSnapshot("proj")
	if err != nil {
		t.Fatal(err)
	}
	if got := cardMilestones(snapshot); got["a"] != "beta" || got["b"] != "" {
		t.Fatalf("milestones before archive = %v", got)
	}

	archived, err := store.SetMilestoneArchived("proj", "", "batch-3", beta.ID, true)
	if err != nil || archived.ArchivedAt == "" {
		t.Fatalf("archive = %+v, %v", archived, err)
	}
	snapshot, err = store.LoadWorkSnapshot("proj")
	if err != nil {
		t.Fatal(err)
	}
	if got := cardMilestones(snapshot); got["a"] != "" || got["b"] != "" {
		t.Fatalf("an archived milestone keeps no cards: %v", got)
	}
	var ops int
	if err := store.DB.QueryRow(`SELECT COUNT(*) FROM change_ops WHERE batch_id='batch-3' AND entity='card' AND entity_id='card-a' AND data_json='{"milestone":""}'`).Scan(&ops); err != nil || ops != 1 {
		t.Fatalf("card move ops = %d, %v", ops, err)
	}

	restored, err := store.SetMilestoneArchived("proj", "", "batch-4", beta.ID, false)
	if err != nil || restored.ArchivedAt != "" {
		t.Fatalf("restore = %+v, %v", restored, err)
	}
	if _, err := store.SetMilestoneArchived("proj", "", "batch-5", "missing", true); err != work.ErrMilestoneNotFound {
		t.Fatalf("missing milestone err = %v", err)
	}
}

func cardMilestones(snapshot work.Snapshot) map[string]string {
	out := map[string]string{}
	for _, card := range snapshot.Cards {
		out[card.Slug] = card.Milestone
	}
	return out
}
