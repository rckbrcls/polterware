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
	"strings"
	"sync"
	"time"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/dispatch"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	"github.com/polterware/polterware/backend/platform/gen/polterware/local/v1/localv1connect"
	"github.com/polterware/polterware/backend/providers/dispatch/adapters"
	"github.com/polterware/polterware/backend/providers/dispatch/worktree"
)

var _ localv1connect.DispatchServiceHandler = (*Core)(nil)

var (
	dispatchStartMu  sync.Mutex
	dispatchCancelMu sync.Mutex
	dispatchCancels  = map[string]context.CancelFunc{}
	dispatchWatchMu  sync.Mutex
)

func putDispatchCancel(runID string, cancel context.CancelFunc) {
	dispatchCancelMu.Lock()
	defer dispatchCancelMu.Unlock()
	dispatchCancels[runID] = cancel
}

func popDispatchCancel(runID string) (context.CancelFunc, bool) {
	dispatchCancelMu.Lock()
	defer dispatchCancelMu.Unlock()
	cancel, ok := dispatchCancels[runID]
	if ok {
		delete(dispatchCancels, runID)
	}
	return cancel, ok
}

func (core *Core) dispatchStateDir() string {
	if core.DBDir != "" {
		return filepath.Join(core.DBDir, "dispatch")
	}
	if core.Store != nil && core.Store.DB != nil {
		var seq int
		var name, file string
		if err := core.Store.DB.QueryRow(`PRAGMA database_list`).Scan(&seq, &name, &file); err == nil && file != "" && file != ":memory:" {
			return filepath.Join(filepath.Dir(file), "dispatch")
		}
	}
	return filepath.Join(os.TempDir(), "polterware-dispatch")
}

func (core *Core) dispatchDeps(ctx context.Context) (dispatch.Deps, error) {
	table, err := dispatch.LoadTiersFromStore(ctx, core.Store)
	if err != nil {
		return dispatch.Deps{}, err
	}
	return dispatch.Deps{
		Store:    core.Store,
		Adapters: adapters.Known(),
		Table:    table,
		StateDir: core.dispatchStateDir(),
	}, nil
}

func (core *Core) ListRuns(ctx context.Context, request *connect.Request[localv1.ListRunsRequest]) (*connect.Response[localv1.ListRunsResponse], error) {
	projectID := strings.TrimSpace(request.Msg.GetProjectId())
	if projectID == "" {
		return nil, invalid("project id is required")
	}
	runs, err := core.Store.ListRuns(ctx, projectID, int(request.Msg.GetLimit()), int(request.Msg.GetOffset()))
	if err != nil {
		return nil, internal(err)
	}
	out := make([]*localv1.DispatchRun, 0, len(runs))
	for _, run := range runs {
		out = append(out, dispatchRunProto(run))
	}
	return connect.NewResponse(&localv1.ListRunsResponse{Runs: out}), nil
}

func (core *Core) GetRun(ctx context.Context, request *connect.Request[localv1.GetRunRequest]) (*connect.Response[localv1.GetRunResponse], error) {
	id := strings.TrimSpace(request.Msg.GetId())
	if id == "" {
		return nil, invalid("run id is required")
	}
	run, err := core.Store.GetRun(ctx, id)
	if errors.Is(err, dispatch.ErrUnknownRun) || errors.Is(err, sql.ErrNoRows) {
		return nil, connect.NewError(connect.CodeNotFound, err)
	}
	if err != nil {
		return nil, internal(err)
	}
	return connect.NewResponse(&localv1.GetRunResponse{Run: dispatchRunProto(run)}), nil
}

func (core *Core) StartRun(ctx context.Context, request *connect.Request[localv1.StartRunRequest]) (*connect.Response[localv1.StartRunResponse], error) {
	projectID := strings.TrimSpace(request.Msg.GetProjectId())
	if projectID == "" {
		return nil, invalid("project id is required")
	}
	tier := adapters.Tier(strings.TrimSpace(request.Msg.GetTier()))
	if !tier.Valid() {
		return nil, invalid("valid tier is required (easy, normal, or hard)")
	}
	prompt := strings.TrimSpace(request.Msg.GetPrompt())
	if prompt == "" {
		return nil, invalid("prompt is required")
	}
	project, err := core.Store.GetProject(projectID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, invalid("unknown project " + projectID)
	}
	if err != nil {
		return nil, internal(err)
	}

	dir := wedge.ExpandRootPath(project.RootPath)
	if reqDir := strings.TrimSpace(request.Msg.GetDir()); reqDir != "" {
		dir = wedge.ExpandRootPath(reqDir)
	}
	noWorktree := false
	reqWorktree := strings.TrimSpace(request.Msg.GetWorktree())
	if reqWorktree != "" {
		dir = wedge.ExpandRootPath(reqWorktree)
		noWorktree = true
	}
	if abs, err := filepath.Abs(dir); err == nil {
		dir = abs
	}

	deps, err := core.dispatchDeps(ctx)
	if err != nil {
		return nil, internal(err)
	}

	dispatchStartMu.Lock()
	existing, err := core.Store.ListRuns(ctx, projectID, 0, 0)
	if err != nil {
		dispatchStartMu.Unlock()
		return nil, internal(err)
	}
	for _, r := range existing {
		if r.Status != dispatch.StatusPending && r.Status != dispatch.StatusRunning {
			continue
		}
		if sameDispatchDir(r.Dir, dir) || (r.Worktree != "" && sameDispatchDir(r.Worktree, dir)) {
			dispatchStartMu.Unlock()
			return nil, invalid("another dispatch run is already active in " + dir)
		}
	}

	opts := dispatch.Options{
		ProjectID:  projectID,
		CardSlug:   strings.TrimSpace(request.Msg.GetCardSlug()),
		Tier:       tier,
		Prompt:     prompt,
		Dir:        dir,
		ReadOnly:   request.Msg.GetReadOnly(),
		NoWorktree: noWorktree,
		Filters: dispatch.Filters{
			Agent: strings.TrimSpace(request.Msg.GetAgent()),
		},
	}
	run, err := deps.Begin(opts)
	dispatchStartMu.Unlock()
	if err != nil {
		return nil, invalid(err.Error())
	}

	if reqWorktree != "" {
		run.Worktree = dir
		if root := worktree.Root(dir); root != "" {
			run.Repo = root
			if br, berr := worktree.CurrentBranch(dir); berr == nil && br != "HEAD" {
				run.Branch = br
			}
			if head, herr := worktree.Head(dir); herr == nil {
				run.BaseSHA = head
			}
		}
		if err := core.Store.SaveRun(ctx, run); err != nil {
			return nil, internal(err)
		}
		_ = saveRunWorktree(ctx, core.Store, run)
	}

	if err := core.Store.AppendEvent(ctx, dispatch.RunEvent{
		RunID:     run.ID,
		ProjectID: run.ProjectID,
		Kind:      dispatch.EventStarted,
		Agent:     run.Agent,
		Tier:      run.Tier,
		Text:      run.Prompt,
		At:        time.Now().UTC(),
	}); err != nil {
		return nil, internal(err)
	}

	execCtx, execCancel := context.WithCancel(context.Background())
	putDispatchCancel(run.ID, execCancel)
	go func(initial dispatch.Run) {
		defer func() {
			popDispatchCancel(initial.ID)
			execCancel()
		}()
		finalRun, _ := deps.Execute(execCtx, initial)
		finalizeDispatchRun(context.Background(), core.Store, finalRun)
	}(run)

	return connect.NewResponse(&localv1.StartRunResponse{Run: dispatchRunProto(run)}), nil
}

// cancelSelfGuardStore prevents Deps.Cancel from sending SIGTERM/SIGKILL to
// the core daemon process itself when the run was launched in-process.
type cancelSelfGuardStore struct {
	dispatch.Store
	selfPID int
}

func (s cancelSelfGuardStore) GetRun(ctx context.Context, id string) (dispatch.Run, error) {
	run, err := s.Store.GetRun(ctx, id)
	if err != nil {
		return run, err
	}
	if run.PID == s.selfPID {
		run.PID = 0
	}
	return run, nil
}

func (core *Core) CancelRun(ctx context.Context, request *connect.Request[localv1.CancelRunRequest]) (*connect.Response[localv1.CancelRunResponse], error) {
	id := strings.TrimSpace(request.Msg.GetId())
	if id == "" {
		return nil, invalid("run id is required")
	}
	execCancel, hadCancel := popDispatchCancel(id)
	if hadCancel {
		execCancel()
	}

	deps, err := core.dispatchDeps(ctx)
	if err != nil {
		return nil, internal(err)
	}
	deps.Store = cancelSelfGuardStore{Store: core.Store, selfPID: os.Getpid()}

	run, err := deps.Cancel(ctx, id)
	if errors.Is(err, dispatch.ErrUnknownRun) || errors.Is(err, sql.ErrNoRows) {
		return nil, connect.NewError(connect.CodeNotFound, err)
	}
	if err != nil {
		if hadCancel && run.Status == dispatch.StatusCancelled {
			err = nil
		} else {
			return nil, invalid(err.Error())
		}
	}

	if !isTerminalDispatchStatus(run.Status) {
		run.Status = dispatch.StatusCancelled
		if run.Error == "" {
			run.Error = "cancelled"
		}
		run.FinishedAt = time.Now().UTC()
		if err := core.Store.SaveRun(ctx, run); err != nil {
			return nil, internal(err)
		}
	}
	finalizeDispatchRun(ctx, core.Store, run)
	return connect.NewResponse(&localv1.CancelRunResponse{Run: dispatchRunProto(run)}), nil
}

func (core *Core) Result(ctx context.Context, request *connect.Request[localv1.ResultRequest]) (*connect.Response[localv1.ResultResponse], error) {
	id := strings.TrimSpace(request.Msg.GetId())
	if id == "" {
		return nil, invalid("run id is required")
	}
	run, err := core.Store.GetRun(ctx, id)
	if errors.Is(err, dispatch.ErrUnknownRun) || errors.Is(err, sql.ErrNoRows) {
		return nil, connect.NewError(connect.CodeNotFound, err)
	}
	if err != nil {
		return nil, internal(err)
	}

	section := strings.TrimSpace(request.Msg.GetSection())
	if section == "" {
		section = "summary"
	}
	offset := int(request.Msg.GetOffset())
	limit := int(request.Msg.GetLimit())

	var raw string
	switch section {
	case "summary":
		maxLines := limit
		if maxLines <= 0 {
			maxLines = 40
		}
		raw, _ = dispatch.Summary(run.Output, maxLines, 4096)
	case "verification":
		raw = run.Verification
		if run.VerifyJSON != "" {
			if raw != "" {
				raw += "\n" + run.VerifyJSON
			} else {
				raw = run.VerifyJSON
			}
		}
	case "files":
		b, err := json.Marshal(map[string]any{
			"files_changed": run.FilesChanged,
			"insertions":    run.Insertions,
			"deletions":     run.Deletions,
		})
		if err != nil {
			return nil, internal(err)
		}
		raw = string(b)
	case "attempts":
		attempts := run.Attempts
		if attempts == nil {
			attempts = []dispatch.Attempt{}
		}
		b, err := json.Marshal(attempts)
		if err != nil {
			return nil, internal(err)
		}
		raw = string(b)
	case "meta":
		metaRun := run
		metaRun.Output = ""
		b, err := json.Marshal(metaRun)
		if err != nil {
			return nil, internal(err)
		}
		raw = string(b)
	case "output", "agent":
		raw = run.Output
	default:
		return nil, invalid("unknown section " + section)
	}

	content, total, _ := dispatch.Page(raw, offset, limit)
	return connect.NewResponse(&localv1.ResultResponse{
		Content: content,
		Total:   int32(total),
	}), nil
}

func (core *Core) WatchRun(ctx context.Context, request *connect.Request[localv1.WatchRunRequest], stream *connect.ServerStream[localv1.WatchRunResponse]) error {
	id := strings.TrimSpace(request.Msg.GetId())
	if id == "" {
		return invalid("run id is required")
	}
	run, err := core.Store.GetRun(ctx, id)
	if errors.Is(err, dispatch.ErrUnknownRun) || errors.Is(err, sql.ErrNoRows) {
		return connect.NewError(connect.CodeNotFound, err)
	}
	if err != nil {
		return internal(err)
	}

	core.life.streams.Add(1)
	defer func() {
		core.life.streams.Add(-1)
		core.touch()
	}()

	lastSeq := request.Msg.GetAfterSeq()
	initialEvents, err := core.Store.ListEvents(ctx, id, lastSeq, 0)
	if err != nil {
		return internal(err)
	}
	for _, ev := range initialEvents {
		if err := stream.Send(watchRunProto(ev)); err != nil {
			return err
		}
		if ev.Seq > lastSeq {
			lastSeq = ev.Seq
		}
	}

	logPath := filepath.Join(core.dispatchStateDir(), "logs", id+".agent.log")
	ticker := time.NewTicker(25 * time.Millisecond)
	defer ticker.Stop()

	for {
		if err := core.syncAgentLogOutput(ctx, run, logPath); err != nil {
			return internal(err)
		}
		events, err := core.Store.ListEvents(ctx, id, lastSeq, 0)
		if err != nil {
			return internal(err)
		}
		for _, ev := range events {
			if err := stream.Send(watchRunProto(ev)); err != nil {
				return err
			}
			if ev.Seq > lastSeq {
				lastSeq = ev.Seq
			}
		}

		current, err := core.Store.GetRun(ctx, id)
		if err != nil {
			return internal(err)
		}
		run = current
		if isTerminalDispatchStatus(run.Status) {
			if err := core.syncAgentLogOutput(ctx, run, logPath); err != nil {
				return internal(err)
			}
			tailEvents, err := core.Store.ListEvents(ctx, id, lastSeq, 0)
			if err != nil {
				return internal(err)
			}
			for _, ev := range tailEvents {
				if err := stream.Send(watchRunProto(ev)); err != nil {
					return err
				}
				if ev.Seq > lastSeq {
					lastSeq = ev.Seq
				}
			}
			return nil
		}

		select {
		case <-ctx.Done():
			return nil
		case <-core.Done():
			return nil
		case <-ticker.C:
		}
	}
}

func (core *Core) syncAgentLogOutput(ctx context.Context, run dispatch.Run, logPath string) error {
	b, err := os.ReadFile(logPath)
	if err != nil || len(b) == 0 {
		return nil
	}
	dispatchWatchMu.Lock()
	defer dispatchWatchMu.Unlock()

	allEvents, err := core.Store.ListEvents(ctx, run.ID, 0, 0)
	if err != nil {
		return err
	}
	copied := 0
	for _, ev := range allEvents {
		if ev.Kind == dispatch.EventOutput {
			copied += len(ev.Text)
		}
	}
	if len(b) <= copied {
		return nil
	}
	chunk := string(b[copied:])
	return core.Store.AppendEvent(ctx, dispatch.RunEvent{
		RunID:     run.ID,
		ProjectID: run.ProjectID,
		Kind:      dispatch.EventOutput,
		Agent:     run.Agent,
		Tier:      run.Tier,
		Text:      chunk,
		At:        time.Now().UTC(),
	})
}

func (core *Core) ListWorktrees(ctx context.Context, request *connect.Request[localv1.ListWorktreesRequest]) (*connect.Response[localv1.ListWorktreesResponse], error) {
	projectID := strings.TrimSpace(request.Msg.GetProjectId())
	if projectID == "" {
		return nil, invalid("project id is required")
	}
	items, err := core.Store.ListWorktrees(ctx, projectID)
	if err != nil {
		return nil, internal(err)
	}
	out := make([]*localv1.DispatchWorktree, 0, len(items))
	for _, item := range items {
		out = append(out, dispatchWorktreeProto(item))
	}
	return connect.NewResponse(&localv1.ListWorktreesResponse{Worktrees: out}), nil
}

func (core *Core) ListQuota(ctx context.Context, request *connect.Request[localv1.ListQuotaRequest]) (*connect.Response[localv1.ListQuotaResponse], error) {
	now := time.Now().UTC()
	since, err := parseQuotaSince(request.Msg.GetSince(), now)
	if err != nil {
		return nil, invalid(err.Error())
	}
	agentFilter := strings.TrimSpace(request.Msg.GetAgent())
	core.probeAgentsAndQuota(ctx, agentFilter, now)

	snaps, err := core.Store.ListQuota(ctx, agentFilter, since)
	if err != nil {
		return nil, internal(err)
	}
	out := make([]*localv1.DispatchQuotaSnapshot, 0, len(snaps))
	for _, snap := range snaps {
		out = append(out, dispatchQuotaProto(snap))
	}
	return connect.NewResponse(&localv1.ListQuotaResponse{Snapshots: out}), nil
}

func (core *Core) ListTiers(ctx context.Context, _ *connect.Request[localv1.ListTiersRequest]) (*connect.Response[localv1.ListTiersResponse], error) {
	rows, err := core.Store.ListTiers(ctx)
	if err != nil {
		return nil, internal(err)
	}
	if len(rows) == 0 {
		if err := core.Store.ReplaceTiers(ctx, dispatch.Default().Rows()); err != nil {
			return nil, internal(err)
		}
		rows, err = core.Store.ListTiers(ctx)
		if err != nil {
			return nil, internal(err)
		}
	}
	out := make([]*localv1.DispatchTier, 0, len(rows))
	for _, row := range rows {
		out = append(out, dispatchTierProto(row))
	}
	return connect.NewResponse(&localv1.ListTiersResponse{Tiers: out}), nil
}

func (core *Core) ListAgents(ctx context.Context, _ *connect.Request[localv1.ListAgentsRequest]) (*connect.Response[localv1.ListAgentsResponse], error) {
	core.probeAgentsAndQuota(ctx, "", time.Now().UTC())
	agents, err := core.Store.ListAgents(ctx)
	if err != nil {
		return nil, internal(err)
	}
	out := make([]*localv1.DispatchAgent, 0, len(agents))
	for _, agent := range agents {
		out = append(out, dispatchAgentProto(agent))
	}
	return connect.NewResponse(&localv1.ListAgentsResponse{Agents: out}), nil
}

func (core *Core) ListHistory(ctx context.Context, request *connect.Request[localv1.ListHistoryRequest]) (*connect.Response[localv1.ListHistoryResponse], error) {
	events, err := core.Store.ListHistory(
		ctx,
		strings.TrimSpace(request.Msg.GetProjectId()),
		strings.TrimSpace(request.Msg.GetAgent()),
		strings.TrimSpace(request.Msg.GetTier()),
		int(request.Msg.GetLimit()),
		int(request.Msg.GetOffset()),
	)
	if err != nil {
		return nil, internal(err)
	}
	out := make([]*localv1.DispatchRunEvent, 0, len(events))
	for _, ev := range events {
		out = append(out, dispatchRunEventProto(ev))
	}
	return connect.NewResponse(&localv1.ListHistoryResponse{Events: out}), nil
}

func (core *Core) CheckTiers(ctx context.Context, _ *connect.Request[localv1.CheckTiersRequest]) (*connect.Response[localv1.CheckTiersResponse], error) {
	table, err := dispatch.LoadTiersFromStore(ctx, core.Store)
	if err != nil {
		return nil, internal(err)
	}
	known := adapters.Known()
	adapterByName := make(map[string]adapters.Adapter, len(known))
	for _, a := range known {
		adapterByName[a.Name()] = a
	}

	var problems []string
	problems = append(problems, table.FieldProblems()...)
	problems = append(problems, table.CapabilityProblems(known)...)

	type modelQuery struct {
		installed bool
		models    []adapters.Model
		err       error
	}
	queried := map[string]modelQuery{}
	for _, tier := range []adapters.Tier{adapters.TierEasy, adapters.TierNormal, adapters.TierHard} {
		for _, entry := range table.Tiers[tier] {
			a, ok := adapterByName[entry.Agent]
			if !ok {
				problems = append(problems, fmt.Sprintf("%s: unknown agent %s", tier, entry.Agent))
				continue
			}
			q, seen := queried[entry.Agent]
			if !seen {
				if _, lerr := exec.LookPath(a.Binary()); lerr == nil {
					q.installed = true
					q.models, q.err = a.Models(ctx)
				}
				queried[entry.Agent] = q
			}
			if !q.installed {
				continue
			}
			if q.err != nil {
				problems = append(problems, fmt.Sprintf("%s: %s/%s: %v", tier, entry.Agent, entry.Model, q.err))
				continue
			}
			listed := false
			for _, m := range q.models {
				if m.ID == entry.Model || adapters.BaseModel(m.ID) == adapters.BaseModel(entry.Model) {
					listed = true
					break
				}
			}
			if !listed {
				problems = append(problems, fmt.Sprintf("%s: %s/%s: model not listed by installed agent", tier, entry.Agent, entry.Model))
			}
		}
	}

	return connect.NewResponse(&localv1.CheckTiersResponse{Problems: problems}), nil
}

func (core *Core) Stats(ctx context.Context, request *connect.Request[localv1.StatsRequest]) (*connect.Response[localv1.StatsResponse], error) {
	now := time.Now().UTC()
	since, err := dispatch.ParseSince(request.Msg.GetSince(), now)
	if err != nil {
		return nil, invalid(err.Error())
	}
	report, err := dispatch.FromStore(core.Store, dispatch.StatsOptions{
		ProjectID: strings.TrimSpace(request.Msg.GetProjectId()),
		By:        strings.TrimSpace(request.Msg.GetBy()),
		Since:     since,
		Now:       now,
	})
	if err != nil {
		return nil, invalid(err.Error())
	}
	rows := make([]*localv1.DispatchStatsRow, 0, len(report.Rows))
	for _, r := range report.Rows {
		row := &localv1.DispatchStatsRow{
			Key:         r.Key,
			Runs:        int32(r.Runs),
			SuccessPct:  r.SuccessPct,
			FirstTryPct: r.FirstTryPct,
			Fallbacks:   int32(r.Fallbacks),
			RateLimits:  int32(r.RateLimits),
			Orphans:     int32(r.Orphans),
		}
		if r.P50Ms != nil {
			v := *r.P50Ms
			row.P50Ms = &v
		}
		if r.P90Ms != nil {
			v := *r.P90Ms
			row.P90Ms = &v
		}
		rows = append(rows, row)
	}
	return connect.NewResponse(&localv1.StatsResponse{
		By:       report.By,
		Since:    report.Since,
		InFlight: int32(report.InFlight),
		Rows:     rows,
	}), nil
}

func (core *Core) probeAgentsAndQuota(ctx context.Context, filterAgent string, now time.Time) {
	for _, a := range adapters.Known() {
		if filterAgent != "" && a.Name() != filterAgent {
			continue
		}
		provider := adapters.ProviderOf(a.Name(), "")
		emp := dispatch.EmpiricalQuota(core.Store, a.Name(), now)
		agentRow := dispatch.Agent{
			Name:        a.Name(),
			Bin:         a.Binary(),
			Provider:    provider,
			QuotaSource: emp.Source,
			Confidence:  string(emp.Confidence),
			Risk:        emp.Risk,
			UsedPercent: nil,
		}
		if !emp.ResetAt.IsZero() {
			t := emp.ResetAt
			agentRow.CooldownUntil = &t
		}

		_, installedErr := exec.LookPath(a.Binary())
		installed := installedErr == nil

		if up, ok := a.(adapters.UsageProvider); ok {
			agentRow.QuotaSource = up.UsageSource()
			if installed {
				if samples, err := up.Usage(ctx); err == nil && len(samples) > 0 {
					agentRow.Confidence = string(adapters.ConfidenceOfficial)
					for _, s := range samples {
						var usedCopy *float64
						if s.Used != nil {
							v := *s.Used
							usedCopy = &v
							if agentRow.UsedPercent == nil {
								agentRow.UsedPercent = &v
							}
						}
						_ = core.Store.SaveQuota(ctx, dispatch.QuotaSnapshot{
							Agent:         a.Name(),
							Provider:      provider,
							Window:        s.Window,
							Source:        s.Source,
							Confidence:    string(s.Confidence),
							UsedPercent:   usedCopy,
							WindowMinutes: int(s.Duration.Duration().Minutes()),
							ResetsAt:      s.ResetAt,
							SampledAt:     now,
						})
					}
					_ = core.Store.UpsertAgent(ctx, agentRow)
					continue
				}
			}
		}

		if installed {
			if q, err := a.Quota(ctx); err == nil {
				used := q.UsedPercent
				agentRow.Confidence = string(adapters.ConfidenceOfficial)
				agentRow.UsedPercent = &used
				_ = core.Store.SaveQuota(ctx, dispatch.QuotaSnapshot{
					Agent:         a.Name(),
					Provider:      provider,
					Window:        "default",
					Source:        agentRow.QuotaSource,
					Confidence:    string(adapters.ConfidenceOfficial),
					UsedPercent:   &used,
					WindowMinutes: q.WindowMinutes,
					ResetsAt:      q.ResetsAt,
					SampledAt:     now,
				})
				_ = core.Store.UpsertAgent(ctx, agentRow)
				continue
			}
		}

		_ = core.Store.SaveQuota(ctx, dispatch.QuotaSnapshot{
			Agent:       a.Name(),
			Provider:    provider,
			Window:      emp.Window,
			Source:      agentRow.QuotaSource,
			Confidence:  agentRow.Confidence,
			UsedPercent: nil,
			ResetsAt:    emp.ResetAt,
			SampledAt:   now,
		})
		_ = core.Store.UpsertAgent(ctx, agentRow)
	}
}

func finalizeDispatchRun(ctx context.Context, store dispatch.Store, run dispatch.Run) {
	if latest, err := store.GetRun(ctx, run.ID); err == nil {
		if latest.Status == dispatch.StatusCancelled && run.Status != dispatch.StatusCancelled {
			run.Status = dispatch.StatusCancelled
			if latest.Error != "" {
				run.Error = latest.Error
			}
			_ = store.SaveRun(ctx, run)
		}
	}
	_ = saveRunWorktree(ctx, store, run)

	dispatchWatchMu.Lock()
	defer dispatchWatchMu.Unlock()

	events, _ := store.ListEvents(ctx, run.ID, 0, 0)
	hasKind := func(kind string) bool {
		for _, ev := range events {
			if ev.Kind == kind {
				return true
			}
		}
		return false
	}

	now := time.Now().UTC()
	switch run.Status {
	case dispatch.StatusFailed, dispatch.StatusTimedOut, dispatch.StatusCancelled:
		if !hasKind(dispatch.EventFailed) {
			text := run.Error
			if text == "" {
				text = strings.ToLower(run.Status)
			}
			_ = store.AppendEvent(ctx, dispatch.RunEvent{
				RunID:     run.ID,
				ProjectID: run.ProjectID,
				Kind:      dispatch.EventFailed,
				Agent:     run.Agent,
				Tier:      run.Tier,
				Text:      text,
				At:        now,
			})
		}
	case dispatch.StatusCompleted:
		if run.Verification != "" && !hasKind(dispatch.EventVerified) {
			_ = store.AppendEvent(ctx, dispatch.RunEvent{
				RunID:     run.ID,
				ProjectID: run.ProjectID,
				Kind:      dispatch.EventVerified,
				Agent:     run.Agent,
				Tier:      run.Tier,
				Text:      run.Verification,
				At:        now,
			})
		}
	}
	if run.MergedAt != nil && !run.MergedAt.IsZero() && !hasKind(dispatch.EventMerged) {
		_ = store.AppendEvent(ctx, dispatch.RunEvent{
			RunID:     run.ID,
			ProjectID: run.ProjectID,
			Kind:      dispatch.EventMerged,
			Agent:     run.Agent,
			Tier:      run.Tier,
			Text:      run.MergeSHA,
			At:        now,
		})
	}
}

func saveRunWorktree(ctx context.Context, store dispatch.Store, run dispatch.Run) error {
	if run.Worktree == "" {
		return nil
	}
	status := dispatch.WorktreeActive
	switch run.Status {
	case dispatch.StatusCompleted:
		status = dispatch.WorktreeReady
	case dispatch.StatusFailed, dispatch.StatusCancelled, dispatch.StatusTimedOut, dispatch.StatusOrphaned:
		status = dispatch.WorktreeAbandoned
	}
	return store.SaveWorktree(ctx, dispatch.WorktreeInfo{
		ID:        run.ID,
		ProjectID: run.ProjectID,
		RunID:     run.ID,
		CardSlug:  run.CardSlug,
		Path:      run.Worktree,
		Branch:    run.Branch,
		BaseSHA:   run.BaseSHA,
		Status:    status,
		Owner:     run.Agent,
	})
}

func sameDispatchDir(a, b string) bool {
	if a == "" || b == "" {
		return false
	}
	if absA, err := filepath.Abs(a); err == nil {
		a = absA
	}
	if absB, err := filepath.Abs(b); err == nil {
		b = absB
	}
	return filepath.Clean(a) == filepath.Clean(b)
}

func isTerminalDispatchStatus(status string) bool {
	switch status {
	case dispatch.StatusCompleted, dispatch.StatusFailed, dispatch.StatusCancelled, dispatch.StatusTimedOut, dispatch.StatusOrphaned:
		return true
	default:
		return false
	}
}

func parseQuotaSince(raw string, now time.Time) (time.Time, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return time.Time{}, nil
	}
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t.UTC(), nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.UTC(), nil
	}
	return dispatch.ParseSince(s, now)
}

func formatDispatchTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

func dispatchRunProto(run dispatch.Run) *localv1.DispatchRun {
	out := &localv1.DispatchRun{
		Id:           run.ID,
		ProjectId:    run.ProjectID,
		Status:       run.Status,
		Tier:         run.Tier,
		Agent:        run.Agent,
		Model:        run.Model,
		Provider:     run.Provider,
		Effort:       run.Effort,
		Prompt:       run.Prompt,
		CardSlug:     run.CardSlug,
		AgentRunId:   run.AgentRunID,
		Dir:          run.Dir,
		Repo:         run.Repo,
		Worktree:     run.Worktree,
		Branch:       run.Branch,
		BaseSha:      run.BaseSHA,
		ReadOnly:     run.ReadOnly,
		Verification: run.Verification,
		ExitCode:     int32(run.ExitCode),
		ExitClass:    run.ExitClass,
		Error:        run.Error,
		Note:         run.Note,
		CreatedAt:    formatDispatchTime(run.CreatedAt),
		StartedAt:    formatDispatchTime(run.StartedAt),
		FinishedAt:   formatDispatchTime(run.FinishedAt),
		MergeSha:     run.MergeSHA,
	}
	if run.FilesChanged != nil {
		v := int32(*run.FilesChanged)
		out.FilesChanged = &v
	}
	if run.Insertions != nil {
		v := int32(*run.Insertions)
		out.Insertions = &v
	}
	if run.Deletions != nil {
		v := int32(*run.Deletions)
		out.Deletions = &v
	}
	if run.MergedAt != nil && !run.MergedAt.IsZero() {
		out.MergedAt = formatDispatchTime(*run.MergedAt)
	}
	return out
}

func dispatchRunEventProto(ev dispatch.RunEvent) *localv1.DispatchRunEvent {
	return &localv1.DispatchRunEvent{
		Id:        ev.ID,
		RunId:     ev.RunID,
		ProjectId: ev.ProjectID,
		Kind:      ev.Kind,
		Agent:     ev.Agent,
		Tier:      ev.Tier,
		Text:      ev.Text,
		Seq:       ev.Seq,
		At:        formatDispatchTime(ev.At),
	}
}

func watchRunProto(ev dispatch.RunEvent) *localv1.WatchRunResponse {
	return &localv1.WatchRunResponse{
		Seq:  ev.Seq,
		Kind: ev.Kind,
		Text: ev.Text,
		At:   formatDispatchTime(ev.At),
	}
}

func dispatchWorktreeProto(wt dispatch.WorktreeInfo) *localv1.DispatchWorktree {
	return &localv1.DispatchWorktree{
		Id:        wt.ID,
		ProjectId: wt.ProjectID,
		RunId:     wt.RunID,
		CardSlug:  wt.CardSlug,
		Path:      wt.Path,
		Branch:    wt.Branch,
		BaseSha:   wt.BaseSHA,
		Status:    wt.Status,
		Owner:     wt.Owner,
	}
}

func dispatchQuotaProto(snap dispatch.QuotaSnapshot) *localv1.DispatchQuotaSnapshot {
	out := &localv1.DispatchQuotaSnapshot{
		Agent:         snap.Agent,
		Provider:      snap.Provider,
		Window:        snap.Window,
		Source:        snap.Source,
		Confidence:    snap.Confidence,
		WindowMinutes: int32(snap.WindowMinutes),
		ResetsAt:      formatDispatchTime(snap.ResetsAt),
		SampledAt:     formatDispatchTime(snap.SampledAt),
	}
	if snap.UsedPercent != nil {
		v := *snap.UsedPercent
		out.UsedPercent = &v
	}
	return out
}

func dispatchTierProto(tier dispatch.Tier) *localv1.DispatchTier {
	return &localv1.DispatchTier{
		Name:     tier.Name,
		Provider: tier.Provider,
		Agent:    tier.Agent,
		Model:    tier.Model,
		Speed:    int32(tier.Speed),
		Strength: int32(tier.Strength),
		Position: int32(tier.Position),
	}
}

func dispatchAgentProto(agent dispatch.Agent) *localv1.DispatchAgent {
	out := &localv1.DispatchAgent{
		Name:        agent.Name,
		Bin:         agent.Bin,
		Provider:    agent.Provider,
		QuotaSource: agent.QuotaSource,
		Confidence:  agent.Confidence,
		Risk:        agent.Risk,
	}
	if agent.UsedPercent != nil {
		v := *agent.UsedPercent
		out.UsedPercent = &v
	}
	if agent.CooldownUntil != nil && !agent.CooldownUntil.IsZero() {
		out.CooldownUntil = formatDispatchTime(*agent.CooldownUntil)
	}
	return out
}
