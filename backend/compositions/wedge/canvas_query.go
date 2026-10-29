package wedge

import (
	"fmt"
	"strings"

	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/canvas"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// queryCanvas lists agent-visible canvases, or returns the node-link export
// of one of them. A canvas with agent_visible false is omitted from the list
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
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return formatAgentCanvases(visible), nil
	}
	item, err := findAgentCanvas(visible, ref)
	if err != nil {
		return "", err
	}
	body, err := canvas.Export(item.Graph)
	if err != nil {
		return "", err
	}
	text := string(body)
	if !strings.HasSuffix(text, "\n") {
		text += "\n"
	}
	return text, nil
}

func formatAgentCanvases(items []canvas.Canvas) string {
	if len(items) == 0 {
		return "no canvases\n"
	}
	var b strings.Builder
	b.WriteString("id  type  scope  name\n")
	for _, item := range items {
		scope := item.ScopeNodeID
		if scope == "" {
			scope = "-"
		}
		fmt.Fprintf(&b, "%s  %s  %s  %s\n", item.ID, item.Type, scope, item.Name)
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
