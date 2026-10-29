package wedge_test

import (
	"errors"
	"path/filepath"
	"testing"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/agentrun"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// A person may leave the reason out of a write; an agent may not.
func TestApplyPolterNeedsAReasonOnlyFromAgents(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "work.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	project, err := wedge.InitProject(store, wedge.InitInput{Name: "Demo", RootPath: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	text := "---\npolter: 1\n---\n\n## login: Sign people in\nstage: shape\n"

	_, err = wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, Text: text, Summary: "Create card: login", AutoStartLabel: "cli"})
	if !errors.Is(err, agentrun.ErrChangeIncomplete) {
		t.Fatalf("agent write without a reason: %v", err)
	}
	result, err := wedge.ApplyPolter(store, wedge.ApplyInput{
		ProjectID: project.ID, Text: text, Summary: "Create card: login",
		ActorKind: agentrun.ActorKindHuman, Tool: "desktop.work.apply",
	})
	if err != nil || !result.Applied {
		t.Fatalf("person's write without a reason: applied=%v err=%v", result.Applied, err)
	}
	_, err = wedge.ApplyPolter(store, wedge.ApplyInput{
		ProjectID: project.ID, Text: "---\npolter: 1\n---\n\n## login\nstage: plan\n",
		ActorKind: agentrun.ActorKindHuman, Tool: "desktop.work.apply",
	})
	if !errors.Is(err, agentrun.ErrChangeIncomplete) {
		t.Fatalf("a person's write still needs a summary: %v", err)
	}
}
