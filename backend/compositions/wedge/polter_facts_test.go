package wedge_test

import (
	"errors"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/agentrun"
	"github.com/polterware/polterware/backend/domains/polter"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestPolterFactApplyRoundTripAndAudit(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "facts.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	project, err := wedge.InitProject(store, wedge.InitInput{Name: "Facts"})
	if err != nil {
		t.Fatal(err)
	}
	header := "---\npolter: 1\nsummary: Promote canvas item\nrationale: promoted from canvas Sketch\n---\n"
	text := header + "# core: Core\nlevel: domain\n#### local-core: One local core owns SQLite.\nkind: declared\nscope: core\n"
	apply := func(text string, dry bool) (wedge.ApplyResult, error) {
		return wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, Text: text, DryRun: dry, AutoStartLabel: "codex", Agent: "codex"})
	}
	dry, err := apply(text, true)
	if err != nil || dry.Applied || len(dry.Ops) != 2 {
		t.Fatalf("dry: %+v %v", dry, err)
	}
	facts, err := store.ListCanonFacts(project.ID, "")
	if err != nil || len(facts) != 0 {
		t.Fatalf("dry wrote: %+v %v", facts, err)
	}
	result, err := apply(text, false)
	if err != nil || !result.Applied {
		t.Fatalf("apply: %+v %v", result, err)
	}
	id := result.Ops[1].EntityID
	fact, err := store.GetCanonFact(id)
	if err != nil || fact.Statement != "One local core owns SQLite." || fact.TruthClass != "declared" || fact.Actor != "codex" {
		t.Fatalf("fact: %+v %v", fact, err)
	}
	snapshot, err := store.LoadWorkSnapshot(project.ID)
	if err != nil || snapshot.Facts[0].Slug != "local-core" || !slices.Equal(snapshot.Facts[0].Scopes, []string{"core"}) {
		t.Fatalf("snapshot: %+v %v", snapshot, err)
	}
	var op, batch, actor string
	err = store.DB.QueryRow(`SELECT op,batch_id,agent_run_id FROM change_ops WHERE entity='fact' AND entity_id=?`, id).Scan(&op, &batch, &actor)
	if err != nil || op != "create" || batch != result.BatchID || actor != result.AgentRunID {
		t.Fatalf("audit: %s %s %s %v", op, batch, actor, err)
	}
	record, err := store.GetAgentRunRecord(result.AgentRunID)
	if err != nil || len(record.Steps) != 1 || record.Steps[0].Kind != agentrun.KindChange || !strings.Contains(record.Steps[0].PayloadJSON, result.BatchID) {
		t.Fatalf("audited run: %+v %v", record, err)
	}
	again, err := apply(text, false)
	if err != nil || again.Applied || len(again.Ops) != 0 {
		t.Fatalf("idempotence: %+v %v", again, err)
	}
	for _, ref := range []string{"local-core", id} {
		updated, err := apply(header+"#### "+ref+": Updated "+ref+"\nkind: inferred\n", false)
		if err != nil || !updated.Applied || len(updated.Ops) != 1 || updated.Ops[0].EntityID != id {
			t.Fatalf("update: %+v %v", updated, err)
		}
	}
	cleared, err := apply(header+"#### "+id+"\nkind: verified\nscope:\n", false)
	if err != nil || !cleared.Applied {
		t.Fatalf("clear: %+v %v", cleared, err)
	}
	fact, err = store.GetCanonFact(id)
	if err != nil || fact.TruthClass != "verified" {
		t.Fatalf("verified: %+v %v", fact, err)
	}
	scope, err := store.ScopeMap(project.ID, storepkg.ScopeFact)
	if err != nil || len(scope[id]) != 0 {
		t.Fatalf("clear scope: %+v %v", scope, err)
	}
	// One invalid block rejects the whole document.
	bad := header + "#### another: Another fact\n#### bad: Rejected\nkind: invalid\n"
	rejected, err := apply(bad, false)
	if !errors.Is(err, wedge.ErrPolterInvalid) || !polter.HasErrors(rejected.Diagnostics) {
		t.Fatalf("reject: %+v %v", rejected, err)
	}
	facts, err = store.ListCanonFacts(project.ID, "")
	if err != nil || len(facts) != 1 {
		t.Fatalf("partial apply: %+v %v", facts, err)
	}
}
