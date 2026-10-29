package polter

import (
	"fmt"
	"sort"
	"strings"

	"github.com/polterware/polterware/backend/domains/integrations"
	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
	"github.com/polterware/polterware/backend/platform/ids"
)

// deploySpec is one env=provider:resource link before the environment name
// is resolved to an id.
type deploySpec struct {
	Env      string
	Provider string
	Resource string
}

// ParseDeploys reads a deploys: value. An empty value clears every link.
// A present value is the node's full set of links.
func ParseDeploys(value string) ([]deploySpec, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	var out []deploySpec
	seen := map[string]bool{}
	for _, part := range strings.Split(value, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		env, rest, ok := strings.Cut(part, "=")
		provider, resource, ok2 := strings.Cut(strings.TrimSpace(rest), ":")
		env = strings.TrimSpace(env)
		provider = strings.ToLower(strings.TrimSpace(provider))
		resource = strings.TrimSpace(resource)
		switch {
		case !ok || !ok2 || env == "" || provider == "" || resource == "":
			return nil, fmt.Errorf("invalid deploys %q: write env=provider:resource, or leave it empty to clear", part)
		case strings.ContainsAny(env, " \t") || strings.ContainsAny(resource, "\r\n"):
			return nil, fmt.Errorf("invalid deploys %q: environment and resource are single tokens", part)
		case strings.Contains(strings.ToLower(resource), "begin private") || strings.Contains(strings.ToLower(resource), "begin rsa"):
			return nil, fmt.Errorf("invalid deploys %q: resource names a target, never a credential", part)
		case !integrations.KnownProvider(provider):
			return nil, fmt.Errorf("unknown provider %q: use %s", provider, strings.Join(integrations.ProviderIDs(), ", "))
		case seen[env]:
			return nil, fmt.Errorf("duplicate environment %q in deploys: name each environment once", env)
		}
		seen[env] = true
		out = append(out, deploySpec{Env: env, Provider: provider, Resource: resource})
	}
	return out, nil
}

// FormatDeploys renders links in canonical form. Empty is an empty line.
func FormatDeploys(specs []deploySpec) string {
	parts := make([]string, len(specs))
	for i, spec := range specs {
		parts[i] = spec.Env + "=" + spec.Provider + ":" + spec.Resource
	}
	return strings.Join(parts, ", ")
}

// CheckDeploys reports deploys: lines that name an environment the project
// does not have. Provider shape is checked while decoding.
func CheckDeploys(doc Document, envs []work.NamedEnvironment) []Diagnostic {
	var diags []Diagnostic
	for _, node := range doc.Nodes {
		value, ok := node.MetaValue("deploys")
		if !ok || strings.TrimSpace(value) == "" {
			continue
		}
		specs, err := ParseDeploys(value)
		if err != nil {
			continue
		}
		for _, spec := range specs {
			if _, err := resolveEnvironment(envs, spec.Env); err != nil {
				diags = append(diags, Diagnostic{
					Line: node.Line, Severity: SeverityError,
					Message: err.Error(),
				})
			}
		}
	}
	return diags
}

func resolveEnvironment(envs []work.NamedEnvironment, ref string) (work.NamedEnvironment, error) {
	ref = strings.TrimSpace(ref)
	var byID *work.NamedEnvironment
	var byName []work.NamedEnvironment
	for i := range envs {
		if envs[i].ID == ref {
			byID = &envs[i]
		}
		if envs[i].Name == ref {
			byName = append(byName, envs[i])
		}
	}
	if byID != nil {
		return *byID, nil
	}
	switch len(byName) {
	case 1:
		return byName[0], nil
	case 0:
		return work.NamedEnvironment{}, fmt.Errorf("unknown environment %q: name an environment in this project", ref)
	default:
		return work.NamedEnvironment{}, fmt.Errorf("environment %q is ambiguous: use its id", ref)
	}
}

// resolveDeploys turns a deploys: line into stored links. mentioned is false
// when the line is absent. err is set when the line is present but invalid;
// the caller then skips the node.
func resolveDeploys(node StructureNode, existing []structure.Deployment, envs []work.NamedEnvironment) (next []structure.Deployment, mentioned bool, err error) {
	value, mentioned := node.MetaValue("deploys")
	if !mentioned {
		return existing, false, nil
	}
	specs, err := ParseDeploys(value)
	if err != nil {
		return existing, true, err
	}
	next = make([]structure.Deployment, 0, len(specs))
	for _, spec := range specs {
		env, err := resolveEnvironment(envs, spec.Env)
		if err != nil {
			return existing, true, err
		}
		next = append(next, structure.Deployment{
			EnvironmentID: env.ID,
			Environment:   env.Name,
			Provider:      spec.Provider,
			Resource:      spec.Resource,
		})
	}
	return assignDeployIDs(existing, next), true, nil
}

func deploysLine(node StructureNode) int {
	return metaLine(node, "deploys")
}

// metaLine is the line of the node's key: entry, or the node heading.
func metaLine(node StructureNode, key string) int {
	for _, entry := range node.Meta {
		if entry.Key == key {
			return entry.Line
		}
	}
	return node.Line
}

func assignDeployIDs(existing, next []structure.Deployment) []structure.Deployment {
	byEnv := map[string]string{}
	for _, deploy := range existing {
		if deploy.ID != "" {
			byEnv[deploy.EnvironmentID] = deploy.ID
		}
	}
	out := append([]structure.Deployment(nil), next...)
	sort.Slice(out, func(i, j int) bool { return out[i].EnvironmentID < out[j].EnvironmentID })
	for i := range out {
		if out[i].ID != "" {
			continue
		}
		if id, found := byEnv[out[i].EnvironmentID]; found {
			out[i].ID = id
			continue
		}
		out[i].ID = ids.NewULID()
	}
	return out
}

func sameDeploys(a, b []structure.Deployment) bool {
	if len(a) != len(b) {
		return false
	}
	left := append([]structure.Deployment(nil), a...)
	right := append([]structure.Deployment(nil), b...)
	sort.Slice(left, func(i, j int) bool { return left[i].EnvironmentID < left[j].EnvironmentID })
	sort.Slice(right, func(i, j int) bool { return right[i].EnvironmentID < right[j].EnvironmentID })
	for i := range left {
		if left[i].EnvironmentID != right[i].EnvironmentID || left[i].Provider != right[i].Provider || left[i].Resource != right[i].Resource {
			return false
		}
	}
	return true
}

func nonNilDeploys(values []structure.Deployment) []structure.Deployment {
	if values == nil {
		return []structure.Deployment{}
	}
	return values
}
