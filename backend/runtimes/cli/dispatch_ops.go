package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/domains/dispatch"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	"github.com/polterware/polterware/backend/providers/dispatch/adapters"
	"github.com/polterware/polterware/backend/providers/dispatch/hook"
	"github.com/polterware/polterware/backend/providers/dispatch/sandbox"
	"github.com/polterware/polterware/backend/providers/dispatch/skill"
	"github.com/polterware/polterware/backend/providers/dispatch/worktree"
)

const dispatchOpsUsage = `       polterware wait <id> [--timeout <dur>] [--json=false]
       polterware route [--tier <tier>] [--provider <p>] [--model <m>] [--effort <e>] [--agent <a>] [--priority speed|balanced|quality] [--relax] [--readonly] [--as <profile>] [--dir <repo>] [--json]
       polterware classify [--tier <tier>] [--dir <repo>] [--readonly] [--explain] [--reset] [--json] <prompt>
       polterware config get [priority|discover|allow|deny] [--project] [--dir <repo>]
       polterware config set priority <speed|balanced|quality> | discover <true|false> [--project]
       polterware config allow|deny add|rm providers|models|agents <value>... [--project]
       polterware doctor [--json]
       polterware verify <id> | --init
       polterware merge <id> [--force] [--no-verify]
       polterware clean <id> [--force]
       polterware recover <id>
       polterware subagents [--init|--check] [--dir <repo>]
       polterware on|off|hook
       polterware skill install [--agent <name>] [--force] | show | refresh
       polterware update [--check]`

// dispatchOpResult is the JSON body of a core operation. OK is false when the
// operation ran but reports a failure.
type dispatchOpResult struct {
	OK   bool
	JSON string
}

// dispatchOpsClient is the part of the core's DispatchService used by the
// operational commands.
type dispatchOpsClient interface {
	Route(ctx context.Context, req *localv1.RouteRequest) (dispatchOpResult, error)
	Classify(ctx context.Context, req *localv1.ClassifyRequest) (dispatchOpResult, error)
	VerifyRun(ctx context.Context, id string) (dispatchOpResult, error)
	MergeRun(ctx context.Context, req *localv1.MergeRunRequest) (dispatchOpResult, error)
	CleanRun(ctx context.Context, req *localv1.CleanRunRequest) (dispatchOpResult, error)
	RecoverRun(ctx context.Context, id string) (dispatchOpResult, error)
	Config(ctx context.Context, req *localv1.ConfigRequest) (dispatchOpResult, error)
	Subagents(ctx context.Context, req *localv1.SubagentsRequest) (dispatchOpResult, error)
}

func (c *connectDispatchClient) Route(ctx context.Context, req *localv1.RouteRequest) (dispatchOpResult, error) {
	res, err := c.svc.Route(ctx, connect.NewRequest(req))
	if err != nil {
		return dispatchOpResult{}, wrapDispatchError(err)
	}
	return dispatchOpResult{OK: res.Msg.GetOk(), JSON: res.Msg.GetJson()}, nil
}

func (c *connectDispatchClient) Classify(ctx context.Context, req *localv1.ClassifyRequest) (dispatchOpResult, error) {
	res, err := c.svc.Classify(ctx, connect.NewRequest(req))
	if err != nil {
		return dispatchOpResult{}, wrapDispatchError(err)
	}
	return dispatchOpResult{OK: res.Msg.GetOk(), JSON: res.Msg.GetJson()}, nil
}

func (c *connectDispatchClient) VerifyRun(ctx context.Context, id string) (dispatchOpResult, error) {
	res, err := c.svc.VerifyRun(ctx, connect.NewRequest(&localv1.VerifyRunRequest{Id: id}))
	if err != nil {
		return dispatchOpResult{}, wrapDispatchError(err)
	}
	return dispatchOpResult{OK: res.Msg.GetOk(), JSON: res.Msg.GetJson()}, nil
}

func (c *connectDispatchClient) MergeRun(ctx context.Context, req *localv1.MergeRunRequest) (dispatchOpResult, error) {
	res, err := c.svc.MergeRun(ctx, connect.NewRequest(req))
	if err != nil {
		return dispatchOpResult{}, wrapDispatchError(err)
	}
	return dispatchOpResult{OK: res.Msg.GetOk(), JSON: res.Msg.GetJson()}, nil
}

func (c *connectDispatchClient) CleanRun(ctx context.Context, req *localv1.CleanRunRequest) (dispatchOpResult, error) {
	res, err := c.svc.CleanRun(ctx, connect.NewRequest(req))
	if err != nil {
		return dispatchOpResult{}, wrapDispatchError(err)
	}
	return dispatchOpResult{OK: res.Msg.GetOk(), JSON: res.Msg.GetJson()}, nil
}

func (c *connectDispatchClient) RecoverRun(ctx context.Context, id string) (dispatchOpResult, error) {
	res, err := c.svc.RecoverRun(ctx, connect.NewRequest(&localv1.RecoverRunRequest{Id: id}))
	if err != nil {
		return dispatchOpResult{}, wrapDispatchError(err)
	}
	return dispatchOpResult{OK: res.Msg.GetOk(), JSON: res.Msg.GetJson()}, nil
}

func (c *connectDispatchClient) Config(ctx context.Context, req *localv1.ConfigRequest) (dispatchOpResult, error) {
	res, err := c.svc.Config(ctx, connect.NewRequest(req))
	if err != nil {
		return dispatchOpResult{}, wrapDispatchError(err)
	}
	return dispatchOpResult{OK: res.Msg.GetOk(), JSON: res.Msg.GetJson()}, nil
}

func (c *connectDispatchClient) Subagents(ctx context.Context, req *localv1.SubagentsRequest) (dispatchOpResult, error) {
	res, err := c.svc.Subagents(ctx, connect.NewRequest(req))
	if err != nil {
		return dispatchOpResult{}, wrapDispatchError(err)
	}
	return dispatchOpResult{OK: res.Msg.GetOk(), JSON: res.Msg.GetJson()}, nil
}

// dialDispatchOps dials the core for the operational commands.
func dialDispatchOps(dbPath string) (dispatchOpsClient, error) {
	client, _, err := dialDispatch(dbPath, "")
	if err != nil {
		return nil, err
	}
	ops, ok := client.(dispatchOpsClient)
	if !ok {
		return nil, errors.New("dispatch client does not support operational commands")
	}
	return ops, nil
}

// printDispatchOp prints an operation body and turns a reported failure into
// exit status 1 after the body is shown.
func printDispatchOp(res dispatchOpResult) error {
	var v any
	if err := json.Unmarshal([]byte(res.JSON), &v); err != nil {
		return err
	}
	if err := writeJSON(v); err != nil {
		return err
	}
	if !res.OK {
		return exitError{code: 1}
	}
	return nil
}

func dispatchStateDir(dbPath string) string {
	if strings.TrimSpace(dbPath) == "" {
		dbPath = defaultDB()
	}
	return filepath.Join(filepath.Dir(dbPath), "dispatch")
}

func dispatchWD(dir string) (string, error) {
	if strings.TrimSpace(dir) != "" {
		return filepath.Abs(dir)
	}
	return os.Getwd()
}

func singleRunID(flags *flag.FlagSet, args []string, verb string) (string, error) {
	positional, err := parseInterspersed(flags, args)
	if err != nil {
		return "", err
	}
	if len(positional) != 1 || strings.TrimSpace(positional[0]) == "" {
		return "", fmt.Errorf("dispatch %s needs one run id\n%s", verb, dispatchOpsUsage)
	}
	return strings.TrimSpace(positional[0]), nil
}

func isTerminalDispatchRun(status string) bool {
	switch status {
	case dispatch.StatusCompleted, dispatch.StatusFailed, dispatch.StatusCancelled, dispatch.StatusTimedOut, dispatch.StatusOrphaned:
		return true
	}
	return false
}

// dispatchExitCode maps a terminal status to the exit status of wait.
func dispatchExitCode(status string) int {
	switch status {
	case dispatch.StatusCompleted:
		return 0
	case dispatch.StatusTimedOut:
		return 124
	default:
		return 1
	}
}

func runDispatchWait(dbPath string, args []string) error {
	flags := flag.NewFlagSet("dispatch wait", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	timeout := flags.Duration("timeout", 0, "stop waiting after this long (0 = no limit)")
	asJSON := flags.Bool("json", true, "print compact summary JSON; --json=false prints text")
	projectID := flags.String("project", "", "project id (default: project containing the cwd)")
	id, err := singleRunID(flags, args, "wait")
	if err != nil {
		return err
	}
	client, _, err := dialDispatch(dbPath, *projectID)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if *timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, *timeout)
		defer cancel()
	}
	tick := time.NewTicker(500 * time.Millisecond)
	defer tick.Stop()
	for {
		run, err := client.GetRun(ctx, id)
		if err != nil && ctx.Err() == nil {
			return err
		}
		if err == nil && isTerminalDispatchRun(run.Status) {
			if err := writeDispatchRun(run, *asJSON, true); err != nil {
				return err
			}
			if code := dispatchExitCode(run.Status); code != 0 {
				return exitError{code: code}
			}
			return nil
		}
		select {
		case <-ctx.Done():
			// Still running when we stopped waiting.
			if latest, lerr := client.GetRun(context.Background(), id); lerr == nil {
				_ = writeDispatchRun(latest, *asJSON, true)
			}
			return exitError{code: 3}
		case <-tick.C:
		}
	}
}

func runDispatchRoute(dbPath string, args []string) error {
	flags := flag.NewFlagSet("dispatch route", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	req := &localv1.RouteRequest{}
	flags.StringVar(&req.Tier, "tier", "", "difficulty tier: easy|normal|hard")
	flags.StringVar(&req.Provider, "provider", "", "restrict to a provider")
	flags.StringVar(&req.Model, "model", "", "restrict to a model")
	flags.StringVar(&req.Effort, "effort", "", "restrict to an effort: low|medium|high|xhigh")
	flags.StringVar(&req.Agent, "agent", "", "restrict to an agent")
	flags.StringVar(&req.Priority, "priority", "", "speed|balanced|quality")
	flags.BoolVar(&req.Relax, "relax", false, "fall back to tier routing when filters match nothing")
	flags.BoolVar(&req.ReadOnly, "readonly", false, "require read-only capability")
	flags.StringVar(&req.Profile, "as", "", "subagent profile")
	flags.StringVar(&req.Dir, "dir", "", "repository (default: current directory)")
	asJSON := flags.Bool("json", false, "print the full report as JSON")
	positional, err := parseInterspersed(flags, args)
	if err != nil {
		return err
	}
	if len(positional) != 0 {
		return errors.New(dispatchOpsUsage)
	}
	if req.Dir, err = dispatchWD(req.Dir); err != nil {
		return err
	}
	client, err := dialDispatchOps(dbPath)
	if err != nil {
		return err
	}
	res, err := client.Route(context.Background(), req)
	if err != nil {
		return err
	}
	if *asJSON {
		return printDispatchOp(res)
	}
	var report dispatch.RouteReport
	if err := json.Unmarshal([]byte(res.JSON), &report); err != nil {
		return err
	}
	if report.Winner == nil {
		fmt.Println(report.Reason)
		for _, e := range report.Eliminated {
			fmt.Println("  -", e)
		}
		return exitError{code: 1}
	}
	fmt.Printf("winner: %s/%s effort=%s priority=%s\n", report.Winner.Agent, report.Winner.Model, dispatchOrUnknown(report.Winner.Effort), report.Winner.Priority)
	fmt.Println("reason:", report.Reason)
	for i, c := range report.Candidates {
		fmt.Printf("  %d. %s/%s score=%.2f  %s\n", i+1, c.Filters.Agent, c.Filters.Model, c.Score, c.Reason)
	}
	for _, e := range report.Eliminated {
		fmt.Println("  eliminated:", e)
	}
	if report.Note != "" {
		fmt.Println("note:", report.Note)
	}
	return nil
}

func runDispatchClassify(dbPath string, args []string) error {
	flags := flag.NewFlagSet("dispatch classify", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	req := &localv1.ClassifyRequest{}
	flags.StringVar(&req.Tier, "tier", "normal", "requested tier: easy|normal|hard")
	flags.StringVar(&req.Dir, "dir", "", "repository for cited paths (default: current directory)")
	flags.BoolVar(&req.ReadOnly, "readonly", false, "read-only task context")
	flags.BoolVar(&req.Explain, "explain", false, "show every normalized feature and contribution")
	flags.BoolVar(&req.ResetModel, "reset", false, "reset all tier weights and counts to the prior")
	asJSON := flags.Bool("json", false, "print JSON")
	positional, err := parseInterspersed(flags, args)
	if err != nil {
		return err
	}
	req.Prompt = strings.TrimSpace(strings.Join(positional, " "))
	if req.Prompt == "" && !req.ResetModel {
		return errors.New("dispatch classify needs a prompt (or --reset)")
	}
	if req.Dir, err = dispatchWD(req.Dir); err != nil {
		return err
	}
	client, err := dialDispatchOps(dbPath)
	if err != nil {
		return err
	}
	res, err := client.Classify(context.Background(), req)
	if err != nil {
		return err
	}
	if *asJSON {
		return printDispatchOp(res)
	}
	var body struct {
		Reset      bool                 `json:"reset"`
		Warning    string               `json:"warning"`
		Prediction *dispatch.Prediction `json:"prediction"`
	}
	if err := json.Unmarshal([]byte(res.JSON), &body); err != nil {
		return err
	}
	if body.Reset {
		fmt.Println("classifier reset to prior")
	}
	if body.Warning != "" {
		fmt.Fprintln(os.Stderr, "classify:", body.Warning)
	}
	if p := body.Prediction; p != nil {
		fmt.Printf("tier=%s score=%.3f requested=%s samples=%d featureSchema=%d\n", p.SuggestedTier, p.Score, p.RequestedTier, p.Samples, p.FeatureSchema)
		for _, r := range p.Reasons {
			fmt.Printf("  %s value=%.3f weight=%+.3f contribution=%+.3f\n", r.Feature, r.Value, r.Weight, r.Contribution)
		}
	}
	return nil
}

func runDispatchConfig(dbPath string, args []string) error {
	usage := errors.New("usage: polterware config get [key] | set priority|discover <value> | allow|deny add|rm providers|models|agents <value>... [--project]")
	flags := flag.NewFlagSet("dispatch config", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	project := flags.Bool("project", false, "read/write <repo>/.dispatch/config.json")
	dir := flags.String("dir", "", "repository (default: current directory)")
	positional, err := parseInterspersed(flags, args)
	if err != nil {
		return err
	}
	if len(positional) == 0 {
		return usage
	}
	req := &localv1.ConfigRequest{Project: *project}
	if req.Dir, err = dispatchWD(*dir); err != nil {
		return err
	}
	switch positional[0] {
	case "get":
		req.Action = "get"
		if len(positional) > 1 {
			req.Key = positional[1]
		}
	case "set":
		if len(positional) != 3 {
			return usage
		}
		req.Action, req.Key, req.Values = "set", positional[1], positional[2:]
	case "allow", "deny":
		if len(positional) < 4 || (positional[1] != "add" && positional[1] != "rm") {
			return usage
		}
		req.Action, req.Key, req.Values = positional[0]+"-"+positional[1], positional[2], positional[3:]
	default:
		return usage
	}
	client, err := dialDispatchOps(dbPath)
	if err != nil {
		return err
	}
	res, err := client.Config(context.Background(), req)
	if err != nil {
		return err
	}
	return printDispatchOp(res)
}

func runDispatchDoctor(dbPath string, args []string) error {
	flags := flag.NewFlagSet("dispatch doctor", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	asJSON := flags.Bool("json", false, "print JSON")
	positional, err := parseInterspersed(flags, args)
	if err != nil {
		return err
	}
	if len(positional) != 0 {
		return errors.New(dispatchOpsUsage)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	reports := adapters.Doctor(ctx)

	var tableProblems []string
	if client, _, err := dialDispatch(dbPath, ""); err == nil {
		if rows, err := client.ListTiers(ctx); err != nil {
			tableProblems = []string{err.Error()}
		} else {
			tableProblems = dispatch.TableFromRows(rows).CapabilityProblems(adapters.Known())
		}
	}
	for i := range reports {
		if len(tableProblems) > 0 {
			reports[i].Status = adapters.StatusDegraded
			reports[i].Notes = append(reports[i].Notes, tableProblems...)
		}
	}
	if *asJSON {
		return writeJSON(reports)
	}
	if len(reports) == 0 {
		fmt.Println("no installed agent CLIs")
		return nil
	}
	for _, r := range reports {
		fmt.Printf("%-12s %-14s %s\n", r.Name, dispatchOrUnknown(r.Version), r.Status)
		var have, miss []string
		for _, f := range r.Flags {
			if f.Present {
				have = append(have, f.Name)
			} else {
				miss = append(miss, f.Name)
			}
		}
		if len(have) > 0 {
			fmt.Printf("  flags: %s\n", strings.Join(have, " "))
		}
		if len(miss) > 0 {
			fmt.Printf("  missing: %s\n", strings.Join(miss, " "))
		}
		for _, n := range r.Notes {
			fmt.Printf("  note: %s\n", sandbox.Redact(n))
		}
	}
	return nil
}

func runDispatchVerify(dbPath string, args []string) error {
	flags := flag.NewFlagSet("dispatch verify", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	initFile := flags.Bool("init", false, "write an example .dispatch/verify.json in the current repository")
	positional, err := parseInterspersed(flags, args)
	if err != nil {
		return err
	}
	if *initFile {
		if len(positional) != 0 {
			return errors.New("dispatch verify --init does not take a run id")
		}
		dir, err := os.Getwd()
		if err != nil {
			return err
		}
		if root := worktree.Root(dir); root != "" {
			dir = root
		}
		path := dispatch.ConfigPath(dir)
		if _, err := os.Stat(path); err == nil {
			return fmt.Errorf("%s already exists", path)
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(path, []byte(dispatch.VerifyExample), 0o644); err != nil {
			return err
		}
		fmt.Println("wrote", path)
		return nil
	}
	if len(positional) != 1 {
		return errors.New("dispatch verify needs one run id (or --init)")
	}
	client, err := dialDispatchOps(dbPath)
	if err != nil {
		return err
	}
	res, err := client.VerifyRun(context.Background(), strings.TrimSpace(positional[0]))
	if err != nil {
		return err
	}
	return printDispatchOp(res)
}

func runDispatchMerge(dbPath string, args []string) error {
	flags := flag.NewFlagSet("dispatch merge", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	force := flags.Bool("force", false, "merge even when verification failed")
	noVerify := flags.Bool("no-verify", false, "skip post-merge verification")
	id, err := singleRunID(flags, args, "merge")
	if err != nil {
		return err
	}
	client, err := dialDispatchOps(dbPath)
	if err != nil {
		return err
	}
	res, err := client.MergeRun(context.Background(), &localv1.MergeRunRequest{Id: id, Force: *force, NoVerify: *noVerify})
	if err != nil {
		return err
	}
	return printDispatchOp(res)
}

func runDispatchClean(dbPath string, args []string) error {
	flags := flag.NewFlagSet("dispatch clean", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	force := flags.Bool("force", false, "discard even if the branch is not merged")
	id, err := singleRunID(flags, args, "clean")
	if err != nil {
		return err
	}
	client, err := dialDispatchOps(dbPath)
	if err != nil {
		return err
	}
	res, err := client.CleanRun(context.Background(), &localv1.CleanRunRequest{Id: id, Force: *force})
	if err != nil {
		return err
	}
	return printDispatchOp(res)
}

func runDispatchRecover(dbPath string, args []string) error {
	flags := flag.NewFlagSet("dispatch recover", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	id, err := singleRunID(flags, args, "recover")
	if err != nil {
		return err
	}
	client, err := dialDispatchOps(dbPath)
	if err != nil {
		return err
	}
	res, err := client.RecoverRun(context.Background(), id)
	if err != nil {
		return err
	}
	return printDispatchOp(res)
}

func runDispatchSubagents(dbPath string, args []string) error {
	flags := flag.NewFlagSet("dispatch subagents", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	initFile := flags.Bool("init", false, "write an example agents.json to edit")
	check := flags.Bool("check", false, "validate profiles against known and installed agents")
	dir := flags.String("dir", "", "repository (default: current directory)")
	positional, err := parseInterspersed(flags, args)
	if err != nil {
		return err
	}
	if len(positional) != 0 || (*initFile && *check) {
		return errors.New(dispatchOpsUsage)
	}
	action := "list"
	switch {
	case *initFile:
		action = "init"
	case *check:
		action = "check"
	}
	wd, err := dispatchWD(*dir)
	if err != nil {
		return err
	}
	client, err := dialDispatchOps(dbPath)
	if err != nil {
		return err
	}
	res, err := client.Subagents(context.Background(), &localv1.SubagentsRequest{Action: action, Dir: wd})
	if err != nil {
		return err
	}
	if action == "check" {
		var body struct {
			Profiles int      `json:"profiles"`
			Problems []string `json:"problems"`
		}
		if err := json.Unmarshal([]byte(res.JSON), &body); err != nil {
			return err
		}
		if len(body.Problems) == 0 {
			fmt.Printf("ok: %d subagent(s)\n", body.Profiles)
			return nil
		}
		for _, p := range body.Problems {
			fmt.Println("!", p)
		}
		return exitError{code: 1}
	}
	return printDispatchOp(res)
}

// --- on / off / hook / skill / update (local, no core) ---

func runDispatchOn(dbPath string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	stateDir := dispatchStateDir(dbPath)
	if err := hook.SetEnabled(stateDir, true); err != nil {
		return err
	}
	settings := hook.SettingsPath("")
	if err := hook.Install(settings, exe); err != nil {
		return err
	}
	fmt.Println("dispatch on: SessionStart hook registered in", settings)
	return nil
}

func runDispatchOff(dbPath string) error {
	if err := hook.SetEnabled(dispatchStateDir(dbPath), false); err != nil {
		return err
	}
	settings := hook.SettingsPath("")
	if err := hook.Uninstall(settings); err != nil {
		return err
	}
	fmt.Println("dispatch off: SessionStart hook removed from", settings)
	return nil
}

// runDispatchHook is the SessionStart hook target. It prints one line of
// context while dispatch is on and nothing otherwise, so a stale hook is
// harmless.
func runDispatchHook(dbPath string) error {
	if hook.IsEnabled(dispatchStateDir(dbPath)) {
		fmt.Print(hook.ContextBlock())
	}
	return nil
}

func runDispatchSkill(args []string) error {
	usage := errors.New("usage: polterware skill install [--agent <name>] [--force] | show | refresh")
	if len(args) == 0 {
		return usage
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	targets := skill.Targets(home)
	switch args[0] {
	case "show":
		fmt.Print(string(skill.Content))
		return nil
	case "refresh":
		paths, err := skill.Refresh(home)
		for _, p := range paths {
			fmt.Println("refreshed", p)
		}
		if err == nil && len(paths) == 0 {
			fmt.Println("no installed dispatch skill to refresh")
		}
		return err
	case "install":
		flags := flag.NewFlagSet("dispatch skill install", flag.ContinueOnError)
		flags.SetOutput(os.Stderr)
		agent := flags.String("agent", "", "install for one agent (claude|cursor|codex|grok|antigravity); default all")
		force := flags.Bool("force", false, "overwrite an existing skill")
		if err := flags.Parse(args[1:]); err != nil {
			return err
		}
		names := make([]string, 0, len(targets))
		for name := range targets {
			if *agent == "" || *agent == name {
				names = append(names, name)
			}
		}
		if len(names) == 0 {
			return fmt.Errorf("unknown agent %q", *agent)
		}
		sort.Strings(names)
		seen := map[string]bool{}
		for _, name := range names {
			dir := targets[name].Dir
			if seen[dir] {
				continue
			}
			seen[dir] = true
			path, err := skill.Install(dir, *force)
			if err != nil {
				fmt.Fprintf(os.Stderr, "skip %s: %v\n", name, err)
				continue
			}
			fmt.Println("installed", path)
		}
		return nil
	default:
		return usage
	}
}

// runDispatchUpdate explains where updates come from: the CLI is the
// Desktop's bundled core, so it has no updater of its own.
func runDispatchUpdate(args []string) error {
	flags := flag.NewFlagSet("dispatch update", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	_ = flags.Bool("check", false, "report only")
	if err := flags.Parse(args); err != nil {
		return err
	}
	fmt.Println("polterware ships inside the Polterware binary and has no updater of its own.")
	fmt.Println("Update Polterware (the Desktop checks its signed update feed), then run `polterware skill refresh`.")
	return nil
}
