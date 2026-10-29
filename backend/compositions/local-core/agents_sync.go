package localcore

import (
	"context"
	"fmt"
	"io"
	"slices"
	"time"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/platform/events"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

// agentsSyncKinds are the change kinds that can change an AGENTS.md block:
// Structure, Decisions, invariants, checkouts, and the sync setting itself.
var agentsSyncKinds = []string{events.KindWork, events.KindKnowledge, events.KindSettings, events.KindProjects}

// SetAgentsSync turns AGENTS.md sync on or off for a project. Turning it on
// writes the blocks at once, so the caller sees what changed.
func (core *Core) SetAgentsSync(_ context.Context, request *connect.Request[localv1.SetAgentsSyncRequest]) (*connect.Response[localv1.SetAgentsSyncResponse], error) {
	projectID := request.Msg.GetProjectId()
	if projectID == "" {
		return nil, invalid("project id is required")
	}
	if _, err := core.Store.GetProject(projectID); err != nil {
		return nil, invalid(fmt.Sprintf("unknown project %q", projectID))
	}
	enabled := request.Msg.GetEnabled()
	if err := core.Store.SetAgentsSync(projectID, enabled); err != nil {
		return nil, internal(err)
	}
	response := &localv1.SetAgentsSyncResponse{Enabled: enabled}
	if enabled {
		files, err := wedge.SyncAgentsBlocks(core.Store, projectID)
		if err != nil {
			return nil, internal(err)
		}
		response.Files = projectionFilesProto(files)
	}
	return connect.NewResponse(response), nil
}

// RunAgentsSync rewrites the AGENTS.md blocks of the projects with sync on
// delay after a change that can affect them, until stop closes. Changes that
// arrive in the meantime join the same pass. Writing files never touches the
// store, so a pass does not start another. Failures go to errOut.
func (core *Core) RunAgentsSync(stop <-chan struct{}, delay time.Duration, errOut io.Writer) {
	_, _, _, changes, cancel := core.Bus.Subscribe(0)
	defer cancel()
	pending := map[string]bool{}
	everyProject := false
	var fire <-chan time.Time
	for {
		select {
		case <-stop:
			return
		case change := <-changes:
			if !change.Resync && !slices.ContainsFunc(change.Kinds, func(kind string) bool { return slices.Contains(agentsSyncKinds, kind) }) {
				continue
			}
			if change.Resync || len(change.ProjectIDs) == 0 {
				everyProject = true
			}
			for _, id := range change.ProjectIDs {
				pending[id] = true
			}
			if fire == nil {
				fire = time.After(delay)
			}
		case <-fire:
			fire = nil
			core.syncAgents(pending, everyProject, errOut)
			pending, everyProject = map[string]bool{}, false
		}
	}
}

func (core *Core) syncAgents(pending map[string]bool, everyProject bool, errOut io.Writer) {
	ids, err := core.Store.AgentsSyncProjects()
	if err != nil {
		fmt.Fprintf(errOut, "agents sync: %v\n", err)
		return
	}
	for _, id := range ids {
		if !everyProject && !pending[id] {
			continue
		}
		if _, err := wedge.SyncAgentsBlocks(core.Store, id); err != nil {
			fmt.Fprintf(errOut, "agents sync %s: %v\n", id, err)
		}
	}
}

func projectionFilesProto(files []wedge.ProjectionFile) []*localv1.ProjectionFile {
	out := make([]*localv1.ProjectionFile, 0, len(files))
	for _, file := range files {
		out = append(out, &localv1.ProjectionFile{Repo: file.Repo, Path: file.Path, Action: file.Action, Reason: file.Reason})
	}
	return out
}
