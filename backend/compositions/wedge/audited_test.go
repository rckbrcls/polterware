package wedge_test

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/agentrun"
	"github.com/polterware/polterware/backend/domains/knowledge"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestExecuteAuditedWriteHumanAutoRun(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "README.md"), []byte("# Demo\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	store, err := storepkg.New(filepath.Join(t.TempDir(), "audited.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	project, err := wedge.InitProject(store, wedge.InitInput{Name: "Demo", RootPath: root})
	if err != nil {
		t.Fatal(err)
	}

	result, err := wedge.ExecuteAuditedWrite(
		store,
		wedge.ChangeEnvelope{
			Summary:   "Create principle",
			Rationale: "Project needs governing principles",
			ProjectID: project.ID,
		},
		agentrun.ActorKindHuman,
		"desktop.knowledge.save",
		func(run agentrun.Run) ([]string, any, error) {
			item, err := knowledge.NewItem("kn-1", project.ID, "Local-first truth", "# Rules", "decision", nil)
			if err != nil {
				return nil, nil, err
			}
			item.Owner = agentrun.ActorHuman
			if err := store.SaveKnowledge(item); err != nil {
				return nil, nil, err
			}
			return []string{item.ID}, item, nil
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if result.AgentRunID == "" {
		t.Fatal("expected auto-created agent run id")
	}
	record, err := store.GetAgentRunRecord(result.AgentRunID)
	if err != nil {
		t.Fatal(err)
	}
	if record.Run.ActorKind != agentrun.ActorKindHuman {
		t.Fatalf("actor kind: %s", record.Run.ActorKind)
	}
	if record.Run.Status != agentrun.StatusCompleted {
		t.Fatalf("status: %s", record.Run.Status)
	}
	if len(record.Steps) != 1 || record.Steps[0].Kind != agentrun.KindChange {
		t.Fatalf("steps: %+v", record.Steps)
	}

	changes, err := store.ListChanges(project.ID, agentrun.ActorKindHuman, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(changes) != 1 || changes[0].Summary != "Create principle" {
		t.Fatalf("changes: %+v", changes)
	}
}

func TestListChangesHidesWorkspaceLayoutWrites(t *testing.T) {
	root := t.TempDir()
	store, err := storepkg.New(filepath.Join(t.TempDir(), "history.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	project, err := wedge.InitProject(store, wedge.InitInput{Name: "Demo", RootPath: root})
	if err != nil {
		t.Fatal(err)
	}
	for _, tool := range []string{"desktop.canvas.update", "desktop.work.milestone.archive", "desktop.knowledge.save"} {
		if _, err := wedge.ExecuteAuditedWrite(
			store,
			wedge.ChangeEnvelope{Summary: tool, Rationale: "test", ProjectID: project.ID},
			agentrun.ActorKindHuman,
			tool,
			func(run agentrun.Run) ([]string, any, error) { return nil, nil, nil },
		); err != nil {
			t.Fatal(err)
		}
	}

	changes, err := store.ListAllChanges(project.ID, "")
	if err != nil {
		t.Fatal(err)
	}
	// Milestone changes move cards, so they stay in the history.
	if len(changes) != 2 || changes[0].Summary == "desktop.canvas.update" || changes[1].Summary == "desktop.canvas.update" {
		t.Fatalf("changes: %+v", changes)
	}
}

func TestExecuteAuditedWriteAgentRequiresRunID(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "audited-agent.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	_, err = wedge.ExecuteAuditedWrite(
		store,
		wedge.ChangeEnvelope{
			Summary:   "x",
			Rationale: "y",
			ProjectID: "p",
		},
		agentrun.ActorKindAgent,
		"fact.upsert",
		func(run agentrun.Run) ([]string, any, error) {
			return nil, nil, nil
		},
	)
	if !errors.Is(err, agentrun.ErrMissingAgentRunID) {
		t.Fatalf("expected ErrMissingAgentRunID, got %v", err)
	}
}
