// Package actor names who performed a write. The raw value is stored in activity.actor.
package actor

// Actor is ui, cli, mcp:<clientName>, or system.
type Actor struct {
	Raw string
}

func UI() Actor { return Actor{Raw: "ui"} }

func CLI() Actor { return Actor{Raw: "cli"} }

func System() Actor { return Actor{Raw: "system"} }

func MCP(client string) Actor { return Actor{Raw: "mcp:" + client} }
