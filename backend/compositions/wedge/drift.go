package wedge

import (
	"fmt"
	"time"

	"github.com/polterware/polterware/backend/domains/agentrun"
	"github.com/polterware/polterware/backend/domains/drift"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// DriftInput runs the narrow drift checker (B5).
type DriftInput struct {
	ProjectID  string
	EntityID   string
	AgentRunID string
}

// CheckDrift assembles the store and Git input, runs drift.Check, and optionally appends an AgentRun drift step.
func CheckDrift(store *storepkg.Store, in DriftInput) (drift.Result, error) {
	if in.ProjectID == "" {
		return drift.Result{}, fmt.Errorf("project_id is required")
	}
	input, err := assembleDriftInput(store, in.ProjectID, in.EntityID)
	if err != nil {
		return drift.Result{}, err
	}
	result := drift.Check(input)
	if in.AgentRunID != "" {
		now := time.Now().UTC()
		if err := store.AppendAgentRunStepIfOpen(in.AgentRunID, func(run agentrun.Run) (agentrun.Step, error) {
			return agentrun.NewDriftStep(run.ID, result, now)
		}); err != nil {
			return drift.Result{}, err
		}
	}
	return result, nil
}

// DriftFindings runs the checker without syncing the project model or
// recording a step, so reading it writes nothing. The Inbox uses it: a write
// here would emit a change event and reload the Inbox again.
func DriftFindings(store *storepkg.Store, projectID string) ([]drift.Finding, error) {
	input, err := assembleDriftInput(store, projectID, "")
	if err != nil {
		return nil, err
	}
	return drift.Check(input).Findings, nil
}

// assembleDriftInput reads the store and the checkouts' Git history. It never writes.
func assembleDriftInput(store *storepkg.Store, projectID, entityID string) (drift.Input, error) {
	project, err := store.GetProject(projectID)
	if err != nil {
		return drift.Input{}, fmt.Errorf("unknown project")
	}
	input := drift.Input{ProjectID: projectID, EntityID: entityID}
	ready, doneTasks, taskLinks, window, err := assembleCommitDrift(store, projectID, ExpandRootPath(project.RootPath))
	if err != nil {
		return drift.Input{}, err
	}
	input.GitDeliveryReady = ready
	input.DoneTasks = doneTasks
	input.TaskCommits = taskLinks
	input.WindowCommits = window
	return input, nil
}
