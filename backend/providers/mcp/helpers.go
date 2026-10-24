package mcp

import "encoding/json"

func marshalPretty(value any) (string, error) {
	body, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return "", err
	}
	return string(body), nil
}

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

func intFrom(value any, fallback int) int {
	switch typed := value.(type) {
	case float64:
		return int(typed)
	case int:
		return typed
	case int32:
		return int(typed)
	case json.Number:
		n, err := typed.Int64()
		if err == nil {
			return int(n)
		}
	}
	return fallback
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

func jsonRawOrObject(raw string) any {
	if raw == "" {
		return map[string]any{}
	}
	var value any
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		return raw
	}
	return value
}
