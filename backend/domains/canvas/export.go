package canvas

import (
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

// ExportFormat renders the graph as json, mermaid, or dot. Layout is omitted.
func ExportFormat(graph Graph, format string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "", "json":
		body, err := Export(graph)
		if err != nil {
			return "", err
		}
		return string(body), nil
	case "mermaid":
		return ExportMermaid(graph), nil
	case "dot":
		return ExportDot(graph), nil
	default:
		return "", fmt.Errorf("unknown canvas format %q: use json, mermaid, or dot", format)
	}
}

// ExportMermaid writes a left-to-right flowchart. Node ids are sanitized, and
// each edge kind is the link label. Trust is part of the node label.
func ExportMermaid(graph Graph) string {
	graph = normalize(graph)
	ids := assignMermaidIDs(graph.Nodes)
	var b strings.Builder
	b.WriteString("flowchart LR\n")
	for _, node := range graph.Nodes {
		label := node.Label
		if label == "" {
			label = node.ID
		}
		fmt.Fprintf(&b, "  %s[\"%s\"]\n", ids[node.ID], mermaidText(label+" ("+trustOf(node)+")"))
	}
	for _, edge := range graph.Edges {
		fmt.Fprintf(&b, "  %s -->|\"%s\"| %s\n", mermaidEndpoint(ids, edge.From), mermaidText(edge.Kind), mermaidEndpoint(ids, edge.To))
	}
	return b.String()
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

var mermaidReserved = map[string]bool{
	"end": true, "graph": true, "subgraph": true, "flowchart": true,
	"style": true, "class": true, "classDef": true, "click": true,
	"direction": true,
}

func assignMermaidIDs(nodes []Node) map[string]string {
	used := map[string]bool{}
	out := map[string]string{}
	for _, node := range nodes {
		base := sanitizeMermaidID(node.ID)
		id := base
		for n := 2; used[id]; n++ {
			id = fmt.Sprintf("%s_%d", base, n)
		}
		used[id] = true
		out[node.ID] = id
	}
	return out
}

func mermaidEndpoint(ids map[string]string, id string) string {
	if got, ok := ids[id]; ok {
		return got
	}
	return sanitizeMermaidID(id)
}

func sanitizeMermaidID(id string) string {
	var b strings.Builder
	for _, r := range id {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
			b.WriteRune(r)
		} else {
			b.WriteByte('_')
		}
	}
	out := b.String()
	if out == "" {
		out = "n"
	}
	if (out[0] >= '0' && out[0] <= '9') || mermaidReserved[out] {
		out = "n_" + out
	}
	return out
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
