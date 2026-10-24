package atlas

// Deployment is one environment link for an Atlas node. Provider is a catalog
// id and Resource names the remote target. Credentials are never stored.
type Deployment struct {
	ID            string `json:"id"`
	EnvironmentID string `json:"environment_id"`
	// Environment is the environment name, for display. The table stores the id.
	Environment string `json:"environment,omitempty"`
	Provider    string `json:"provider"`
	Resource    string `json:"resource"`
}

// DeploymentsFrom reads a deploys field from a planned op or a replayed
// change_ops JSON value. The bool is false when value is not a deployment list.
func DeploymentsFrom(value any) ([]Deployment, bool) {
	switch v := value.(type) {
	case nil:
		return []Deployment{}, true
	case []Deployment:
		return v, true
	case []any:
		out := make([]Deployment, 0, len(v))
		for _, item := range v {
			fields, ok := item.(map[string]any)
			if !ok {
				return nil, false
			}
			out = append(out, Deployment{
				ID:            fieldString(fields, "id"),
				EnvironmentID: fieldString(fields, "environment_id"),
				Environment:   fieldString(fields, "environment"),
				Provider:      fieldString(fields, "provider"),
				Resource:      fieldString(fields, "resource"),
			})
		}
		return out, true
	default:
		return nil, false
	}
}

func fieldString(fields map[string]any, key string) string {
	text, _ := fields[key].(string)
	return text
}
