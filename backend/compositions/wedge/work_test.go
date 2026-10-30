package wedge_test

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/compositions/wedge"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

const roadmap = `---
polter: 1
summary: Add git import card
rationale: Plan slice 5
---

## git-metadata-import: Git metadata import
stage: plan

Import HEAD, branch and recent commits as evidence.

- [ ] Commit evidence upsert
- [ ] Stamp revision on observed facts
? Include merge commits? [blocking] (yes | no)
`

func TestApplyPolterEndToEnd(t *testing.T) {
	root := t.TempDir()
	store, err := storepkg.New(filepath.Join(t.TempDir(), "work.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	project, err := initWithRepo(store, "Demo", root)
	if err != nil {
		t.Fatal(err)
	}

	resolved, err := wedge.ResolveProject(store, "", filepath.Join(root, "sub"))
	if err != nil || resolved.ID != project.ID {
		t.Fatalf("resolve from nested dir: %v %+v", err, resolved)
	}

	dry, err := wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, Text: roadmap, DryRun: true})
	if err != nil || dry.Applied || len(dry.Ops) != 4 {
		t.Fatalf("dry run: err=%v applied=%v ops=%d", err, dry.Applied, len(dry.Ops))
	}

	result, err := wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, Text: roadmap, AutoStartLabel: "cli"})
	if err != nil || !result.Applied || result.AgentRunID == "" {
		t.Fatalf("apply: err=%v result=%+v", err, result)
	}
	record, err := store.GetAgentRunRecord(result.AgentRunID)
	if err != nil {
		t.Fatal(err)
	}
	if record.Run.AgentLabel != "cli" || record.Run.Status != "completed" || len(record.Steps) != 1 {
		t.Fatalf("run = %+v steps=%d", record.Run, len(record.Steps))
	}
	if !strings.Contains(record.Steps[0].PayloadJSON, result.BatchID) {
		t.Fatalf("change step should carry batch id: %s", record.Steps[0].PayloadJSON)
	}
	var opRows int
	if err := store.DB.QueryRow(`SELECT COUNT(1) FROM change_ops WHERE batch_id=?`, result.BatchID).Scan(&opRows); err != nil || opRows != 4 {
		t.Fatalf("change_ops rows = %d err=%v", opRows, err)
	}

	again, err := wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, Text: roadmap, AutoStartLabel: "cli"})
	if err != nil || again.Applied || len(again.Ops) != 0 {
		t.Fatalf("re-apply should be a no-op: err=%v ops=%d", err, len(again.Ops))
	}

	list, err := wedge.QueryPolter(store, project.ID, "cards")
	if err != nil || !strings.Contains(list, "git-metadata-import  plan  0/2 tasks  1 open?") {
		t.Fatalf("list = %q err=%v", list, err)
	}
	card, err := wedge.QueryPolter(store, project.ID, "card git-metadata-import")
	if err != nil || !strings.Contains(card, "- [ ] T2 Stamp revision on observed facts") {
		t.Fatalf("card = %q err=%v", card, err)
	}
}

func TestApplyPolterRejectsInvalidText(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "work.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	project, err := wedge.InitProject(store, wedge.InitInput{Name: "Demo"})
	if err != nil {
		t.Fatal(err)
	}
	result, err := wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, Text: "## a: A\n", AutoStartLabel: "cli"})
	if !errors.Is(err, wedge.ErrPolterInvalid) || len(result.Diagnostics) == 0 {
		t.Fatalf("err=%v diags=%+v", err, result.Diagnostics)
	}
	missing := strings.Replace(roadmap, "summary: Add git import card\nrationale: Plan slice 5\n", "", 1)
	if _, err := wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, Text: missing, AutoStartLabel: "cli"}); err == nil {
		t.Fatal("apply without summary/rationale should fail")
	}
}
