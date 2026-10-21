package mcp

import (
	"github.com/polterware/polterware/backend/compositions/wedge"
	contextpkg "github.com/polterware/polterware/backend/domains/context"
)

func (s *Server) contextGet(args map[string]any) (string, error) {
	projectID := stringFrom(args["project_id"])
	scope, err := wedge.ResolveScopeRef(s.Store, projectID, stringFrom(args["scope"]), boolFrom(args["scope_exact"]))
	if err != nil {
		return "", err
	}
	pkg, err := wedge.CompileContext(s.Store, wedge.ContextInput{
		ProjectID:   projectID,
		ScopeNodeID: scope.NodeID,
		ScopeExact:  scope.Exact,
		Query:       stringFrom(args["query"]),
		EntityID:    stringFrom(args["entity_id"]),
		TokenBudget: intFrom(args["token_budget"], contextpkg.DefaultTokenBudget),
		AgentRunID:  stringFrom(args["agent_run_id"]),
	})
	if err != nil {
		return "", err
	}
	return marshalPretty(pkg)
}
