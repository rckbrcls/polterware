package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"sort"
	"strings"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/domains/canvas"
	"github.com/polterware/polterware/backend/platform/coreclient"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

const canvasUsage = `usage: polterware canvas ls [--agents] [--scope <node>[,<node>]] [--exact] [--project <id>]
       polterware canvas show <id|name> [--format json|mermaid|dot] [--project <id>]
       polterware canvas share <id|name> on|off [--project <id>]`

type canvasListArgs struct {
	project string
	agents  bool
	scope   []string
	exact   bool
}

type canvasShowArgs struct {
	project string
	ref     string
	format  string
}

type canvasShareArgs struct {
	project string
	ref     string
	on      bool
}

func runCanvas(dbPath string, args []string) error {
	if len(args) == 0 {
		return errors.New(canvasUsage)
	}
	switch args[0] {
	case "ls":
		parsed, err := parseCanvasList(args[1:])
		if err != nil {
			return err
		}
		return canvasList(dbPath, parsed)
	case "show":
		parsed, err := parseCanvasShow(args[1:])
		if err != nil {
			return err
		}
		return canvasShow(dbPath, parsed)
	case "share":
		parsed, err := parseCanvasShare(args[1:])
		if err != nil {
			return err
		}
		return canvasShare(dbPath, parsed)
	default:
		return errors.New(canvasUsage)
	}
}

func parseCanvasList(args []string) (canvasListArgs, error) {
	flags := flag.NewFlagSet("canvas ls", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	projectID := flags.String("project", "", "project id (default: project containing the cwd)")
	agents := flags.Bool("agents", false, "list only canvases agents can read")
	scope := addScopeFlags(flags)
	positional, err := parseInterspersed(flags, args)
	if err != nil {
		return canvasListArgs{}, err
	}
	if len(positional) != 0 {
		return canvasListArgs{}, errors.New(canvasUsage)
	}
	return canvasListArgs{
		project: *projectID,
		agents:  *agents,
		scope:   scope.nodes(),
		exact:   scope.exact != nil && *scope.exact,
	}, nil
}

func parseCanvasShow(args []string) (canvasShowArgs, error) {
	flags := flag.NewFlagSet("canvas show", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	projectID := flags.String("project", "", "project id (default: project containing the cwd)")
	format := flags.String("format", "json", "json, mermaid, or dot")
	positional, err := parseInterspersed(flags, args)
	if err != nil {
		return canvasShowArgs{}, err
	}
	if len(positional) != 1 {
		return canvasShowArgs{}, errors.New(canvasUsage)
	}
	switch strings.ToLower(strings.TrimSpace(*format)) {
	case "json", "mermaid", "dot":
	default:
		return canvasShowArgs{}, fmt.Errorf("unknown format %q: use json, mermaid, or dot", *format)
	}
	return canvasShowArgs{project: *projectID, ref: positional[0], format: strings.ToLower(strings.TrimSpace(*format))}, nil
}

func parseCanvasShare(args []string) (canvasShareArgs, error) {
	flags := flag.NewFlagSet("canvas share", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	projectID := flags.String("project", "", "project id (default: project containing the cwd)")
	positional, err := parseInterspersed(flags, args)
	if err != nil {
		return canvasShareArgs{}, err
	}
	if len(positional) != 2 {
		return canvasShareArgs{}, errors.New(canvasUsage)
	}
	switch positional[1] {
	case "on", "off":
	default:
		return canvasShareArgs{}, errors.New(canvasUsage)
	}
	return canvasShareArgs{project: *projectID, ref: positional[0], on: positional[1] == "on"}, nil
}

func canvasList(dbPath string, args canvasListArgs) error {
	c, project, err := canvasProject(dbPath, args.project)
	if err != nil {
		return err
	}
	items, err := listCanvases(c, project.Id, args.scope, args.exact)
	if err != nil {
		return err
	}
	fmt.Print(formatCanvasList(selectCanvases(items, args.agents), args.agents))
	return nil
}

func canvasShow(dbPath string, args canvasShowArgs) error {
	c, project, err := canvasProject(dbPath, args.project)
	if err != nil {
		return err
	}
	items, err := listCanvases(c, project.Id, nil, false)
	if err != nil {
		return err
	}
	item, err := findCanvas(items, args.ref)
	if err != nil {
		return err
	}
	graph, err := canvasGraph(item.GetGraph())
	if err != nil {
		return err
	}
	text, err := canvas.ExportFormat(graph, args.format)
	if err != nil {
		return err
	}
	fmt.Print(withNewline(text))
	return nil
}

func canvasShare(dbPath string, args canvasShareArgs) error {
	c, project, err := canvasProject(dbPath, args.project)
	if err != nil {
		return err
	}
	items, err := listCanvases(c, project.Id, nil, false)
	if err != nil {
		return err
	}
	item, err := findCanvas(items, args.ref)
	if err != nil {
		return err
	}
	visible := args.on
	summary, rationale := "Hide canvas from agents", "agent_visible turned off from the CLI"
	if visible {
		summary, rationale = "Share canvas with agents", "agent_visible turned on from the CLI"
	}
	res, err := c.Canvas.UpdateCanvas(context.Background(), connect.NewRequest(&localv1.UpdateCanvasRequest{
		ProjectId:    project.Id,
		Id:           item.GetId(),
		AgentVisible: &visible,
		Change:       &localv1.ChangeEnvelope{Summary: summary, Rationale: rationale},
	}))
	if err != nil {
		return err
	}
	state := "off"
	if res.Msg.GetCanvas().GetAgentVisible() {
		state = "on"
	}
	fmt.Printf("%s: agent_visible %s\n", res.Msg.GetCanvas().GetName(), state)
	return nil
}

func canvasProject(dbPath, projectID string) (coreclient.Clients, *localv1.Project, error) {
	c, err := dial(dbPath)
	if err != nil {
		return coreclient.Clients{}, nil, err
	}
	project, err := resolveProject(c, projectID)
	if err != nil {
		return coreclient.Clients{}, nil, err
	}
	return c, project, nil
}

func listCanvases(c coreclient.Clients, projectID string, nodes []string, exact bool) ([]*localv1.Canvas, error) {
	if len(nodes) == 0 {
		nodes = []string{""}
	}
	seen := map[string]bool{}
	var out []*localv1.Canvas
	for _, node := range nodes {
		res, err := c.Canvas.ListCanvases(context.Background(), connect.NewRequest(&localv1.ListCanvasesRequest{
			ProjectId:  projectID,
			ScopeNode:  node,
			ScopeExact: exact,
		}))
		if err != nil {
			return nil, err
		}
		for _, item := range res.Msg.GetCanvases() {
			if item == nil || seen[item.GetId()] {
				continue
			}
			seen[item.GetId()] = true
			out = append(out, item)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].GetName() != out[j].GetName() {
			return out[i].GetName() < out[j].GetName()
		}
		return out[i].GetId() < out[j].GetId()
	})
	return out, nil
}

func selectCanvases(items []*localv1.Canvas, agentsOnly bool) []*localv1.Canvas {
	if !agentsOnly {
		return items
	}
	out := make([]*localv1.Canvas, 0, len(items))
	for _, item := range items {
		if item.GetAgentVisible() {
			out = append(out, item)
		}
	}
	return out
}

func formatCanvasList(items []*localv1.Canvas, agentsOnly bool) string {
	if len(items) == 0 {
		if agentsOnly {
			return "no agent-visible canvases\n"
		}
		return "no canvases\n"
	}
	rows := make([][5]string, len(items))
	width := [4]int{len("id"), len("name"), len("type"), len("visible")}
	for i, item := range items {
		visible := "no"
		if item.GetAgentVisible() {
			visible = "yes"
		}
		rows[i] = [5]string{item.GetId(), item.GetName(), item.GetType(), visible, item.GetScopeNodeId()}
		for col := 0; col < 4; col++ {
			if n := len(rows[i][col]); n > width[col] {
				width[col] = n
			}
		}
	}
	var b strings.Builder
	fmt.Fprintf(&b, "%-*s  %-*s  %-*s  %-*s  %s\n", width[0], "id", width[1], "name", width[2], "type", width[3], "visible", "scope")
	for _, row := range rows {
		fmt.Fprintf(&b, "%-*s  %-*s  %-*s  %-*s  %s\n", width[0], row[0], width[1], row[1], width[2], row[2], width[3], row[3], row[4])
	}
	return b.String()
}

func findCanvas(items []*localv1.Canvas, ref string) (*localv1.Canvas, error) {
	ref = strings.TrimSpace(ref)
	var byID *localv1.Canvas
	var byName []*localv1.Canvas
	for _, item := range items {
		if item.GetId() == ref {
			byID = item
		}
		if item.GetName() == ref {
			byName = append(byName, item)
		}
	}
	if byID != nil {
		return byID, nil
	}
	switch len(byName) {
	case 1:
		return byName[0], nil
	case 0:
		return nil, fmt.Errorf("unknown canvas %q: list them with polterware canvas ls", ref)
	default:
		return nil, fmt.Errorf("canvas name %q matches %d canvases: use an id", ref, len(byName))
	}
}

func canvasGraph(msg *localv1.CanvasGraph) (canvas.Graph, error) {
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
		props, err := canvasProps(node.GetPropsJson())
		if err != nil {
			return canvas.Graph{}, fmt.Errorf("nodes[%d].props: %w", i, err)
		}
		item := canvas.Node{ID: node.GetId(), Kind: node.GetKind(), Label: node.GetLabel(), Props: props}
		if ref := node.GetRef(); ref != nil && (strings.TrimSpace(ref.GetKind()) != "" || strings.TrimSpace(ref.GetId()) != "") {
			item.Ref = &canvas.Ref{Kind: ref.GetKind(), ID: ref.GetId()}
		}
		graph.Nodes = append(graph.Nodes, item)
	}
	for i, edge := range msg.GetEdges() {
		if edge == nil {
			continue
		}
		props, err := canvasProps(edge.GetPropsJson())
		if err != nil {
			return canvas.Graph{}, fmt.Errorf("edges[%d].props: %w", i, err)
		}
		graph.Edges = append(graph.Edges, canvas.Edge{
			ID: edge.GetId(), From: edge.GetFrom(), To: edge.GetTo(), Kind: edge.GetKind(), Props: props,
		})
	}
	return graph, nil
}

func canvasProps(raw string) (map[string]any, error) {
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

func withNewline(text string) string {
	if strings.HasSuffix(text, "\n") {
		return text
	}
	return text + "\n"
}
