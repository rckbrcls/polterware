package localcore

import (
	"context"
	"fmt"
	"strings"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/compositions/wedge"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func (core *Core) SetScope(_ context.Context, request *connect.Request[localv1.SetScopeRequest]) (*connect.Response[localv1.SetScopeResponse], error) {
	msg := request.Msg
	if msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	if strings.TrimSpace(msg.Id) == "" {
		return nil, invalid("id is required")
	}
	switch msg.Kind {
	case storepkg.ScopeDecision, storepkg.ScopeKnowledge, storepkg.ScopeFact, storepkg.ScopeRule, storepkg.ScopeItem:
	default:
		return nil, invalid(fmt.Sprintf("unknown scope kind %q: use decision, knowledge, fact, rule, or item", msg.Kind))
	}
	// The nodes replace the entity's contexts; none clears them (the whole project).
	scope, err := wedge.ResolveScopeRefs(core.Store, msg.ProjectId, msg.Nodes, false)
	if err != nil {
		return nil, invalid(err.Error())
	}
	id := msg.Id
	if msg.Kind == storepkg.ScopeRule {
		// A Rule is named by its slug as often as by its id.
		rules, err := core.Store.ListRules(msg.ProjectId)
		if err != nil {
			return nil, internal(err)
		}
		for _, rule := range rules {
			if rule.Slug != "" && rule.Slug == id {
				id = rule.ID
			}
		}
	}
	if err := core.Store.SetScope(msg.ProjectId, msg.Kind, id, scope.NodeIDs); err != nil {
		return nil, invalid(err.Error())
	}
	return connect.NewResponse(&localv1.SetScopeResponse{}), nil
}
