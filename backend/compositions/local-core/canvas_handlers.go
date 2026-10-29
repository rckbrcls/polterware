package localcore

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/agentrun"
	"github.com/polterware/polterware/backend/domains/canvas"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	"github.com/polterware/polterware/backend/platform/ids"
)

func (core *Core) ListCanvases(_ context.Context, request *connect.Request[localv1.ListCanvasesRequest]) (*connect.Response[localv1.ListCanvasesResponse], error) {
	if request.Msg.GetProjectId() == "" {
		return nil, invalid("project id is required")
	}
	list := core.Store.ListCanvases
	if request.Msg.GetArchived() {
		list = core.Store.ListArchivedCanvases
	}
	items, err := list(request.Msg.GetProjectId())
	if err != nil {
		return nil, internal(err)
	}
	resolved, err := wedge.LoadNodeScope(core.Store, request.Msg.GetProjectId(), request.Msg.GetScopeNode(), request.Msg.GetScopeExact())
	if err != nil {
		return nil, invalid(err.Error())
	}
	out := make([]*localv1.Canvas, 0, len(items))
	for _, item := range items {
		if !resolved.Matches(item.ScopeNodeID) {
			continue
		}
		out = append(out, canvasProto(item))
	}
	return connect.NewResponse(&localv1.ListCanvasesResponse{Canvases: out}), nil
}

func (core *Core) GetCanvas(_ context.Context, request *connect.Request[localv1.GetCanvasRequest]) (*connect.Response[localv1.GetCanvasResponse], error) {
	if request.Msg.GetProjectId() == "" || request.Msg.GetId() == "" {
		return nil, invalid("project id and canvas id are required")
	}
	item, err := core.Store.GetCanvas(request.Msg.GetProjectId(), request.Msg.GetId())
	if errors.Is(err, sql.ErrNoRows) {
		return nil, connect.NewError(connect.CodeNotFound, errors.New("canvas not found"))
	}
	if err != nil {
		return nil, internal(err)
	}
	return connect.NewResponse(&localv1.GetCanvasResponse{Canvas: canvasProto(item)}), nil
}

func (core *Core) CreateCanvas(_ context.Context, request *connect.Request[localv1.CreateCanvasRequest]) (*connect.Response[localv1.CreateCanvasResponse], error) {
	msg := request.Msg
	if msg.GetProjectId() == "" {
		return nil, invalid("project id is required")
	}
	env, err := changeEnvelopeFromProto(msg.GetChange())
	if err != nil {
		return nil, mapAuditedErr(err)
	}
	graph, err := graphFromProto(msg.GetGraph())
	if err != nil {
		return nil, invalid(err.Error())
	}
	prepared, err := canvas.Prepare(canvas.Canvas{
		ID:           msg.GetId(),
		ProjectID:    msg.GetProjectId(),
		Name:         msg.GetName(),
		Type:         msg.GetType(),
		AgentVisible: msg.GetAgentVisible(),
		Graph:        graph,
		LayoutJSON:   msg.GetLayoutJson(),
		ScopeNodeID:  msg.GetScopeNodeId(),
	})
	if err != nil {
		return nil, mapCanvasWriteErr(err)
	}
	if err := core.Store.RequireAtlasNode(prepared.ProjectID, prepared.ScopeNodeID); err != nil {
		return nil, mapCanvasWriteErr(err)
	}
	env.ProjectID = prepared.ProjectID
	env.BatchID = ids.NewULID()
	written, err := wedge.ExecuteAuditedWrite(core.Store, env, agentrun.ActorKindHuman, "desktop.canvas.create", func(run agentrun.Run) ([]string, any, error) {
		saved, saveErr := core.Store.CreateCanvas(prepared, run.ID, env.BatchID)
		if saveErr != nil {
			return nil, nil, saveErr
		}
		return []string{saved.ID}, saved, nil
	})
	if err != nil {
		return nil, mapCanvasWriteErr(err)
	}
	saved, _ := written.Result.(canvas.Canvas)
	return connect.NewResponse(&localv1.CreateCanvasResponse{Canvas: canvasProto(saved)}), nil
}

func (core *Core) UpdateCanvas(_ context.Context, request *connect.Request[localv1.UpdateCanvasRequest]) (*connect.Response[localv1.UpdateCanvasResponse], error) {
	msg := request.Msg
	if msg.GetProjectId() == "" || msg.GetId() == "" {
		return nil, invalid("project id and canvas id are required")
	}
	env, err := changeEnvelopeFromProto(msg.GetChange())
	if err != nil {
		return nil, mapAuditedErr(err)
	}
	current, err := core.Store.GetCanvas(msg.GetProjectId(), msg.GetId())
	if errors.Is(err, sql.ErrNoRows) {
		return nil, connect.NewError(connect.CodeNotFound, errors.New("canvas not found"))
	}
	if err != nil {
		return nil, internal(err)
	}
	if current.Archived() {
		return nil, mapArchiveErr(canvas.ErrArchived)
	}
	changed := false
	if msg.Name != nil {
		current.Name = *msg.Name
		changed = true
	}
	if msg.AgentVisible != nil {
		current.AgentVisible = *msg.AgentVisible
		changed = true
	}
	if msg.Graph != nil {
		graph, graphErr := graphFromProto(msg.Graph)
		if graphErr != nil {
			return nil, invalid(graphErr.Error())
		}
		current.Graph = graph
		changed = true
	}
	if msg.LayoutJson != nil {
		current.LayoutJSON = *msg.LayoutJson
		changed = true
	}
	if msg.ScopeNodeId != nil {
		current.ScopeNodeID = *msg.ScopeNodeId
		changed = true
	}
	if !changed {
		return nil, invalid("update requires name, agent_visible, graph, layout, or scope")
	}
	prepared, err := canvas.Prepare(current)
	if err != nil {
		return nil, mapCanvasWriteErr(err)
	}
	if err := core.Store.RequireAtlasNode(prepared.ProjectID, prepared.ScopeNodeID); err != nil {
		return nil, mapCanvasWriteErr(err)
	}
	env.ProjectID = prepared.ProjectID
	env.BatchID = ids.NewULID()
	written, err := wedge.ExecuteAuditedWrite(core.Store, env, agentrun.ActorKindHuman, "desktop.canvas.update", func(run agentrun.Run) ([]string, any, error) {
		saved, saveErr := core.Store.UpdateCanvas(prepared, run.ID, env.BatchID)
		if saveErr != nil {
			return nil, nil, saveErr
		}
		return []string{saved.ID}, saved, nil
	})
	if err != nil {
		return nil, mapCanvasWriteErr(err)
	}
	saved, _ := written.Result.(canvas.Canvas)
	return connect.NewResponse(&localv1.UpdateCanvasResponse{Canvas: canvasProto(saved)}), nil
}

func (core *Core) DeleteCanvas(_ context.Context, request *connect.Request[localv1.DeleteCanvasRequest]) (*connect.Response[localv1.DeleteCanvasResponse], error) {
	msg := request.Msg
	if msg.GetProjectId() == "" || msg.GetId() == "" {
		return nil, invalid("project id and canvas id are required")
	}
	env, err := changeEnvelopeFromProto(msg.GetChange())
	if err != nil {
		return nil, mapAuditedErr(err)
	}
	existing, err := core.Store.GetCanvas(msg.GetProjectId(), msg.GetId())
	if errors.Is(err, sql.ErrNoRows) {
		return nil, connect.NewError(connect.CodeNotFound, errors.New("canvas not found"))
	}
	if err != nil {
		return nil, internal(err)
	}
	if !existing.Archived() {
		return nil, mapArchiveErr(canvas.ErrNotArchived)
	}
	env.ProjectID = existing.ProjectID
	env.BatchID = ids.NewULID()
	_, err = wedge.ExecuteAuditedWrite(core.Store, env, agentrun.ActorKindHuman, "desktop.canvas.delete", func(run agentrun.Run) ([]string, any, error) {
		if deleteErr := core.Store.DeleteCanvas(existing.ProjectID, existing.ID, run.ID, env.BatchID); deleteErr != nil {
			return nil, nil, deleteErr
		}
		return []string{existing.ID}, nil, nil
	})
	if err != nil {
		return nil, mapCanvasWriteErr(err)
	}
	return connect.NewResponse(&localv1.DeleteCanvasResponse{}), nil
}

func (core *Core) ListCanvasTypes(context.Context, *connect.Request[localv1.ListCanvasTypesRequest]) (*connect.Response[localv1.ListCanvasTypesResponse], error) {
	defs := canvas.Types()
	out := make([]*localv1.CanvasTypeDefinition, 0, len(defs))
	for _, def := range defs {
		out = append(out, &localv1.CanvasTypeDefinition{
			Type:         def.Type,
			Label:        def.Label,
			NodeKinds:    def.NodeKinds,
			EdgeKinds:    def.EdgeKinds,
			Rules:        def.Rules,
			Unrestricted: def.Unrestricted,
		})
	}
	return connect.NewResponse(&localv1.ListCanvasTypesResponse{Types: out}), nil
}

func mapCanvasWriteErr(err error) error {
	if err == nil {
		return nil
	}
	switch {
	case errors.Is(err, sql.ErrNoRows):
		return connect.NewError(connect.CodeNotFound, errors.New("canvas not found"))
	case errors.Is(err, canvas.ErrNotArchived), errors.Is(err, canvas.ErrArchived):
		return mapArchiveErr(err)
	case errors.Is(err, canvas.ErrInvalidGraph),
		errors.Is(err, canvas.ErrUnknownType),
		errors.Is(err, canvas.ErrNameRequired),
		errors.Is(err, canvas.ErrLayout),
		errors.Is(err, canvas.ErrUnknownScope):
		return invalid(err.Error())
	default:
		return mapAuditedErr(err)
	}
}

func graphFromProto(msg *localv1.CanvasGraph) (canvas.Graph, error) {
	if msg == nil {
		return canvas.Graph{}, nil
	}
	graph := canvas.Graph{
		Nodes: make([]canvas.Node, 0, len(msg.GetNodes())),
		Edges: make([]canvas.Edge, 0, len(msg.GetEdges())),
	}
	for i, node := range msg.GetNodes() {
		if node == nil {
			continue
		}
		props, err := objectProps(node.GetPropsJson())
		if err != nil {
			return canvas.Graph{}, fmt.Errorf("nodes[%d].props: %w", i, err)
		}
		item := canvas.Node{ID: node.GetId(), Kind: node.GetKind(), Label: node.GetLabel(), Props: props}
		if ref := node.GetRef(); ref != nil && (ref.GetKind() != "" || ref.GetId() != "") {
			item.Ref = &canvas.Ref{Kind: ref.GetKind(), ID: ref.GetId()}
		}
		graph.Nodes = append(graph.Nodes, item)
	}
	for i, edge := range msg.GetEdges() {
		if edge == nil {
			continue
		}
		props, err := objectProps(edge.GetPropsJson())
		if err != nil {
			return canvas.Graph{}, fmt.Errorf("edges[%d].props: %w", i, err)
		}
		graph.Edges = append(graph.Edges, canvas.Edge{
			ID: edge.GetId(), From: edge.GetFrom(), To: edge.GetTo(), Kind: edge.GetKind(), Props: props,
		})
	}
	return graph, nil
}

func objectProps(raw string) (map[string]any, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "null" {
		return map[string]any{}, nil
	}
	var props map[string]any
	if err := json.Unmarshal([]byte(raw), &props); err != nil {
		return nil, errors.New("must be a JSON object")
	}
	if props == nil {
		props = map[string]any{}
	}
	return props, nil
}

func canvasProto(item canvas.Canvas) *localv1.Canvas {
	return &localv1.Canvas{
		Id:           item.ID,
		ProjectId:    item.ProjectID,
		Name:         item.Name,
		Type:         item.Type,
		AgentVisible: item.AgentVisible,
		Graph:        graphToProto(item.Graph),
		LayoutJson:   item.LayoutJSON,
		ScopeNodeId:  item.ScopeNodeID,
		CreatedAt:    item.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:    item.UpdatedAt.UTC().Format(time.RFC3339),
		ArchivedAt:   archivedStamp(item.ArchivedAt),
	}
}

func graphToProto(graph canvas.Graph) *localv1.CanvasGraph {
	msg := &localv1.CanvasGraph{
		Nodes: make([]*localv1.CanvasNode, 0, len(graph.Nodes)),
		Edges: make([]*localv1.CanvasEdge, 0, len(graph.Edges)),
	}
	for _, node := range graph.Nodes {
		item := &localv1.CanvasNode{Id: node.ID, Kind: node.Kind, Label: node.Label, PropsJson: mustProps(node.Props)}
		if node.Ref != nil {
			item.Ref = &localv1.CanvasRef{Kind: node.Ref.Kind, Id: node.Ref.ID}
		}
		msg.Nodes = append(msg.Nodes, item)
	}
	for _, edge := range graph.Edges {
		msg.Edges = append(msg.Edges, &localv1.CanvasEdge{
			Id: edge.ID, From: edge.From, To: edge.To, Kind: edge.Kind, PropsJson: mustProps(edge.Props),
		})
	}
	return msg
}

func mustProps(props map[string]any) string {
	if props == nil {
		props = map[string]any{}
	}
	body, err := json.Marshal(props)
	if err != nil {
		return "{}"
	}
	return string(body)
}
