package mcp

func stringFrom(value any) string {
	text, _ := value.(string)
	return text
}

// scopeRefsFrom accepts a scope argument as one node or a list of nodes.
func scopeRefsFrom(value any) []string {
	if text, ok := value.(string); ok {
		return []string{text}
	}
	return stringSliceFrom(value)
}

func boolFrom(value any) bool {
	flag, _ := value.(bool)
	return flag
}

func stringSliceFrom(value any) []string {
	switch typed := value.(type) {
	case []string:
		return typed
	case []any:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			if text, ok := item.(string); ok && text != "" {
				out = append(out, text)
			}
		}
		return out
	default:
		return nil
	}
}
