package canvas

import (
	"cmp"
	"encoding/json"
	"fmt"
	"maps"
	"slices"
	"strings"

	"github.com/polterware/polterware/backend/domains/structure"
)

const (
	// TrustReferenced marks a node that cites a store entity.
	TrustReferenced = "referenced"
	// TrustUnverified marks a node with no entity ref.
	TrustUnverified = "unverified"
)

type exportNode struct {
	ID    string         `json:"id"`
	Kind  string         `json:"kind"`
	Label string         `json:"label"`
	Props map[string]any `json:"props"`
	Ref   *Ref           `json:"ref,omitempty"`
	Trust string         `json:"trust"`
}

type exportLink struct {
	ID     string         `json:"id"`
	Source string         `json:"source"`
	Target string         `json:"target"`
	Kind   string         `json:"kind"`
	Props  map[string]any `json:"props"`
}

type exportDoc struct {
	Directed bool         `json:"directed"`
	Nodes    []exportNode `json:"nodes"`
	Links    []exportLink `json:"links"`
}

// WithStructure gives each node that references a Structure node that node's
// title and technology, and a semantic component its kind, the way the Desktop
// draws it. Refs to missing nodes and other entities are left as written.
func WithStructure(graph Graph, nodes []structure.Node) Graph {
	byID := make(map[string]structure.Node, len(nodes))
	for _, node := range nodes {
		byID[node.ID] = node
	}
	out := graph
	out.Nodes = make([]Node, len(graph.Nodes))
	for i, node := range graph.Nodes {
		out.Nodes[i] = node
		if node.Ref == nil || node.Ref.Kind != RefNode {
			continue
		}
		linked, ok := byID[node.Ref.ID]
		if !ok || linked.Status == structure.NodeRemoved {
			continue
		}
		next := &out.Nodes[i]
		next.Label = linked.Title
		if linked.Tech != "" {
			next.Props = maps.Clone(node.Props)
			if next.Props == nil {
				next.Props = map[string]any{}
			}
			next.Props["technology"] = linked.Tech
		}
		if linked.Kind != "" && slices.Contains(ComponentKinds, node.Kind) {
			next.Kind = linked.Kind
		}
	}
	return out
}

// Export writes the graph as node-link JSON (nodes + links). Layout and the
// visual "style" prop are omitted.
// A node with a ref is "referenced"; a node without one is "unverified".
func Export(graph Graph) ([]byte, error) {
	graph = normalize(graph)
	doc := exportDoc{
		Directed: true,
		Nodes:    make([]exportNode, 0, len(graph.Nodes)),
		Links:    make([]exportLink, 0, len(graph.Edges)),
	}
	for _, node := range graph.Nodes {
		doc.Nodes = append(doc.Nodes, exportNode{
			ID: node.ID, Kind: node.Kind, Label: node.Label, Props: withoutStyle(node.Props), Ref: node.Ref, Trust: trustOf(node),
		})
	}
	for _, edge := range graph.Edges {
		doc.Links = append(doc.Links, exportLink{
			ID: edge.ID, Source: edge.From, Target: edge.To, Kind: edge.Kind, Props: withoutStyle(edge.Props),
		})
	}
	return json.Marshal(doc)
}

// ExportFormat renders the graph as mermaid (with the layout's containment),
// json, or dot. Positions themselves are never part of the output.
func ExportFormat(graph Graph, layoutJSON, format string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "", "mermaid":
		return ExportMermaid(graph, layoutJSON), nil
	case "json":
		body, err := Export(graph)
		if err != nil {
			return "", err
		}
		return string(body), nil
	case "dot":
		return ExportDot(graph), nil
	default:
		return "", fmt.Errorf("unknown canvas format %q: use mermaid, json, or dot", format)
	}
}

// ExportMermaid writes the canvas as a left-to-right flowchart for agents. A
// node drawn inside another (its center within the other's rectangle in the
// layout) sits in that node's subgraph, so frames become subgraphs. Notes and
// text become comments in their container. Drawing shapes with no label, no
// links, and nothing inside are dropped. A component or Structure node shows
// its kind and technology, and the closing class line lists the nodes with no
// ref, which are unverified.
func ExportMermaid(graph Graph, layoutJSON string) string {
	graph = normalize(graph)
	rects := layoutRects(layoutJSON)
	vertices := make([]Node, 0, len(graph.Nodes))
	var notes []Node
	for _, node := range graph.Nodes {
		if node.Kind == KindNote || node.Kind == KindText {
			if label(node) != "" {
				notes = append(notes, node)
			}
			continue
		}
		vertices = append(vertices, node)
	}
	linked := map[string]bool{}
	for _, edge := range graph.Edges {
		linked[edge.From], linked[edge.To] = true, true
	}

	parent := containers(vertices, rects)
	kept := map[string]bool{}
	byArea := slices.Clone(vertices)
	slices.SortStableFunc(byArea, func(a, b Node) int { return cmp.Compare(rects[a.ID].area(), rects[b.ID].area()) })
	for _, node := range byArea {
		if label(node) != "" || linked[node.ID] || kept[node.ID] {
			kept[node.ID] = true
			if p := parent[node.ID]; p != "" {
				kept[p] = true
			}
		}
	}
	keptParent := func(id string) string {
		for p := parent[id]; p != ""; p = parent[p] {
			if kept[p] {
				return p
			}
		}
		return ""
	}

	ids := map[string]string{}
	children := map[string][]Node{}
	for _, node := range vertices {
		if kept[node.ID] {
			ids[node.ID] = fmt.Sprintf("n%d", len(ids)+1)
			children[keptParent(node.ID)] = append(children[keptParent(node.ID)], node)
		}
	}
	labels := map[string]string{}
	for _, node := range vertices {
		labels[node.ID] = cmp.Or(label(node), node.Kind)
	}
	noteLines := map[string][]string{}
	for _, note := range notes {
		home := ""
		if rect, ok := rects[note.ID]; ok {
			home = smallestContaining(vertices, rects, rect, func(id string) bool { return kept[id] })
		}
		line := "%% note: " + commentText(label(note))
		var targets []string
		for _, edge := range graph.Edges {
			if other := otherEnd(edge, note.ID); other != "" && ids[other] != "" {
				targets = append(targets, labels[other])
			}
		}
		if len(targets) == 0 && home != "" && len(children[home]) == 0 {
			targets = []string{labels[home]}
		}
		if len(targets) > 0 {
			line = "%% note on " + commentText(strings.Join(targets, ", ")) + ": " + commentText(label(note))
		}
		noteLines[home] = append(noteLines[home], line)
	}

	var b strings.Builder
	b.WriteString("flowchart LR\n")
	var write func(container string, depth int)
	write = func(container string, depth int) {
		indent := strings.Repeat("  ", depth)
		for _, node := range children[container] {
			text := mermaidText(vertexLabel(node))
			if len(children[node.ID]) == 0 {
				fmt.Fprintf(&b, "%s%s[\"%s\"]\n", indent, ids[node.ID], text)
				for _, line := range noteLines[node.ID] {
					b.WriteString(indent + line + "\n")
				}
				continue
			}
			fmt.Fprintf(&b, "%ssubgraph %s[\"%s\"]\n", indent, ids[node.ID], text)
			write(node.ID, depth+1)
			fmt.Fprintf(&b, "%send\n", indent)
		}
		for _, line := range noteLines[container] {
			b.WriteString(indent + line + "\n")
		}
	}
	write("", 1)
	for _, edge := range graph.Edges {
		from, to := ids[edge.From], ids[edge.To]
		if from == "" || to == "" {
			continue
		}
		if edge.Kind == "" || edge.Kind == EdgeRelates {
			fmt.Fprintf(&b, "  %s --> %s\n", from, to)
		} else {
			fmt.Fprintf(&b, "  %s -->|%s| %s\n", from, mermaidText(edge.Kind), to)
		}
	}
	var unverified []string
	for _, node := range vertices {
		if kept[node.ID] && node.Ref == nil && isSemantic(node.Kind) {
			unverified = append(unverified, ids[node.ID])
		}
	}
	if len(unverified) > 0 {
		fmt.Fprintf(&b, "  class %s %s\n", strings.Join(unverified, ","), TrustUnverified)
	}
	return b.String()
}

type rect struct{ x, y, w, h float64 }

func (r rect) area() float64 { return r.w * r.h }

func (r rect) holds(x, y float64) bool {
	return x > r.x && x < r.x+r.w && y > r.y && y < r.y+r.h
}

// layoutRects reads node rectangles from the Desktop layout, with the
// editor's default size when one is missing.
func layoutRects(layoutJSON string) map[string]rect {
	var layout struct {
		Nodes map[string]struct {
			X, Y          float64
			Width, Height float64
		} `json:"nodes"`
	}
	out := map[string]rect{}
	if json.Unmarshal([]byte(layoutJSON), &layout) != nil {
		return out
	}
	for id, pos := range layout.Nodes {
		w, h := pos.Width, pos.Height
		if w <= 0 {
			w = 180
		}
		if h <= 0 {
			h = 100
		}
		out[id] = rect{x: pos.X, y: pos.Y, w: w, h: h}
	}
	return out
}

// containers maps each node to the smallest larger node whose rectangle holds
// its center. Nodes without a layout position sit at the top level.
func containers(nodes []Node, rects map[string]rect) map[string]string {
	out := map[string]string{}
	for _, node := range nodes {
		if r, ok := rects[node.ID]; ok {
			out[node.ID] = smallestContaining(nodes, rects, r, func(id string) bool { return id != node.ID && rects[id].area() > r.area() })
		}
	}
	return out
}

func smallestContaining(nodes []Node, rects map[string]rect, inner rect, allowed func(string) bool) string {
	best, bestArea := "", 0.0
	cx, cy := inner.x+inner.w/2, inner.y+inner.h/2
	for _, node := range nodes {
		outer, ok := rects[node.ID]
		if !ok || !allowed(node.ID) || !outer.holds(cx, cy) {
			continue
		}
		if best == "" || outer.area() < bestArea {
			best, bestArea = node.ID, outer.area()
		}
	}
	return best
}

func otherEnd(edge Edge, id string) string {
	switch id {
	case edge.From:
		return edge.To
	case edge.To:
		return edge.From
	}
	return ""
}

// label is what the person wrote; the editor's "New <kind>" placeholder counts
// as no label.
func label(node Node) string {
	text := strings.TrimSpace(node.Label)
	if text == "New "+node.Kind {
		return ""
	}
	return text
}

func isSemantic(kind string) bool {
	return slices.Contains(ComponentKinds, kind) || slices.Contains(StructureKinds, kind)
}

func vertexLabel(node Node) string {
	parts := []string{cmp.Or(label(node), node.Kind)}
	if isSemantic(node.Kind) {
		parts = append(parts, node.Kind)
		if tech, _ := node.Props["technology"].(string); strings.TrimSpace(tech) != "" {
			parts = append(parts, strings.TrimSpace(tech))
		}
	}
	return strings.Join(parts, " · ")
}

func commentText(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

// ExportDot writes a Graphviz digraph. Edge kinds are link labels, and each
// node carries a trust attribute. Layout is omitted.
func ExportDot(graph Graph) string {
	graph = normalize(graph)
	var b strings.Builder
	b.WriteString("digraph canvas {\n  rankdir=LR;\n")
	for _, node := range graph.Nodes {
		fmt.Fprintf(&b, "  \"%s\" [label=\"%s\" kind=\"%s\" trust=\"%s\"];\n",
			dotEscape(node.ID), dotEscape(node.Label), dotEscape(node.Kind), trustOf(node))
	}
	for _, edge := range graph.Edges {
		fmt.Fprintf(&b, "  \"%s\" -> \"%s\" [label=\"%s\"];\n", dotEscape(edge.From), dotEscape(edge.To), dotEscape(edge.Kind))
	}
	b.WriteString("}\n")
	return b.String()
}

// withoutStyle drops the presentation-only "style" prop the Desktop editor
// stores; it is not part of the graph's meaning.
func withoutStyle(props map[string]any) map[string]any {
	if _, ok := props["style"]; !ok {
		return props
	}
	out := make(map[string]any, len(props)-1)
	for key, value := range props {
		if key != "style" {
			out[key] = value
		}
	}
	return out
}

func trustOf(node Node) string {
	if node.Ref != nil {
		return TrustReferenced
	}
	return TrustUnverified
}

func mermaidText(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString("#quot;")
		case '#':
			b.WriteString("#35;")
		case '\\':
			b.WriteString("#92;")
		case '|':
			b.WriteString("#124;")
		case '\n', '\r':
			b.WriteByte(' ')
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

func dotEscape(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch r {
		case '\\', '"':
			b.WriteByte('\\')
			b.WriteRune(r)
		case '\n', '\r':
			b.WriteString(`\n`)
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}
