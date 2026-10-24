package canvas

import "encoding/json"

type exportNode struct {
	ID    string         `json:"id"`
	Kind  string         `json:"kind"`
	Label string         `json:"label"`
	Props map[string]any `json:"props"`
	Ref   *Ref           `json:"ref,omitempty"`
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

// Export writes the graph as node-link JSON (nodes + links). Layout is omitted.
func Export(graph Graph) ([]byte, error) {
	graph = normalize(graph)
	doc := exportDoc{
		Directed: true,
		Nodes:    make([]exportNode, 0, len(graph.Nodes)),
		Links:    make([]exportLink, 0, len(graph.Edges)),
	}
	for _, node := range graph.Nodes {
		doc.Nodes = append(doc.Nodes, exportNode{
			ID: node.ID, Kind: node.Kind, Label: node.Label, Props: node.Props, Ref: node.Ref,
		})
	}
	for _, edge := range graph.Edges {
		doc.Links = append(doc.Links, exportLink{
			ID: edge.ID, Source: edge.From, Target: edge.To, Kind: edge.Kind, Props: edge.Props,
		})
	}
	return json.Marshal(doc)
}
