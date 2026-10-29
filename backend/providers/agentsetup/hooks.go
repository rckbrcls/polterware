package agentsetup

// Hook is one behavior of the plugin that the operator can switch off.
// hooks.json stays fixed; each `polterware hook <name>` asks the core.
type Hook struct {
	Name  string
	Label string
	Note  string
}

// Hooks is the fixed list of switches, in display order.
var Hooks = []Hook{
	{"status", "Session-start status", "Adds the project status to the session context."},
	{"stop", "Stop handoff reminder", "Reminds the agent to write a handoff before it ends."},
	{"lint", ".pw.md lint", "Lints Polter files the agent writes."},
	{"context", "File context", "Adds the brief of the Structure node a file belongs to when the agent first reads or edits it in a session."},
	{"session", "Session AgentRun", "Groups the session's writes into one AgentRun."},
}

// ValidHook reports whether name is a switch.
func ValidHook(name string) bool {
	for _, hook := range Hooks {
		if hook.Name == name {
			return true
		}
	}
	return false
}

// SwitchFor maps a `polterware hook` subcommand to its switch.
func SwitchFor(subcommand string) string {
	switch subcommand {
	case "session-start", "session-end":
		return "session"
	}
	return subcommand
}
