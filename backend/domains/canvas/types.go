package canvas

// Definition is one canvas type: the palette and the rules Validate applies.
// NodeKinds includes note and text so a client can build the palette from
// the definition alone. Unrestricted (free) still accepts kinds outside that list.
type Definition struct {
	Type         string
	Label        string
	NodeKinds    []string
	EdgeKinds    []string
	Rules        []string
	Unrestricted bool
}

func withNotes(kinds ...string) []string {
	out := append([]string{}, kinds...)
	return append(out, KindNote, KindText)
}

func ideaBoard(typ, label string) Definition {
	return Definition{
		Type:      typ,
		Label:     label,
		NodeKinds: withNotes(KindIdea, KindGroup),
		EdgeKinds: []string{EdgeRelates, EdgeContains},
		Rules: []string{
			"Nodes are idea or group.",
			"Edges are relates or contains.",
			"Note and text nodes are always allowed and skip structural rules.",
		},
	}
}

// definitions is the registry, in palette order.
var definitions = []Definition{
	{
		Type:         TypeFree,
		Label:        "Free",
		NodeKinds:    withNotes(),
		Rules:        nil,
		Unrestricted: true,
	},
	{
		Type:      TypeArchitecture,
		Label:     "Architecture",
		NodeKinds: withNotes(KindSystem, KindDomain, KindComponent, KindService, KindDatabase, KindQueue),
		EdgeKinds: []string{EdgeUses, EdgeContains},
		Rules: []string{
			"Nodes are system, domain, component, service, database, or queue.",
			"Each of those nodes refs a structure node.",
			"Edges are uses or contains.",
			"Note and text nodes are always allowed and skip structural rules.",
		},
	},
	{
		Type:      TypeRoadmap,
		Label:     "Roadmap",
		NodeKinds: withNotes(KindLane, KindMilestone, KindItem),
		EdgeKinds: []string{EdgeDependsOn, EdgePrecedes},
		Rules: []string{
			"Nodes are lane, milestone, or item.",
			"An item has start and end, or a quarter.",
			"Edges are depends_on or precedes.",
			"Note and text nodes are always allowed and skip structural rules.",
		},
	},
	{
		Type:      TypeFlow,
		Label:     "Flow",
		NodeKinds: withNotes(KindStep, KindDecision, KindStart, KindEnd),
		EdgeKinds: []string{EdgeNext},
		Rules: []string{
			"Nodes are step, decision, start, or end.",
			"Edges are next.",
			"Note and text nodes are always allowed and skip structural rules.",
		},
	},
	ideaBoard(TypeBrainstorm, "Brainstorm"),
	ideaBoard(TypeIdeas, "Ideas"),
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
