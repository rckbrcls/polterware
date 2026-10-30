package wedge_test

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/polter"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

const claimRoadmap = `---
polter: 1
summary: Add claim cards
rationale: Exercise slice 6
---

## git-import: Git import
stage: build

- [ ] T1 Evidence upsert ` + "`backend/import/*`" + `
- [ ] T2 Docs ` + "`docs/*`" + `

## canon-core: Canon core
stage: build

- [ ] T1 Core ` + "`backend/*`" + `
`

func claimText(t *testing.T, action, ref, holder string) string {
	t.Helper()
	parsed, err := polter.ParseTaskRef(ref)
	if err != nil {
		t.Fatal(err)
	}
	text, err := polter.CoordText(action, parsed, holder)
	if err != nil {
		t.Fatal(err)
	}
	return text
}

func TestClaimEndToEnd(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "work.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	project, err := wedge.InitProject(store, wedge.InitInput{Name: "Demo"})
	if err != nil {
		t.Fatal(err)
	}
	apply := func(text, agent string) (wedge.ApplyResult, error) {
		return wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, Text: text, AutoStartLabel: "cli", Agent: agent})
	}
	if _, err := apply(claimRoadmap, ""); err != nil {
		t.Fatal(err)
	}

	claimed, err := apply(claimText(t, polter.CoordClaim, "git-import#T1", "codex"), "codex")
	if err != nil || !claimed.Applied || len(claimed.Ops) != 1 {
		t.Fatalf("claim: err=%v result=%+v", err, claimed)
	}
	var entity string
	if err := store.DB.QueryRow(`SELECT entity FROM change_ops WHERE batch_id=?`, claimed.BatchID).Scan(&entity); err != nil || entity != "claim" {
		t.Fatalf("change_ops entity = %q err=%v", entity, err)
	}

	// backend/* on another card overlaps codex's backend/import/*.
	refused, err := apply(claimText(t, polter.CoordClaim, "canon-core T1", "claude"), "claude")
	if !errors.Is(err, wedge.ErrPolterInvalid) || !strings.Contains(refused.Diagnostics[0].Message, "git-import T1 held by codex") {
		t.Fatalf("overlap: err=%v diags=%+v", err, refused.Diagnostics)
	}
	// docs/* does not overlap.
	if _, err := apply(claimText(t, polter.CoordClaim, "git-import#T2", "claude"), "claude"); err != nil {
		t.Fatalf("disjoint claim: %v", err)
	}

	snapshot, err := store.LoadWorkSnapshot(project.ID)
	if err != nil {
		t.Fatal(err)
	}
	card, _ := snapshot.Card("git-import")
	if card.Tasks[0].Claim == nil || card.Tasks[0].Claim.Holder != "codex" || card.Tasks[0].Claim.Scope != "backend/import/*" {
		t.Fatalf("stored claim = %+v", card.Tasks[0].Claim)
	}
	if encoded := polter.EncodeCard(card); strings.Contains(encoded, "claim:") {
		t.Fatalf("card read should not return claims:\n%s", encoded)
	}
	claims := polter.EncodeStatusClaims("git-import", snapshot)
	if !strings.Contains(claims, "claim: T1 codex (backend/import/*)") || !strings.Contains(claims, "claim: T2 claude (docs/*)") {
		t.Fatalf("status claims = %q", claims)
	}

	// Done by the holder marks the task done and frees the scope.
	if _, err := apply(claimText(t, polter.CoordDone, "git-import#T1", "codex"), "codex"); err != nil {
		t.Fatalf("done: %v", err)
	}
	if _, err := apply(claimText(t, polter.CoordClaim, "canon-core#T1", "claude"), "claude"); err != nil {
		t.Fatalf("claim after done: %v", err)
	}
	// Release by the holder; a second release is a no-op.
	if _, err := apply(claimText(t, polter.CoordRelease, "git-import#T2", "claude"), "claude"); err != nil {
		t.Fatalf("release: %v", err)
	}
	again, err := apply(claimText(t, polter.CoordRelease, "git-import#T2", "claude"), "claude")
	if err != nil || again.Applied {
		t.Fatalf("second release should be a no-op: err=%v result=%+v", err, again)
	}
	var rows int
	if err := store.DB.QueryRow(`SELECT COUNT(1) FROM work_claims WHERE project_id=?`, project.ID).Scan(&rows); err != nil || rows != 1 {
		t.Fatalf("work_claims rows = %d err=%v", rows, err)
	}
}
