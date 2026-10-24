package dispatch

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
)

// Policy is ~/.dispatch/config.json. Unknown keys are ignored.
type Policy struct {
	Priority string `json:"priority,omitempty"`
	Allow    Rules  `json:"allow,omitempty"`
	Deny     Rules  `json:"deny,omitempty"`
	Discover bool   `json:"discover,omitempty"`
	// Binaries maps an agent name to the executable to run for it, for CLIs
	// that are not on PATH. Only the global config is honoured: a project
	// file must not be able to point dispatch at an arbitrary program.
	Binaries map[string]string `json:"binaries,omitempty"`
}

// ConfigFile is an alias for Policy.
type ConfigFile = Policy

// Rules is the persistent routing policy. An empty allow dimension does not
// restrict that dimension; deny always takes precedence.
type Rules struct {
	Providers []string `json:"providers,omitempty"`
	Models    []string `json:"models,omitempty"`
	Agents    []string `json:"agents,omitempty"`
}

// PolicyConfigPath is the config file inside a dispatch home directory.
func PolicyConfigPath(home string) string { return filepath.Join(home, "config.json") }

// LoadConfig reads path. A missing or empty file is a zero config, not an error.
func LoadConfig(path string) (Policy, error) {
	b, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return Policy{}, nil
	}
	if err != nil {
		return Policy{}, err
	}
	if len(bytes.TrimSpace(b)) == 0 {
		return Policy{}, nil
	}
	f, _, err := decodePolicy(path, b)
	return f, err
}

// ValidateConfig checks values assembled by callers before writing them.
func ValidateConfig(f Policy) error {
	switch f.Priority {
	case "", "speed", "balanced", "quality":
		return nil
	default:
		return fmt.Errorf("invalid priority %q (want speed|balanced|quality)", f.Priority)
	}
}

type policyPresent struct{ priority, allow, deny, discover, binaries bool }

// LoadAllConfig merges global and project config. Project values win by key; deny
// lists are unioned so a project cannot accidentally weaken a global deny.
func LoadAllConfig(global, project string) (Policy, error) {
	g, gp, err := loadPolicyPresent(global)
	if err != nil {
		return Policy{}, err
	}
	p, pp, err := loadPolicyPresent(project)
	if err != nil {
		return Policy{}, err
	}
	out := g
	if pp.priority {
		out.Priority = p.Priority
	}
	if pp.discover {
		out.Discover = p.Discover
	}
	if pp.allow {
		out.Allow = p.Allow
	}
	if pp.deny {
		out.Deny = unionRules(g.Deny, p.Deny)
	}
	out.Binaries = g.Binaries
	_ = gp
	return out, nil
}

func loadPolicyPresent(path string) (Policy, policyPresent, error) {
	b, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return Policy{}, policyPresent{}, nil
	}
	if err != nil {
		return Policy{}, policyPresent{}, err
	}
	if len(bytes.TrimSpace(b)) == 0 {
		return Policy{}, policyPresent{}, nil
	}
	return decodePolicy(path, b)
}

func decodePolicy(path string, b []byte) (Policy, policyPresent, error) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(b, &raw); err != nil {
		return Policy{}, policyPresent{}, fmt.Errorf("%s: %w", path, err)
	}
	if raw == nil {
		return Policy{}, policyPresent{}, fmt.Errorf("%s: config must be an object", path)
	}
	var f Policy
	var p policyPresent
	if v, ok := raw["priority"]; ok {
		p.priority = true
		if isJSONNull(v) {
			return Policy{}, p, fmt.Errorf("%s: priority must be a string", path)
		}
		if err := json.Unmarshal(v, &f.Priority); err != nil {
			return Policy{}, p, fmt.Errorf("%s: priority must be a string", path)
		}
	}
	if v, ok := raw["discover"]; ok {
		p.discover = true
		if isJSONNull(v) {
			return Policy{}, p, fmt.Errorf("%s: discover must be a boolean", path)
		}
		if err := json.Unmarshal(v, &f.Discover); err != nil {
			return Policy{}, p, fmt.Errorf("%s: discover must be a boolean", path)
		}
	}
	if v, ok := raw["allow"]; ok {
		p.allow = true
		var err error
		if f.Allow, err = decodePolicyRules(v); err != nil {
			return Policy{}, p, fmt.Errorf("%s: allow %w", path, err)
		}
	}
	if v, ok := raw["deny"]; ok {
		p.deny = true
		var err error
		if f.Deny, err = decodePolicyRules(v); err != nil {
			return Policy{}, p, fmt.Errorf("%s: deny %w", path, err)
		}
	}
	if v, ok := raw["binaries"]; ok {
		p.binaries = true
		if err := json.Unmarshal(v, &f.Binaries); err != nil {
			return Policy{}, p, fmt.Errorf("%s: binaries must be an object of agent to path", path)
		}
	}
	switch f.Priority {
	case "", "speed", "balanced", "quality":
	default:
		return Policy{}, p, fmt.Errorf("%s: invalid priority %q (want speed|balanced|quality)", path, f.Priority)
	}
	return f, p, nil
}

func decodePolicyRules(v json.RawMessage) (Rules, error) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(v, &raw); err != nil || raw == nil {
		return Rules{}, fmt.Errorf("must be an object")
	}
	var r Rules
	for key, dst := range map[string]*[]string{"providers": &r.Providers, "models": &r.Models, "agents": &r.Agents} {
		if v, ok := raw[key]; ok {
			if isJSONNull(v) {
				return Rules{}, fmt.Errorf("%s must be an array of strings", key)
			}
			if err := json.Unmarshal(v, dst); err != nil {
				return Rules{}, fmt.Errorf("%s must be an array of strings", key)
			}
		}
	}
	return r, nil
}

func isJSONNull(v json.RawMessage) bool { return bytes.Equal(bytes.TrimSpace(v), []byte("null")) }

func unionRules(a, b Rules) Rules {
	return Rules{Providers: unionStrings(a.Providers, b.Providers), Models: unionStrings(a.Models, b.Models), Agents: unionStrings(a.Agents, b.Agents)}
}

func unionStrings(a, b []string) []string {
	out := append([]string(nil), a...)
	for _, v := range b {
		if !slices.Contains(out, v) {
			out = append(out, v)
		}
	}
	return out
}

// PolicyReason explains why a provider/model/agent is excluded, or returns
// empty when it is permitted. Deny is deliberately checked first.
func PolicyReason(f Policy, provider, model, agent string) string {
	if slices.Contains(f.Deny.Providers, provider) {
		return "policy deny.providers includes " + provider
	}
	if slices.Contains(f.Deny.Models, model) {
		return "policy deny.models includes " + model
	}
	if slices.Contains(f.Deny.Agents, agent) {
		return "policy deny.agents includes " + agent
	}
	if len(f.Allow.Providers) > 0 && !slices.Contains(f.Allow.Providers, provider) {
		return "policy allow.providers requires one of " + joinPolicyStrings(f.Allow.Providers)
	}
	if len(f.Allow.Models) > 0 && !slices.Contains(f.Allow.Models, model) {
		return "policy allow.models requires one of " + joinPolicyStrings(f.Allow.Models)
	}
	if len(f.Allow.Agents) > 0 && !slices.Contains(f.Allow.Agents, agent) {
		return "policy allow.agents requires one of " + joinPolicyStrings(f.Allow.Agents)
	}
	return ""
}

func joinPolicyStrings(s []string) string {
	out := ""
	for i, v := range s {
		if i > 0 {
			out += ","
		}
		out += v
	}
	return out
}

// WriteConfig atomically updates known keys while retaining unknown JSON keys.
func WriteConfig(path string, f Policy) error {
	raw := map[string]json.RawMessage{}
	if b, err := os.ReadFile(path); err == nil && len(bytes.TrimSpace(b)) > 0 {
		if err := json.Unmarshal(b, &raw); err != nil || raw == nil {
			return fmt.Errorf("%s: invalid config", path)
		}
	} else if err != nil && !os.IsNotExist(err) {
		return err
	}
	put := func(k string, v any) error {
		b, err := json.Marshal(v)
		if err == nil {
			raw[k] = b
		}
		return err
	}
	if err := put("priority", f.Priority); err != nil {
		return err
	}
	if err := put("discover", f.Discover); err != nil {
		return err
	}
	if err := put("allow", f.Allow); err != nil {
		return err
	}
	if err := put("deny", f.Deny); err != nil {
		return err
	}
	if len(f.Binaries) > 0 {
		if err := put("binaries", f.Binaries); err != nil {
			return err
		}
	} else {
		delete(raw, "binaries")
	}
	return writePolicyRaw(path, raw)
}

// WriteConfigKey atomically replaces one known key and retains every other key.
func WriteConfigKey(path, key string, value any) error {
	raw := map[string]json.RawMessage{}
	if b, err := os.ReadFile(path); err == nil && len(bytes.TrimSpace(b)) > 0 {
		if err := json.Unmarshal(b, &raw); err != nil || raw == nil {
			return fmt.Errorf("%s: invalid config", path)
		}
	} else if err != nil && !os.IsNotExist(err) {
		return err
	}
	b, err := json.Marshal(value)
	if err != nil {
		return err
	}
	raw[key] = b
	return writePolicyRaw(path, raw)
}

func writePolicyRaw(path string, raw map[string]json.RawMessage) error {
	b, err := json.MarshalIndent(raw, "", "  ")
	if err != nil {
		return err
	}
	b = append(b, '\n')
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".config-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	defer os.Remove(name)
	if _, err = tmp.Write(b); err == nil {
		err = tmp.Chmod(0o600)
	}
	if cerr := tmp.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		return err
	}
	return os.Rename(name, path)
}
