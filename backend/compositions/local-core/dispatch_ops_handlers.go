package localcore

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/domains/dispatch"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	"github.com/polterware/polterware/backend/providers/dispatch/adapters"
	"github.com/polterware/polterware/backend/providers/dispatch/sandbox"
	"github.com/polterware/polterware/backend/providers/dispatch/skill"
	"github.com/polterware/polterware/backend/providers/dispatch/worktree"
)

// dispatchDepsIn is dispatchDeps with the global and project routing policy
// loaded. An empty dir loads the global policy only.
func (core *Core) dispatchDepsIn(ctx context.Context, dir string) (dispatch.Deps, error) {
	deps, err := core.dispatchDeps(ctx)
	if err != nil {
		return deps, err
	}
	project := ""
	if dir != "" {
		project = filepath.Join(dir, ".dispatch", "config.json")
	}
	policy, err := dispatch.LoadAllConfig(dispatch.PolicyConfigPath(core.dispatchStateDir()), project)
	if err != nil {
		return deps, err
	}
	deps.Policy = policy
	return deps, nil
}

func jsonBody(v any) (string, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return "", internal(err)
	}
	return string(b), nil
}

func dispatchOpError(err error) error {
	if errors.Is(err, dispatch.ErrUnknownRun) || errors.Is(err, sql.ErrNoRows) {
		return connect.NewError(connect.CodeNotFound, err)
	}
	return invalid(sandbox.Redact(err.Error()))
}

func requiredRunID(id string) (string, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return "", invalid("run id is required")
	}
	return id, nil
}

func (core *Core) Route(ctx context.Context, request *connect.Request[localv1.RouteRequest]) (*connect.Response[localv1.RouteResponse], error) {
	m := request.Msg
	dir := strings.TrimSpace(m.GetDir())
	deps, err := core.dispatchDepsIn(ctx, dir)
	if err != nil {
		return nil, internal(err)
	}
	opts := dispatch.Options{
		Tier:     adapters.Tier(strings.TrimSpace(m.GetTier())),
		ReadOnly: m.GetReadOnly(),
		Dir:      dir,
		Filters: dispatch.Filters{
			Provider: strings.TrimSpace(m.GetProvider()),
			Model:    strings.TrimSpace(m.GetModel()),
			Effort:   strings.TrimSpace(m.GetEffort()),
			Agent:    strings.TrimSpace(m.GetAgent()),
			Priority: strings.TrimSpace(m.GetPriority()),
			Relax:    m.GetRelax(),
		},
	}
	if name := strings.TrimSpace(m.GetProfile()); name != "" {
		if err := core.applyDispatchProfile(&opts, name); err != nil {
			return nil, invalid(err.Error())
		}
	}
	report, err := deps.Route(ctx, opts)
	if err != nil {
		return nil, invalid(err.Error())
	}
	body, err := jsonBody(report)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&localv1.RouteResponse{Ok: len(report.Candidates) > 0, Json: body}), nil
}

// applyDispatchProfile resolves a named subagent profile for opts.Dir.
func (core *Core) applyDispatchProfile(opts *dispatch.Options, name string) error {
	profiles, err := core.dispatchProfiles(opts.Dir)
	if err != nil {
		return err
	}
	p, ok := profiles[name]
	if !ok {
		return fmt.Errorf("unknown subagent %q (have: %s)", name, strings.Join(dispatch.ProfileNames(profiles), ", "))
	}
	return dispatch.ApplyProfile(opts, name, p)
}

func (core *Core) dispatchProfiles(dir string) (map[string]dispatch.Profile, error) {
	project := ""
	if dir != "" {
		project = dispatch.ProjectProfilesPath(dir)
	}
	return dispatch.LoadAllProfiles(dispatch.GlobalProfilesPath(core.dispatchStateDir()), project)
}

func (core *Core) Classify(ctx context.Context, request *connect.Request[localv1.ClassifyRequest]) (*connect.Response[localv1.ClassifyResponse], error) {
	m := request.Msg
	tier := adapters.Tier(strings.TrimSpace(m.GetTier()))
	if tier == "" {
		tier = adapters.TierNormal
	}
	if !tier.Valid() {
		return nil, invalid("valid tier is required (easy, normal, or hard)")
	}
	prompt := strings.TrimSpace(m.GetPrompt())
	if prompt == "" && !m.GetResetModel() {
		return nil, invalid("prompt is required (or reset)")
	}
	path := filepath.Join(core.dispatchStateDir(), "classifier.json")
	out := map[string]any{}
	if m.GetResetModel() {
		if err := dispatch.ResetClassifier(path); err != nil {
			return nil, internal(errors.New("could not reset classifier"))
		}
		out["reset"], out["featureSchema"] = true, dispatch.FeatureSchema
	}
	if prompt != "" {
		model, err := dispatch.LoadClassifier(path)
		if err != nil {
			out["warning"] = "classifier unavailable; using prior"
		}
		features := dispatch.Extract(dispatch.Input{Prompt: prompt, Tier: tier, Dir: strings.TrimSpace(m.GetDir()), ReadOnly: m.GetReadOnly()})
		out["prediction"] = model.Predict(tier, features, m.GetExplain())
	}
	body, err := jsonBody(out)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&localv1.ClassifyResponse{Ok: true, Json: body}), nil
}

func (core *Core) VerifyRun(ctx context.Context, request *connect.Request[localv1.VerifyRunRequest]) (*connect.Response[localv1.VerifyRunResponse], error) {
	id, err := requiredRunID(request.Msg.GetId())
	if err != nil {
		return nil, err
	}
	deps, err := core.dispatchDepsIn(ctx, "")
	if err != nil {
		return nil, internal(err)
	}
	mu := core.dispatchRunMu(id)
	mu.Lock()
	defer mu.Unlock()
	rec, res, err := deps.VerifyRun(ctx, id)
	if err != nil {
		return nil, dispatchOpError(err)
	}
	ok := res.Status != dispatch.VerifyStatusFailed && res.Status != dispatch.VerifyStatusError
	body, err := jsonBody(map[string]any{
		"id": rec.ID, "status": rec.Status, "exitClass": rec.ExitClass,
		"verification": rec.Verification, "result": res,
	})
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&localv1.VerifyRunResponse{Ok: ok, Json: body}), nil
}

func (core *Core) MergeRun(ctx context.Context, request *connect.Request[localv1.MergeRunRequest]) (*connect.Response[localv1.MergeRunResponse], error) {
	id, err := requiredRunID(request.Msg.GetId())
	if err != nil {
		return nil, err
	}
	deps, err := core.dispatchDepsIn(ctx, "")
	if err != nil {
		return nil, internal(err)
	}
	mu := core.dispatchRunMu(id)
	mu.Lock()
	defer mu.Unlock()
	res, err := deps.Merge(ctx, id, dispatch.MergeOptions{Force: request.Msg.GetForce(), NoVerify: request.Msg.GetNoVerify()})
	if err != nil {
		return nil, dispatchOpError(err)
	}
	body, err := jsonBody(res)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&localv1.MergeRunResponse{Ok: res.OK, Json: body}), nil
}

func (core *Core) CleanRun(ctx context.Context, request *connect.Request[localv1.CleanRunRequest]) (*connect.Response[localv1.CleanRunResponse], error) {
	id, err := requiredRunID(request.Msg.GetId())
	if err != nil {
		return nil, err
	}
	deps, err := core.dispatchDepsIn(ctx, "")
	if err != nil {
		return nil, internal(err)
	}
	mu := core.dispatchRunMu(id)
	mu.Lock()
	defer mu.Unlock()
	rec, err := deps.Clean(ctx, id, request.Msg.GetForce())
	if err != nil {
		return nil, dispatchOpError(err)
	}
	body, err := jsonBody(map[string]any{"id": rec.ID, "removed": rec.Worktree})
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&localv1.CleanRunResponse{Ok: true, Json: body}), nil
}

func (core *Core) RecoverRun(ctx context.Context, request *connect.Request[localv1.RecoverRunRequest]) (*connect.Response[localv1.RecoverRunResponse], error) {
	id, err := requiredRunID(request.Msg.GetId())
	if err != nil {
		return nil, err
	}
	deps, err := core.dispatchDepsIn(ctx, "")
	if err != nil {
		return nil, internal(err)
	}
	mu := core.dispatchRunMu(id)
	mu.Lock()
	defer mu.Unlock()
	rec, stat, err := deps.Recover(ctx, id)
	if err != nil {
		return nil, dispatchOpError(err)
	}
	_ = saveRunWorktree(ctx, core.Store, rec)
	body, err := jsonBody(map[string]any{"id": rec.ID, "status": rec.Status, "diffStat": stat})
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&localv1.RecoverRunResponse{Ok: true, Json: body}), nil
}

func (core *Core) Config(ctx context.Context, request *connect.Request[localv1.ConfigRequest]) (*connect.Response[localv1.ConfigResponse], error) {
	m := request.Msg
	dir := strings.TrimSpace(m.GetDir())
	if m.GetProject() && dir == "" {
		return nil, invalid("a project directory is required for project config")
	}
	global := dispatch.PolicyConfigPath(core.dispatchStateDir())
	projectPath := ""
	if dir != "" {
		projectPath = filepath.Join(dir, ".dispatch", "config.json")
	}
	path := global
	if m.GetProject() {
		path = projectPath
	}
	action, key, values := m.GetAction(), strings.TrimSpace(m.GetKey()), m.GetValues()

	if action == "get" {
		var f dispatch.Policy
		var err error
		if m.GetProject() {
			f, err = dispatch.LoadConfig(path)
		} else {
			f, err = dispatch.LoadAllConfig(global, projectPath)
		}
		if err != nil {
			return nil, invalid(err.Error())
		}
		var v any = f
		switch key {
		case "":
		case "priority":
			v = f.Priority
		case "discover":
			v = f.Discover
		case "allow":
			v = f.Allow
		case "deny":
			v = f.Deny
		default:
			return nil, invalid("unknown config key " + key)
		}
		body, err := jsonBody(v)
		if err != nil {
			return nil, err
		}
		return connect.NewResponse(&localv1.ConfigResponse{Ok: true, Json: body}), nil
	}

	f, err := dispatch.LoadConfig(path)
	if err != nil {
		return nil, invalid(err.Error())
	}
	var writeKey string
	var value any
	switch {
	case action == "set" && key == "priority" && len(values) == 1:
		f.Priority, writeKey, value = values[0], "priority", values[0]
	case action == "set" && key == "discover" && len(values) == 1 && (values[0] == "true" || values[0] == "false"):
		f.Discover, writeKey, value = values[0] == "true", "discover", values[0] == "true"
	case strings.HasPrefix(action, "allow-") || strings.HasPrefix(action, "deny-"):
		side, op, _ := strings.Cut(action, "-")
		rules := &f.Allow
		if side == "deny" {
			rules = &f.Deny
		}
		var dst *[]string
		switch key {
		case "providers":
			dst = &rules.Providers
		case "models":
			dst = &rules.Models
		case "agents":
			dst = &rules.Agents
		default:
			return nil, invalid("rule dimension must be providers, models, or agents")
		}
		for _, v := range values {
			switch op {
			case "add":
				if !slices.Contains(*dst, v) {
					*dst = append(*dst, v)
				}
			case "rm":
				*dst = slices.DeleteFunc(*dst, func(x string) bool { return x == v })
			default:
				return nil, invalid("unknown config action " + action)
			}
		}
		writeKey, value = side, *rules
	default:
		return nil, invalid("invalid config request")
	}
	if err := dispatch.ValidateConfig(f); err != nil {
		return nil, invalid(err.Error())
	}
	if err := dispatch.WriteConfigKey(path, writeKey, value); err != nil {
		return nil, internal(err)
	}
	body, err := jsonBody(map[string]any{"path": path, "key": writeKey, "value": value})
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&localv1.ConfigResponse{Ok: true, Json: body}), nil
}

func (core *Core) Subagents(ctx context.Context, request *connect.Request[localv1.SubagentsRequest]) (*connect.Response[localv1.SubagentsResponse], error) {
	dir := strings.TrimSpace(request.Msg.GetDir())
	state := core.dispatchStateDir()
	user := dispatch.GlobalProfilesPath(state)
	respond := func(ok bool, v any) (*connect.Response[localv1.SubagentsResponse], error) {
		body, err := jsonBody(v)
		if err != nil {
			return nil, err
		}
		return connect.NewResponse(&localv1.SubagentsResponse{Ok: ok, Json: body}), nil
	}
	switch request.Msg.GetAction() {
	case "init":
		if _, err := os.Stat(user); err == nil {
			return nil, invalid(user + " already exists")
		}
		if err := os.MkdirAll(state, 0o755); err != nil {
			return nil, internal(err)
		}
		if err := os.WriteFile(user, []byte(dispatch.ProfileExample), 0o644); err != nil {
			return nil, internal(err)
		}
		return respond(true, map[string]any{"wrote": user})
	case "list", "check":
	default:
		return nil, invalid("unknown subagents action")
	}
	profiles, err := core.dispatchProfiles(dir)
	if err != nil {
		return nil, invalid(err.Error())
	}
	if request.Msg.GetAction() == "list" {
		return respond(true, map[string]any{"profiles": profiles})
	}

	deps, err := core.dispatchDepsIn(ctx, dir)
	if err != nil {
		return nil, internal(err)
	}
	known := map[string]adapters.Adapter{}
	names := map[string]bool{}
	for _, a := range adapters.Known() {
		known[a.Name()], names[a.Name()] = a, true
	}
	problems := []string{}
	for _, name := range dispatch.ProfileNames(profiles) {
		p := profiles[name]
		problems = append(problems, dispatch.ValidateProfile(name, p, names)...)
		if p.Tier != "" && len(deps.Table.Tiers[adapters.Tier(p.Tier)]) == 0 {
			problems = append(problems, fmt.Sprintf("%s: tier %q has no entries in the tier table", name, p.Tier))
		}
		for _, agent := range append(slices.Clone(p.Prefer), p.Avoid...) {
			if a, ok := known[agent]; ok {
				if _, err := exec.LookPath(a.Binary()); err != nil {
					problems = append(problems, fmt.Sprintf("%s: %s is not installed", name, agent))
				}
			}
		}
	}
	return respond(len(problems) == 0, map[string]any{"profiles": len(profiles), "problems": problems})
}

// InitVerify writes the example .dispatch/verify.json at the root of the
// repository that holds dir, like `polterware verify --init`.
func (core *Core) InitVerify(ctx context.Context, request *connect.Request[localv1.InitVerifyRequest]) (*connect.Response[localv1.InitVerifyResponse], error) {
	dir := strings.TrimSpace(request.Msg.GetDir())
	if dir == "" {
		return nil, invalid("a repository directory is required")
	}
	if root := worktree.Root(dir); root != "" {
		dir = root
	}
	path := dispatch.ConfigPath(dir)
	if _, err := os.Stat(path); err == nil {
		return nil, invalid(path + " already exists")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, internal(err)
	}
	if err := os.WriteFile(path, []byte(dispatch.VerifyExample), 0o644); err != nil {
		return nil, internal(err)
	}
	body, err := jsonBody(map[string]any{"wrote": path})
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&localv1.InitVerifyResponse{Ok: true, Json: body}), nil
}

// Skill installs the dispatch skill for the agent CLIs, or refreshes the
// copies already installed, like `polterware skill install|refresh`.
func (core *Core) Skill(ctx context.Context, request *connect.Request[localv1.SkillRequest]) (*connect.Response[localv1.SkillResponse], error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, internal(err)
	}
	m := request.Msg
	out := map[string]any{}
	switch m.GetAction() {
	case "refresh":
		paths, err := skill.Refresh(home)
		if err != nil {
			return nil, internal(err)
		}
		out["refreshed"] = paths
	case "install":
		agent := strings.TrimSpace(m.GetAgent())
		targets := skill.Targets(home)
		names := make([]string, 0, len(targets))
		for name := range targets {
			if agent == "" || agent == name {
				names = append(names, name)
			}
		}
		if len(names) == 0 {
			return nil, invalid(fmt.Sprintf("unknown agent %q", agent))
		}
		slices.Sort(names)
		installed, skipped, seen := []string{}, []string{}, map[string]bool{}
		for _, name := range names {
			dir := targets[name].Dir
			if seen[dir] {
				continue
			}
			seen[dir] = true
			path, err := skill.Install(dir, m.GetForce())
			if err != nil {
				skipped = append(skipped, fmt.Sprintf("%s: %v", name, err))
				continue
			}
			installed = append(installed, path)
		}
		out["installed"], out["skipped"] = installed, skipped
	default:
		return nil, invalid("unknown skill action: use install or refresh")
	}
	body, err := jsonBody(out)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&localv1.SkillResponse{Ok: true, Json: body}), nil
}
