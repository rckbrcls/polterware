package wedge_test

import (
	"path/filepath"
	"testing"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/agentrun"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestApplyInSessionReusesOneRun(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "session.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	project, err := wedge.InitProject(store, wedge.InitInput{Name: "Demo"})
	if err != nil {
		t.Fatal(err)
	}
	session := &wedge.SessionRuns{Label: "claude-code"}

	unjustified := "---\npolter: 1\n---\n\n## draft: Draft\n"
	if _, err := wedge.ApplyInSession(store, session, wedge.ApplyInput{ProjectID: project.ID, Text: unjustified}); err == nil {
		t.Fatal("expected missing summary error")
	}
	if len(session.Runs) != 0 {
		t.Fatalf("unjustified write opened a run: %v", session.Runs)
	}

	first, err := wedge.ApplyInSession(store, session, wedge.ApplyInput{ProjectID: project.ID, Text: roadmap})
	if err != nil || !first.Applied {
		t.Fatalf("first apply: %v %+v", err, first)
	}
	move := "---\npolter: 1\nsummary: Start build\nrationale: Plan approved\n---\n\n## git-metadata-import\nstage: build\n"
	second, err := wedge.ApplyInSession(store, session, wedge.ApplyInput{ProjectID: project.ID, Text: move})
	if err != nil || second.AgentRunID != first.AgentRunID {
		t.Fatalf("second apply should reuse run %s: %v %+v", first.AgentRunID, err, second)
	}

	session.Close(store)
	run, err := store.GetAgentRun(first.AgentRunID)
	if err != nil || run.Status != agentrun.StatusCompleted || run.AgentLabel != "claude-code" {
		t.Fatalf("session run after close: %v %+v", err, run)
	}

	third, err := wedge.ApplyInSession(store, session, wedge.ApplyInput{ProjectID: project.ID, Text: roadmap + "- [ ] Backfill old commits\n"})
	if err != nil || third.AgentRunID == first.AgentRunID {
		t.Fatalf("apply after close should open a new run: %v %+v", err, third)
	}
}
