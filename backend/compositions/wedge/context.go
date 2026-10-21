package wedge

import (
	"fmt"
	"time"

	"github.com/polterware/polterware/backend/domains/agentrun"
	contextpkg "github.com/polterware/polterware/backend/domains/context"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// ContextInput compiles a bounded context package (B3/B4).
type ContextInput struct {
	ProjectID   string
	Query       string
	EntityID    string
	TokenBudget int
	AgentRunID  string
	// ScopeNodeID and ScopeExact narrow the package to one Atlas node.
	ScopeNodeID string
	ScopeExact  bool
}

// CompileContext syncs the project model, compiles context, and optionally appends an AgentRun context step.
func CompileContext(store *storepkg.Store, in ContextInput) (contextpkg.Package, error) {
	if in.ProjectID == "" {
		return contextpkg.Package{}, fmt.Errorf("project_id is required")
	}
	budget := in.TokenBudget
	if budget == 0 {
		budget = contextpkg.DefaultTokenBudget
	}
	_, _ = store.SyncProjectModel(in.ProjectID)
	pkg, err := store.CompileContext(contextpkg.Request{
		ProjectID:   in.ProjectID,
		Query:       in.Query,
		EntityID:    in.EntityID,
		TokenBudget: budget,
		ScopeNodeID: in.ScopeNodeID,
		ScopeExact:  in.ScopeExact,
	})
	if err != nil {
		return contextpkg.Package{}, err
	}
	if in.AgentRunID != "" {
		now := time.Now().UTC()
		if err := store.AppendAgentRunStepIfOpen(in.AgentRunID, func(run agentrun.Run) (agentrun.Step, error) {
			return agentrun.NewContextStep(run.ID, pkg, now)
		}); err != nil {
			return contextpkg.Package{}, err
		}
	}
	return pkg, nil
}
