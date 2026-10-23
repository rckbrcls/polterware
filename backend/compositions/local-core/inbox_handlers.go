package localcore

import (
	"context"
	"errors"
	"strings"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/agentrun"
	"github.com/polterware/polterware/backend/domains/canon"
	"github.com/polterware/polterware/backend/domains/inbox"
	"github.com/polterware/polterware/backend/domains/polter"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func (core *Core) ListInbox(_ context.Context, request *connect.Request[localv1.ListInboxRequest]) (*connect.Response[localv1.ListInboxResponse], error) {
	if request.Msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	scope, err := wedge.ResolveScopeRef(core.Store, request.Msg.ProjectId, request.Msg.ScopeNode, request.Msg.ScopeExact)
	if err != nil {
		return nil, invalid(err.Error())
	}
	result, err := wedge.ListInboxScoped(core.Store, request.Msg.ProjectId, scope)
	if err != nil {
		return nil, internal(err)
	}
	out := &localv1.ListInboxResponse{
		OpenCount:     int32(result.Open()),
		BlockingCount: int32(result.Blocking()),
	}
	assigned, err := core.Store.ScopeMap(request.Msg.ProjectId, storepkg.ScopeItem)
	if err != nil {
		return nil, internal(err)
	}
	withScope := func(item inbox.Item) *localv1.InboxItem {
		msg := inboxItemProto(item)
		msg.ScopeNodeId = assigned[item.Key]
		return msg
	}
	for _, item := range result.Items {
		out.Items = append(out.Items, withScope(item))
	}
	for _, routed := range result.Routed {
		out.Routed = append(out.Routed, &localv1.RoutedInboxItem{Item: withScope(routed.Item), Action: routed.Action})
	}
	return connect.NewResponse(out), nil
}

func (core *Core) ResolveInboxItem(_ context.Context, request *connect.Request[localv1.ResolveInboxItemRequest]) (*connect.Response[localv1.ResolveInboxItemResponse], error) {
	msg := request.Msg
	if msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	action, err := inbox.ParseAction(msg.Action)
	if err != nil {
		return nil, invalid(err.Error())
	}
	in := wedge.ResolveInboxInput{
		ProjectID: msg.ProjectId,
		ItemID:    msg.ItemId,
		Action:    action,
		Answer:    msg.Answer,
	}
	client := clientOf(request.Header())
	if client == "desktop" {
		in.Actor = "desktop"
		in.Apply.ActorKind = agentrun.ActorKindHuman
		in.Apply.Tool = "desktop.inbox.resolve"
	} else {
		in.Actor = strings.TrimSpace(msg.SessionLabel)
		if in.Actor == "" {
			in.Actor = client
		}
		in.Apply.Agent = strings.TrimSpace(msg.SessionLabel)
		in.Apply.AutoStartLabel = client
		in.Apply.Tool = "polter.inbox"
	}
	result, err := wedge.ResolveInbox(core.Store, in)
	var inputErr *wedge.InboxInputError
	switch {
	case err == nil:
	case errors.Is(err, wedge.ErrUnknownInboxItem):
		return nil, connect.NewError(connect.CodeNotFound, err)
	case errors.As(err, &inputErr), errors.Is(err, canon.ErrVerifiedRequiresActor), errors.Is(err, canon.ErrUnknownFact):
		return nil, invalid(err.Error())
	case errors.Is(err, wedge.ErrPolterInvalid) && result.Apply != nil:
		return nil, invalidPolter(result.Apply.Diagnostics)
	default:
		return nil, mapAuditedErr(err)
	}
	out := &localv1.ResolveInboxItemResponse{Item: inboxItemProto(result.Item), Action: result.Action}
	if result.Apply != nil {
		if len(result.Apply.Ops) > 0 {
			out.Ops = strings.Split(strings.TrimSuffix(polter.FormatPlan(result.Apply.Ops), "\n"), "\n")
		}
		out.Diagnostics = diagnosticsProto(result.Apply.Diagnostics)
	}
	return connect.NewResponse(out), nil
}

func inboxItemProto(item inbox.Item) *localv1.InboxItem {
	return &localv1.InboxItem{
		Id:       item.ID,
		Kind:     item.Kind,
		Blocking: item.Blocking,
		Title:    item.Title,
		Detail:   item.Detail,
		Options:  item.Options,
		Where:    item.Where,
		Source:   item.Source,
		State:    item.State,
		Actions:  item.Actions,
	}
}
