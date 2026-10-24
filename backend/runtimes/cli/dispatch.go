package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"golang.org/x/term"

	"github.com/polterware/polterware/backend/domains/dispatch"
)

const dispatchUsage = `usage: polterware dispatch run --tier <easy|normal|hard> [--card <slug>] [--agent <name>] [--worktree <dir>] [--json] [--compact] <prompt>
       polterware dispatch ls [--json] [--compact]
       polterware dispatch status <id> [--json] [--compact]
       polterware dispatch result <id> [--section summary|agent|verification|files|attempts|meta|output] [--offset <n>] [--limit <n>] [--json] [--compact]
       polterware dispatch cancel <id> [--json] [--compact]
       polterware dispatch tiers [--check] [--json] [--compact]
       polterware dispatch stats [--json] [--compact]
       polterware dispatch agents [--json] [--compact]`

type dispatchRunSummary struct {
	ID           string            `json:"id"`
	ProjectID    string            `json:"project_id,omitempty"`
	Status       string            `json:"status"`
	Tier         string            `json:"tier,omitempty"`
	Agent        string            `json:"agent,omitempty"`
	Model        string            `json:"model,omitempty"`
	Provider     string            `json:"provider,omitempty"`
	Effort       string            `json:"effort,omitempty"`
	CardSlug     string            `json:"card_slug,omitempty"`
	AgentRunID   string            `json:"agent_run_id,omitempty"`
	Branch       string            `json:"branch,omitempty"`
	Worktree     string            `json:"worktree,omitempty"`
	Verification string            `json:"verification,omitempty"`
	Attempts     int               `json:"attempts"`
	ExitClass    string            `json:"exit_class,omitempty"`
	QueuedMs     *int64            `json:"queued_ms,omitempty"`
	RunMs        *int64            `json:"run_ms,omitempty"`
	VerifyMs     *int64            `json:"verify_ms,omitempty"`
	FilesChanged *int              `json:"files_changed,omitempty"`
	Insertions   *int              `json:"insertions,omitempty"`
	Deletions    *int              `json:"deletions,omitempty"`
	Error        string            `json:"error,omitempty"`
	Note         string            `json:"note,omitempty"`
	Details      map[string]string `json:"details"`
}

func runDispatch(dbPath string, args []string) error {
	if len(args) == 0 {
		return errors.New(dispatchUsage)
	}
	sub, rest := args[0], args[1:]
	switch sub {
	case "run":
		return runDispatchRun(dbPath, rest)
	case "ls":
		return runDispatchList(dbPath, rest)
	case "status":
		return runDispatchStatus(dbPath, rest)
	case "result":
		return runDispatchResult(dbPath, rest)
	case "cancel":
		return runDispatchCancel(dbPath, rest)
	case "tiers":
		return runDispatchTiers(dbPath, rest)
	case "stats":
		return runDispatchStats(dbPath, rest)
	case "agents":
		return runDispatchAgents(dbPath, rest)
	default:
		return errors.New(dispatchUsage)
	}
}

func runDispatchRun(dbPath string, args []string) error {
	flags := flag.NewFlagSet("dispatch run", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	tier := flags.String("tier", "", "difficulty tier: easy|normal|hard")
	card := flags.String("card", "", "optional Work card slug")
	agent := flags.String("agent", "", "optional agent pin")
	worktree := flags.String("worktree", "", "optional worktree path")
	projectID := flags.String("project", "", "project id (default: project containing the cwd)")
	asJSON := flags.Bool("json", false, "print one JSON object")
	compact := flags.Bool("compact", false, "compact output")
	positional, err := parseInterspersed(flags, args)
	if err != nil {
		return err
	}
	if !validDispatchTier(*tier) {
		return errors.New(dispatchUsage)
	}
	prompt, err := readDispatchPrompt(positional)
	if err != nil {
		return err
	}
	client, project, err := dialDispatch(dbPath, *projectID)
	if err != nil {
		return err
	}
	run, err := client.StartRun(context.Background(), dispatchStartRequest{
		ProjectID:    project,
		Tier:         *tier,
		CardSlug:     strings.TrimSpace(*card),
		Agent:        strings.TrimSpace(*agent),
		Worktree:     strings.TrimSpace(*worktree),
		Prompt:       prompt,
		SessionID:    os.Getenv(envSession),
		SessionLabel: os.Getenv(envAgentLabel),
	})
	if err != nil {
		return err
	}
	return writeDispatchRun(run, *asJSON, *compact)
}

func runDispatchList(dbPath string, args []string) error {
	flags := flag.NewFlagSet("dispatch ls", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	limit := flags.Int("limit", 20, "max runs to list")
	projectID := flags.String("project", "", "project id (default: project containing the cwd)")
	asJSON := flags.Bool("json", false, "print one JSON object")
	compact := flags.Bool("compact", false, "compact output")
	positional, err := parseInterspersed(flags, args)
	if err != nil {
		return err
	}
	if len(positional) != 0 {
		return errors.New(dispatchUsage)
	}
	client, project, err := dialDispatch(dbPath, *projectID)
	if err != nil {
		return err
	}
	runs, err := client.ListRuns(context.Background(), dispatchListRunsRequest{
		ProjectID: project,
		Limit:     *limit,
	})
	if err != nil {
		return err
	}
	if *asJSON {
		return writeDispatchJSON(map[string]any{"runs": runs}, *compact)
	}
	if len(runs) == 0 {
		fmt.Println("no dispatch runs")
		return nil
	}
	for _, r := range runs {
		fmt.Printf("%s  %-10s  %-6s  %s/%s  %s\n",
			shortID(r.ID), r.Status, dispatchOrUnknown(r.Tier),
			dispatchOrUnknown(r.Agent), dispatchOrUnknown(r.Model),
			oneLine(r.Prompt))
	}
	return nil
}

func runDispatchStatus(dbPath string, args []string) error {
	flags := flag.NewFlagSet("dispatch status", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	projectID := flags.String("project", "", "project id (default: project containing the cwd)")
	asJSON := flags.Bool("json", false, "print one JSON object")
	compact := flags.Bool("compact", false, "compact output")
	positional, err := parseInterspersed(flags, args)
	if err != nil {
		return err
	}
	if len(positional) != 1 || strings.TrimSpace(positional[0]) == "" {
		return errors.New(dispatchUsage)
	}
	client, _, err := dialDispatch(dbPath, *projectID)
	if err != nil {
		return err
	}
	run, err := client.GetRun(context.Background(), strings.TrimSpace(positional[0]))
	if err != nil {
		return err
	}
	return writeDispatchRun(run, *asJSON, *compact)
}

func runDispatchResult(dbPath string, args []string) error {
	flags := flag.NewFlagSet("dispatch result", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	section := flags.String("section", "summary", "summary|agent|verification|files|attempts|meta|output")
	offset := flags.Int("offset", 0, "first line offset")
	limit := flags.Int("limit", 200, "max lines (0 = all)")
	projectID := flags.String("project", "", "project id (default: project containing the cwd)")
	asJSON := flags.Bool("json", false, "print one JSON object")
	compact := flags.Bool("compact", false, "compact output")
	positional, err := parseInterspersed(flags, args)
	if err != nil {
		return err
	}
	if len(positional) != 1 || strings.TrimSpace(positional[0]) == "" || !validDispatchSection(*section) {
		return errors.New(dispatchUsage)
	}
	client, _, err := dialDispatch(dbPath, *projectID)
	if err != nil {
		return err
	}
	res, err := client.Result(context.Background(), dispatchResultRequest{
		RunID:   strings.TrimSpace(positional[0]),
		Section: *section,
		Offset:  *offset,
		Limit:   *limit,
	})
	if err != nil {
		return err
	}
	return writeDispatchResult(res, *asJSON, *compact)
}

func runDispatchCancel(dbPath string, args []string) error {
	flags := flag.NewFlagSet("dispatch cancel", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	projectID := flags.String("project", "", "project id (default: project containing the cwd)")
	asJSON := flags.Bool("json", false, "print one JSON object")
	compact := flags.Bool("compact", false, "compact output")
	positional, err := parseInterspersed(flags, args)
	if err != nil {
		return err
	}
	if len(positional) != 1 || strings.TrimSpace(positional[0]) == "" {
		return errors.New(dispatchUsage)
	}
	client, _, err := dialDispatch(dbPath, *projectID)
	if err != nil {
		return err
	}
	run, err := client.CancelRun(context.Background(), strings.TrimSpace(positional[0]))
	if err != nil {
		return err
	}
	return writeDispatchRun(run, *asJSON, *compact)
}

func runDispatchTiers(dbPath string, args []string) error {
	flags := flag.NewFlagSet("dispatch tiers", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	check := flags.Bool("check", false, "validate tiers against installed agents and models")
	projectID := flags.String("project", "", "project id (default: project containing the cwd)")
	asJSON := flags.Bool("json", false, "print one JSON object")
	compact := flags.Bool("compact", false, "compact output")
	positional, err := parseInterspersed(flags, args)
	if err != nil {
		return err
	}
	if len(positional) != 0 {
		return errors.New(dispatchUsage)
	}
	client, _, err := dialDispatch(dbPath, *projectID)
	if err != nil {
		return err
	}
	ctx := context.Background()
	if *check {
		res, err := client.CheckTiers(ctx)
		if err != nil {
			return err
		}
		if *asJSON {
			return writeDispatchJSON(res, *compact)
		}
		if len(res.Problems) == 0 {
			fmt.Println("ok: every tier entry resolves to an installed agent and model")
			return nil
		}
		for _, p := range res.Problems {
			fmt.Println("!", p)
		}
		return exitError{code: 1}
	}
	tiers, err := client.ListTiers(ctx)
	if err != nil {
		return err
	}
	if *asJSON {
		return writeDispatchJSON(map[string]any{"tiers": tiers}, *compact)
	}
	if len(tiers) == 0 {
		fmt.Println("no dispatch tiers")
		return nil
	}
	for _, t := range tiers {
		fmt.Printf("%-6s  %-12s  %-24s  provider=%s  speed=%d  strength=%d\n",
			t.Name, t.Agent, t.Model, dispatchOrUnknown(t.Provider), t.Speed, t.Strength)
	}
	return nil
}

func runDispatchStats(dbPath string, args []string) error {
	flags := flag.NewFlagSet("dispatch stats", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	by := flags.String("by", "model", "group by: model|agent|provider|tier|effort")
	since := flags.String("since", "7d", "window such as 7d, 24h, or all")
	projectID := flags.String("project", "", "project id (default: project containing the cwd)")
	asJSON := flags.Bool("json", false, "print one JSON object")
	compact := flags.Bool("compact", false, "compact output")
	positional, err := parseInterspersed(flags, args)
	if err != nil {
		return err
	}
	if len(positional) != 0 {
		return errors.New(dispatchUsage)
	}
	client, project, err := dialDispatch(dbPath, *projectID)
	if err != nil {
		return err
	}
	res, err := client.Stats(context.Background(), dispatchStatsRequest{
		ProjectID: project,
		By:        *by,
		Since:     *since,
	})
	if err != nil {
		return err
	}
	if *asJSON {
		return writeDispatchJSON(res, *compact)
	}
	if len(res.Rows) == 0 {
		fmt.Println("no dispatch runs in window")
		return nil
	}
	for _, row := range res.Rows {
		fmt.Printf("%-24s  runs=%d  ok=%.0f%%  p50=%s  fallbacks=%d\n",
			row.Key, row.Runs, row.SuccessPct, formatDispatchMs(row.P50Ms), row.Fallbacks)
	}
	return nil
}

func runDispatchAgents(dbPath string, args []string) error {
	flags := flag.NewFlagSet("dispatch agents", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	projectID := flags.String("project", "", "project id (default: project containing the cwd)")
	asJSON := flags.Bool("json", false, "print one JSON object")
	compact := flags.Bool("compact", false, "compact output")
	positional, err := parseInterspersed(flags, args)
	if err != nil {
		return err
	}
	if len(positional) != 0 {
		return errors.New(dispatchUsage)
	}
	client, _, err := dialDispatch(dbPath, *projectID)
	if err != nil {
		return err
	}
	agents, err := client.ListAgents(context.Background())
	if err != nil {
		return err
	}
	if *asJSON {
		return writeDispatchJSON(map[string]any{"agents": agents}, *compact)
	}
	if len(agents) == 0 {
		fmt.Println("no dispatch agents")
		return nil
	}
	for _, a := range agents {
		used := "unknown"
		if a.UsedPercent != nil {
			used = fmt.Sprintf("%.0f%%", *a.UsedPercent)
		}
		fmt.Printf("%-12s  %-10s  source=%s  confidence=%s  used=%s\n",
			a.Name, dispatchOrUnknown(a.Provider), dispatchOrUnknown(a.QuotaSource), dispatchOrUnknown(a.Confidence), used)
	}
	return nil
}

func dialDispatch(dbPath, projectID string) (dispatchClient, string, error) {
	c, err := dial(dbPath)
	if err != nil {
		return nil, "", err
	}
	resolvedID := ""
	if project, err := resolveProject(c, projectID); err == nil {
		resolvedID = project.Id
	} else if projectID != "" {
		return nil, "", err
	}
	return newDispatchClient(c), resolvedID, nil
}

func validDispatchTier(tier string) bool {
	return tier == dispatch.TierEasy || tier == dispatch.TierNormal || tier == dispatch.TierHard
}

func validDispatchSection(section string) bool {
	switch section {
	case "summary", "agent", "verification", "files", "attempts", "meta", "output":
		return true
	default:
		return false
	}
}

func readDispatchPrompt(positional []string) (string, error) {
	prompt := strings.TrimSpace(strings.Join(positional, " "))
	if prompt == "" || prompt == "-" {
		if len(positional) == 0 && term.IsTerminal(int(os.Stdin.Fd())) {
			return "", errors.New(dispatchUsage)
		}
		body, err := io.ReadAll(os.Stdin)
		if err != nil {
			return "", err
		}
		prompt = strings.TrimSpace(string(body))
	}
	if prompt == "" {
		return "", errors.New(dispatchUsage)
	}
	return prompt, nil
}

func summarizeDispatchRun(run dispatch.Run) dispatchRunSummary {
	attempts := len(run.Attempts)
	if run.Agent != "" && run.Status != dispatch.StatusFailed && run.Status != dispatch.StatusPending {
		attempts++
	}
	details := map[string]string{
		"summary":      fmt.Sprintf("polterware dispatch result %s --section summary", run.ID),
		"verification": fmt.Sprintf("polterware dispatch result %s --section verification", run.ID),
		"files":        fmt.Sprintf("polterware dispatch result %s --section files", run.ID),
		"agent":        fmt.Sprintf("polterware dispatch result %s --section agent", run.ID),
		"attempts":     fmt.Sprintf("polterware dispatch result %s --section attempts", run.ID),
		"meta":         fmt.Sprintf("polterware dispatch result %s --section meta", run.ID),
	}
	return dispatchRunSummary{
		ID:           run.ID,
		ProjectID:    run.ProjectID,
		Status:       run.Status,
		Tier:         run.Tier,
		Agent:        run.Agent,
		Model:        run.Model,
		Provider:     run.Provider,
		Effort:       run.Effort,
		CardSlug:     run.CardSlug,
		AgentRunID:   run.AgentRunID,
		Branch:       run.Branch,
		Worktree:     run.Worktree,
		Verification: run.Verification,
		Attempts:     attempts,
		ExitClass:    run.ExitClass,
		QueuedMs:     run.QueuedMs,
		RunMs:        run.RunMs,
		VerifyMs:     run.VerifyMs,
		FilesChanged: run.FilesChanged,
		Insertions:   run.Insertions,
		Deletions:    run.Deletions,
		Error:        run.Error,
		Note:         run.Note,
		Details:      details,
	}
}

func (s dispatchRunSummary) Text() string {
	line1 := fmt.Sprintf("%s %s/%s tier=%s %s %s verification=%s attempts=%d",
		s.Status, dispatchOrUnknown(s.Agent), dispatchOrUnknown(s.Model), dispatchOrUnknown(s.Tier),
		formatDispatchMs(s.RunMs), formatDispatchFiles(s.FilesChanged, s.Insertions, s.Deletions),
		dispatchOrUnknown(s.Verification), s.Attempts)
	line2 := fmt.Sprintf("branch=%s worktree=%s", dispatchOrUnknown(s.Branch), dispatchOrUnknown(s.Worktree))
	if s.CardSlug != "" {
		line2 += " card=" + s.CardSlug
	}
	if s.Error != "" {
		line2 += " error=" + s.Error
	}
	if s.Note != "" {
		line2 += " note=" + s.Note
	}
	line3 := fmt.Sprintf("details: polterware dispatch result %s --section summary|verification|files|agent|attempts|meta", s.ID)
	return line1 + "\n" + line2 + "\n" + line3 + "\n"
}

func writeDispatchRun(run dispatch.Run, asJSON, compact bool) error {
	sum := summarizeDispatchRun(run)
	if asJSON {
		return writeDispatchJSON(sum, compact)
	}
	fmt.Print(sum.Text())
	return nil
}

func writeDispatchResult(res dispatchResultResponse, asJSON, compact bool) error {
	switch res.Section {
	case "summary":
		return writeDispatchRun(res.Run, asJSON, compact)
	case "files":
		payload := map[string]any{
			"id":            res.Run.ID,
			"status":        res.Run.Status,
			"section":       "files",
			"files_changed": res.Run.FilesChanged,
			"insertions":    res.Run.Insertions,
			"deletions":     res.Run.Deletions,
		}
		if asJSON {
			return writeDispatchJSON(payload, compact)
		}
		fmt.Printf("%s %s\n", res.Run.ID, formatDispatchFiles(res.Run.FilesChanged, res.Run.Insertions, res.Run.Deletions))
		return nil
	case "attempts":
		payload := map[string]any{
			"id":       res.Run.ID,
			"status":   res.Run.Status,
			"section":  "attempts",
			"attempts": res.Run.Attempts,
		}
		if asJSON {
			return writeDispatchJSON(payload, compact)
		}
		if len(res.Run.Attempts) == 0 {
			fmt.Println("no fallback attempts")
			return nil
		}
		for _, a := range res.Run.Attempts {
			fmt.Printf("%s/%s class=%s duration=%s %s\n",
				a.Agent, a.Model, dispatchOrUnknown(a.ExitClass), formatDispatchMs(a.DurationMs), a.Error)
		}
		return nil
	case "meta":
		r := res.Run
		r.Output = ""
		if asJSON {
			return writeDispatchJSON(r, compact)
		}
		fmt.Print(summarizeDispatchRun(r).Text())
		return nil
	default:
		payload := map[string]any{
			"id":          res.Run.ID,
			"status":      res.Run.Status,
			"section":     res.Section,
			"offset":      res.Offset,
			"limit":       res.Limit,
			"total_lines": res.TotalLines,
			"has_more":    res.HasMore,
			"content":     res.Content,
		}
		if asJSON {
			return writeDispatchJSON(payload, compact)
		}
		if res.Content != "" {
			fmt.Print(res.Content)
			if !strings.HasSuffix(res.Content, "\n") {
				fmt.Println()
			}
		}
		return nil
	}
}

func writeDispatchJSON(v any, compact bool) error {
	if !compact {
		return writeJSON(v)
	}
	return json.NewEncoder(os.Stdout).Encode(v)
}

func dispatchOrUnknown(s string) string {
	if strings.TrimSpace(s) == "" {
		return "unknown"
	}
	return s
}

func formatDispatchMs(ms *int64) string {
	if ms == nil {
		return "unknown"
	}
	if *ms < 1000 {
		return fmt.Sprintf("%dms", *ms)
	}
	return (time.Duration(*ms) * time.Millisecond).Round(100 * time.Millisecond).String()
}

func formatDispatchFiles(files, ins, del *int) string {
	if files == nil {
		return "files=unknown"
	}
	if ins == nil || del == nil {
		return fmt.Sprintf("files=%d", *files)
	}
	return fmt.Sprintf("files=%d +%d -%d", *files, *ins, *del)
}
