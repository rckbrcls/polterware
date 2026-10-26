package dispatch

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	adapter "github.com/polterware/polterware/backend/providers/dispatch/adapters"
)

// Profile is a named delegation role: instructions, tier, read-only, timeout,
// and soft agent preferences for the router.
type Profile struct {
	Provider     string   `json:"provider,omitempty"`
	Model        string   `json:"model,omitempty"`
	Effort       string   `json:"effort,omitempty"`
	Agent        string   `json:"agent,omitempty"`
	Relax        bool     `json:"relax,omitempty"`
	Priority     string   `json:"priority,omitempty"`
	Tier         string   `json:"tier,omitempty"`
	ReadOnly     bool     `json:"readonly,omitempty"`
	Instructions string   `json:"instructions,omitempty"`
	Prefer       []string `json:"prefer,omitempty"`
	Avoid        []string `json:"avoid,omitempty"`
	Timeout      string   `json:"timeout,omitempty"`
	NoVerify     bool     `json:"noVerify,omitempty"`
}

type profileFile struct {
	Agents map[string]Profile `json:"agents"`
}

// ProfileExample is written by `polterware subagents --init`.
const ProfileExample = `{
  "agents": {
    "reviewer": {
      "tier": "hard",
      "readonly": true,
      "instructions": "Review the diff. Point out only real bugs, with file and line.",
      "timeout": "15m"
    },
    "tester": {
      "tier": "normal",
      "instructions": "Write and run tests for the described change."
    }
  }
}
`

// GlobalProfilesPath is the user-level profile file inside the dispatch state dir.
func GlobalProfilesPath(stateDir string) string { return filepath.Join(stateDir, "agents.json") }

// ProjectProfilesPath is where a repository keeps its profiles.
func ProjectProfilesPath(dir string) string { return filepath.Join(dir, ".dispatch", "agents.json") }

// LoadProfiles reads path; a missing file is an empty set.
func LoadProfiles(path string) (map[string]Profile, error) {
	b, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var f profileFile
	if err := json.Unmarshal(b, &f); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return f.Agents, nil
}

// LoadAllProfiles merges the user file with the project file; project wins.
func LoadAllProfiles(userPath, projectPath string) (map[string]Profile, error) {
	out := map[string]Profile{}
	for _, p := range []string{userPath, projectPath} {
		m, err := LoadProfiles(p)
		if err != nil {
			return nil, err
		}
		for k, v := range m {
			out[k] = v
		}
	}
	return out, nil
}

// ProfileNames returns sorted profile names.
func ProfileNames(m map[string]Profile) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// ValidateProfile reports problems with one profile. known holds agent names.
func ValidateProfile(name string, p Profile, known map[string]bool) []string {
	var out []string
	add := func(f string, a ...any) { out = append(out, name+": "+fmt.Sprintf(f, a...)) }
	if p.Effort != "" && !adapter.ValidEffort(p.Effort) {
		add("invalid effort %q", p.Effort)
	}
	if p.Priority != "" && !ValidPriority(p.Priority) {
		add("invalid priority %q (want speed|balanced|quality)", p.Priority)
	}
	if p.Agent != "" && !known[p.Agent] {
		add("unknown agent %q", p.Agent)
	}
	if p.Tier != "" && !adapter.Tier(p.Tier).Valid() {
		add("invalid tier %q (want easy|normal|hard)", p.Tier)
	}
	if p.Timeout != "" {
		if _, err := time.ParseDuration(p.Timeout); err != nil {
			add("invalid timeout %q", p.Timeout)
		}
	}
	for _, a := range p.Prefer {
		if !known[a] {
			add("prefer: unknown agent %q", a)
		}
	}
	for _, a := range p.Avoid {
		if !known[a] {
			add("avoid: unknown agent %q", a)
		}
	}
	for _, a := range p.Prefer {
		for _, b := range p.Avoid {
			if a == b {
				add("agent %q is both preferred and avoided", a)
			}
		}
	}
	if p.Provider == "" && p.Model == "" && p.Agent == "" && p.Effort == "" && p.Priority == "" && p.Instructions == "" && p.Tier == "" && len(p.Prefer) == 0 && len(p.Avoid) == 0 {
		add("empty profile")
	}
	return out
}

// ApplyProfile fills o from p. Values already set on o (explicit request
// fields) win over the profile.
func ApplyProfile(o *Options, name string, p Profile) error {
	if o.Filters.Provider == "" {
		o.Filters.Provider = p.Provider
	}
	if o.Filters.Model == "" {
		o.Filters.Model = p.Model
	}
	if o.Filters.Effort == "" {
		o.Filters.Effort = p.Effort
	}
	if o.Filters.Agent == "" {
		o.Filters.Agent = p.Agent
	}
	if !o.Filters.Relax {
		o.Filters.Relax = p.Relax
	}
	if o.Filters.Priority == "" {
		o.Filters.Priority = p.Priority
	}
	if !o.Tier.Valid() && adapter.Tier(p.Tier).Valid() {
		o.Tier = adapter.Tier(p.Tier)
	}
	o.ReadOnly = o.ReadOnly || p.ReadOnly
	o.NoVerify = o.NoVerify || p.NoVerify
	if o.Timeout == 0 && p.Timeout != "" {
		d, err := time.ParseDuration(p.Timeout)
		if err != nil {
			return fmt.Errorf("subagent %s: invalid timeout %q", name, p.Timeout)
		}
		o.Timeout = d
	}
	if p.Instructions != "" && o.Resume == "" {
		o.Prompt = p.Instructions + "\n\n" + o.Prompt
	}
	o.Profile, o.Prefer, o.Avoid = name, p.Prefer, p.Avoid
	return nil
}
