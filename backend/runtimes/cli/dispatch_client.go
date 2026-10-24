package main

import (
	"context"
	"errors"
	"time"

	"github.com/polterware/polterware/backend/domains/dispatch"
	"github.com/polterware/polterware/backend/platform/coreclient"
)

var errDispatchNotWired = errors.New("dispatch service is not wired")

type dispatchStartRequest struct {
	ProjectID    string
	Tier         string
	CardSlug     string
	Agent        string
	Worktree     string
	Prompt       string
	SessionID    string
	SessionLabel string
}

type dispatchListRunsRequest struct {
	ProjectID string
	Limit     int
	Offset    int
}

type dispatchResultRequest struct {
	RunID   string
	Section string
	Offset  int
	Limit   int
}

type dispatchResultResponse struct {
	Run        dispatch.Run `json:"run"`
	Section    string       `json:"section"`
	Offset     int          `json:"offset"`
	Limit      int          `json:"limit"`
	TotalLines int          `json:"total_lines"`
	HasMore    bool         `json:"has_more"`
	Content    string       `json:"content,omitempty"`
}

type dispatchHistoryRequest struct {
	ProjectID string
	Agent     string
	Tier      string
	Limit     int
	Offset    int
}

type dispatchTierCheck struct {
	OK       bool     `json:"ok"`
	Problems []string `json:"problems"`
}

type dispatchStatsRow struct {
	Key         string  `json:"key"`
	Runs        int     `json:"runs"`
	SuccessPct  float64 `json:"success_pct"`
	FirstTryPct float64 `json:"first_try_pct"`
	P50Ms       *int64  `json:"p50_ms,omitempty"`
	P90Ms       *int64  `json:"p90_ms,omitempty"`
	Fallbacks   int     `json:"fallbacks"`
	RateLimits  int     `json:"rate_limits"`
	Orphans     int     `json:"orphans"`
}

type dispatchStatsRequest struct {
	ProjectID string
	By        string
	Since     string
}

type dispatchStatsResponse struct {
	By       string             `json:"by"`
	Since    string             `json:"since,omitempty"`
	InFlight int                `json:"in_flight,omitempty"`
	Rows     []dispatchStatsRow `json:"rows"`
}

// dispatchClient is the local CLI/TUI boundary for the core's DispatchService.
type dispatchClient interface {
	ListRuns(ctx context.Context, req dispatchListRunsRequest) ([]dispatch.Run, error)
	GetRun(ctx context.Context, id string) (dispatch.Run, error)
	StartRun(ctx context.Context, req dispatchStartRequest) (dispatch.Run, error)
	CancelRun(ctx context.Context, id string) (dispatch.Run, error)
	Result(ctx context.Context, req dispatchResultRequest) (dispatchResultResponse, error)
	ListWorktrees(ctx context.Context, projectID string) ([]dispatch.WorktreeInfo, error)
	ListQuota(ctx context.Context, agent string, since time.Time) ([]dispatch.QuotaSnapshot, error)
	ListTiers(ctx context.Context) ([]dispatch.Tier, error)
	ListAgents(ctx context.Context) ([]dispatch.Agent, error)
	ListHistory(ctx context.Context, req dispatchHistoryRequest) ([]dispatch.RunEvent, error)
	CheckTiers(ctx context.Context) (dispatchTierCheck, error)
	Stats(ctx context.Context, req dispatchStatsRequest) (dispatchStatsResponse, error)
	WatchRun(ctx context.Context, id string, afterSeq int64) (<-chan dispatch.RunEvent, error)
}

type stubDispatchClient struct {
	clients coreclient.Clients
}

func newDispatchClient(c coreclient.Clients) dispatchClient {
	return stubDispatchClient{clients: c}
}

func (stubDispatchClient) ListRuns(context.Context, dispatchListRunsRequest) ([]dispatch.Run, error) {
	return nil, errDispatchNotWired
}

func (stubDispatchClient) GetRun(context.Context, string) (dispatch.Run, error) {
	return dispatch.Run{}, errDispatchNotWired
}

func (stubDispatchClient) StartRun(context.Context, dispatchStartRequest) (dispatch.Run, error) {
	return dispatch.Run{}, errDispatchNotWired
}

func (stubDispatchClient) CancelRun(context.Context, string) (dispatch.Run, error) {
	return dispatch.Run{}, errDispatchNotWired
}

func (stubDispatchClient) Result(context.Context, dispatchResultRequest) (dispatchResultResponse, error) {
	return dispatchResultResponse{}, errDispatchNotWired
}

func (stubDispatchClient) ListWorktrees(context.Context, string) ([]dispatch.WorktreeInfo, error) {
	return nil, errDispatchNotWired
}

func (stubDispatchClient) ListQuota(context.Context, string, time.Time) ([]dispatch.QuotaSnapshot, error) {
	return nil, errDispatchNotWired
}

func (stubDispatchClient) ListTiers(context.Context) ([]dispatch.Tier, error) {
	return nil, errDispatchNotWired
}

func (stubDispatchClient) ListAgents(context.Context) ([]dispatch.Agent, error) {
	return nil, errDispatchNotWired
}

func (stubDispatchClient) ListHistory(context.Context, dispatchHistoryRequest) ([]dispatch.RunEvent, error) {
	return nil, errDispatchNotWired
}

func (stubDispatchClient) CheckTiers(context.Context) (dispatchTierCheck, error) {
	return dispatchTierCheck{}, errDispatchNotWired
}

func (stubDispatchClient) Stats(context.Context, dispatchStatsRequest) (dispatchStatsResponse, error) {
	return dispatchStatsResponse{}, errDispatchNotWired
}

func (stubDispatchClient) WatchRun(context.Context, string, int64) (<-chan dispatch.RunEvent, error) {
	return nil, errDispatchNotWired
}
