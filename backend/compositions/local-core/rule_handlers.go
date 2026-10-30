package localcore

import (
	"context"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/compositions/wedge"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

// ListRules returns the project's active Rules; a scope keeps the ones with a
// context inside it plus the project-wide ones.
func (core *Core) ListRules(_ context.Context, request *connect.Request[localv1.ListRulesRequest]) (*connect.Response[localv1.ListRulesResponse], error) {
	msg := request.Msg
	if msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	rules, err := core.Store.ListRules(msg.ProjectId)
	if err != nil {
		return nil, internal(err)
	}
	scope, err := wedge.LoadNodeScopes(core.Store, msg.ProjectId, msg.ScopeNodes, msg.ScopeExact)
	if err != nil {
		return nil, invalid(err.Error())
	}
	ids, err := core.Store.ScopeMap(msg.ProjectId, "rule")
	if err != nil {
		return nil, internal(err)
	}
	out := &localv1.ListRulesResponse{}
	for _, rule := range rules {
		if !scope.MatchesAny(ids[rule.ID]) {
			continue
		}
		out.Rules = append(out.Rules, &localv1.Rule{
			Id: rule.ID, Slug: rule.Slug, Statement: rule.Statement,
			ScopeNodeIds: ids[rule.ID], ScopePaths: rule.Scopes,
		})
	}
	return connect.NewResponse(out), nil
}
