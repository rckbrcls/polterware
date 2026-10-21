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
	case storepkg.ScopeDecision, storepkg.ScopeKnowledge, storepkg.ScopeFact, storepkg.ScopeEvidence, storepkg.ScopeItem:
	default:
		return nil, invalid(fmt.Sprintf("unknown scope kind %q: use decision, knowledge, fact, evidence, or item", msg.Kind))
	}
	scope, err := wedge.ResolveScopeRef(core.Store, msg.ProjectId, msg.Node, false)
	if err != nil {
		return nil, invalid(err.Error())
	}
	if err := core.Store.SetScope(msg.ProjectId, msg.Kind, msg.Id, scope.NodeID); err != nil {
		return nil, invalid(err.Error())
	}
	return connect.NewResponse(&localv1.SetScopeResponse{}), nil
}
