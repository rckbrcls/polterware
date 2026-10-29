package wedge

import (
	"cmp"
	"fmt"
	"strings"

	"github.com/polterware/polterware/backend/domains/canvas"
	"github.com/polterware/polterware/backend/domains/structure"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// queryCanvas lists agent-visible canvases, or returns one of them as a
// Mermaid flowchart. A canvas with agent_visible false is omitted from the list
// and answers as unknown, including when the caller names its id.
func queryCanvas(store *storepkg.Store, projectID, ref string, scope structure.MultiScope) (string, error) {
	items, err := store.ListCanvases(projectID)
	if err != nil {
		return "", err
	}
	resolved, err := store.LoadScopes(projectID, scope)
	if err != nil {
		return "", err
	}
	visible := make([]canvas.Canvas, 0, len(items))
	for _, item := range items {
		if !item.AgentVisible || !resolved.Matches(item.ScopeNodeID) {
			continue
		}
		visible = append(visible, item)
	}
	nodes, err := store.StructureNodes(projectID)
	if err != nil {
		return "", err
	}
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return formatAgentCanvases(visible, nodes), nil
	}
	item, err := findAgentCanvas(visible, ref)
	if err != nil {
		return "", err
	}
	return canvas.ExportMermaid(canvas.WithStructure(item.Graph, nodes), item.LayoutJSON), nil
}

func formatAgentCanvases(items []canvas.Canvas, nodes []structure.Node) string {
	if len(items) == 0 {
		return "no canvases\n"
	}
	paths := make(map[string]string, len(nodes))
	for _, node := range nodes {
		paths[node.ID] = node.Path
	}
	var b strings.Builder
	b.WriteString("id  scope  name\n")
	for _, item := range items {
		scope := "-"
		if item.ScopeNodeID != "" {
			scope = cmp.Or(paths[item.ScopeNodeID], item.ScopeNodeID)
		}
		fmt.Fprintf(&b, "%s  %s  %s\n", item.ID, scope, item.Name)
	}
	return b.String()
}

func findAgentCanvas(items []canvas.Canvas, ref string) (canvas.Canvas, error) {
	var byID *canvas.Canvas
	var byName []canvas.Canvas
	for i := range items {
		if items[i].ID == ref {
			byID = &items[i]
		}
		if items[i].Name == ref {
			byName = append(byName, items[i])
		}
	}
	if byID != nil {
		return *byID, nil
	}
	switch len(byName) {
	case 1:
		return byName[0], nil
	case 0:
		return canvas.Canvas{}, fmt.Errorf("unknown canvas %q: list canvases with polterware query canvas", ref)
	default:
		return canvas.Canvas{}, fmt.Errorf("canvas name %q matches %d canvases: use an id", ref, len(byName))
	}
}
