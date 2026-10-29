package canvas

// Definition is the canvas palette and the rules Validate applies.
// NodeKinds lists components, structure kinds, drawing shapes, note, and text
// so a client can build the palette from the definition alone.
type Definition struct {
	Type         string
	Label        string
	NodeKinds    []string
	EdgeKinds    []string
	Rules        []string
	Unrestricted bool
}

func nodeKinds() []string {
	out := append([]string{}, ComponentKinds...)
	out = append(out, StructureKinds...)
	out = append(out, ShapeKinds...)
	return append(out, KindNote, KindText)
}

// definitions is the registry. There is one generalist canvas type.
var definitions = []Definition{
	{
		Type:      TypeCanvas,
		Label:     "Canvas",
		NodeKinds: nodeKinds(),
		EdgeKinds: EdgeKinds,
		Rules: []string{
			"Components may carry a technology and an optional ref to a structure node.",
			"System, domain, and component nodes ref a structure node.",
			"Drawing shapes, notes, and text carry no meaning and skip structural rules.",
		},
	},
}

// Types returns a copy of the registry in palette order.
func Types() []Definition {
	out := make([]Definition, len(definitions))
	for i, def := range definitions {
		out[i] = cloneDef(def)
	}
	return out
}

// Lookup returns the definition for a canvas type.
func Lookup(typ string) (Definition, bool) {
	for _, def := range definitions {
		if def.Type == typ {
			return cloneDef(def), true
		}
	}
	return Definition{}, false
}

func cloneDef(def Definition) Definition {
	def.NodeKinds = copyStrings(def.NodeKinds)
	def.EdgeKinds = copyStrings(def.EdgeKinds)
	def.Rules = copyStrings(def.Rules)
	return def
}

func copyStrings(in []string) []string {
	if in == nil {
		return nil
	}
	out := make([]string, len(in))
	copy(out, in)
	return out
}
