package structure

// ComponentKinds are what a component is, in palette order. The canvas uses the
// same list for its semantic components. Only components carry a kind.
var ComponentKinds = []string{
	"frontend", "mobile", "desktop", "cli",
	"service", "api", "gateway", "worker", "function", "scheduler",
	"database", "cache", "queue", "stream", "storage", "search", "warehouse",
	"auth", "cdn", "cluster", "monitoring",
	"external", "llm", "payment", "email",
	"user", "team",
	"agent", "mcp", "vector",
	"secrets", "firewall", "kms",
	"logs", "tracing", "alerting",
	"pipeline", "ci", "webhook",
	"config", "spec", "dataset",
}

// ValidComponentKind reports whether kind is a component kind. Empty is no kind.
func ValidComponentKind(kind string) bool {
	if kind == "" {
		return true
	}
	for _, item := range ComponentKinds {
		if item == kind {
			return true
		}
	}
	return false
}
