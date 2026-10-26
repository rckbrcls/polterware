// Package dispatch is the execution engine for delegated coding runs.
// A dispatch run is a delegation executed by the core. The core links it to an
// AgentRun (its audited session) and it may reference a Work card slug.
package dispatch

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"
)

const (
	StatusPending   = "PENDING"
	StatusRunning   = "RUNNING"
	StatusCompleted = "COMPLETED"
	StatusFailed    = "FAILED"
	StatusCancelled = "CANCELLED"
	StatusTimedOut  = "TIMED_OUT"
	StatusOrphaned  = "ORPHANED"
)

const (
	TierEasy   = "easy"
	TierNormal = "normal"
	TierHard   = "hard"
)

const (
	// EventOutput is a live output chunk. It is not an Activity entry.
	EventOutput = "output"
	// EventStarted, EventVerified, EventMerged, and EventFailed are the only
	// dispatch rows Activity shows.
	EventStarted  = "started"
	EventVerified = "verified"
	EventMerged   = "merged"
	EventFailed   = "failed"
)

const (
	WorktreeActive    = "active"
	WorktreeVerifying = "verifying"
	WorktreeReady     = "ready"
	WorktreeMerged    = "merged"
	WorktreeAbandoned = "abandoned"
)

var (
	ErrUnknownRun      = errors.New("unknown dispatch run")
	ErrUnknownWorktree = errors.New("unknown worktree")
)

// Filters is the routing request or the route that actually ran.
type Filters struct {
	Provider string
	Model    string
	Effort   string
	Agent    string
	Priority string
	Relax    bool
}

// Attempt is one agent try inside a run, including a failed fallback.
type Attempt struct {
	Agent      string
	Model      string
	Error      string
	ExitClass  string
	DurationMs *int64
}

// Run is one delegated execution, linked to an AgentRun by AgentRunID.
//
// Tier fields:
//   - RequestedTier is the caller's tier before classification; it is empty
//     for tierless model/provider requests. On resume it is the previous
//     run's Tier, so it equals Tier.
//   - Tier is the routing tier. It differs from RequestedTier only when
//     sensitive-code classification promotes a new request to a higher tier.
//   - ExecutionTier is the tier of the candidate that actually ran and selects
//     the classifier head trained on the outcome. It differs from Tier when a
//     tierless filter or --relax resolves to a table candidate of another
//     tier, falls back to Tier when the candidate has none, and stays empty if
//     no attempt started or neither tier is known.
//
// ClassifyFeatures are only meaningful when FeatureSchema equals the current
// FeatureSchema; records with another schema are ignored by the classifier.
type Run struct {
	ID               string
	ProjectID        string
	Status           string
	Tier             string
	RequestedTier    string
	ExecutionTier    string
	Agent            string
	Model            string
	Provider         string
	Effort           string
	Prompt           string
	Dir              string
	Repo             string
	Worktree         string
	Branch           string
	BaseSHA          string
	ReadOnly         bool
	NoWorktree       bool
	NoVerify         bool
	AgentRunID       string
	CardSlug         string
	Output           string
	Error            string
	Note             string
	ExitCode         int
	ExitClass        string
	Verification     string
	VerifyJSON       string
	TimeoutSec       int
	SessionID        string
	ResumedOf        string
	ParentRunID      string
	PID              int
	AgentPID         int
	ProcStart        string
	Profile          string
	Prefer           []string
	Avoid            []string
	Requested        *Filters
	Resolved         *Filters
	Attempts         []Attempt
	FeatureSchema    int
	ClassifyFeatures []float64
	FilesChanged     *int
	Insertions       *int
	Deletions        *int
	QueuedMs         *int64
	RunMs            *int64
	VerifyMs         *int64
	CreatedAt        time.Time
	StartedAt        time.Time
	FinishedAt       time.Time
	MergedAt         *time.Time
	MergeSHA         string
	MergeCheck       string
}

// RunEvent is an append-only fact about a run.
// Seq is assigned by the store when the caller leaves it at zero.
type RunEvent struct {
	ID        string
	RunID     string
	ProjectID string
	Kind      string
	Agent     string
	Tier      string
	Text      string
	Seq       int64
	At        time.Time
}

// Tier is one row of the declarative difficulty table.
type Tier struct {
	Name     string
	Provider string
	Agent    string
	Model    string
	Speed    int
	Strength int
	Position int
}

// Agent is the last probe of an installed CLI.
// UsedPercent is nil when the quota is unknown. Callers must not invent one.
type Agent struct {
	Name          string
	Bin           string
	Provider      string
	QuotaSource   string
	Confidence    string
	Risk          string
	UsedPercent   *float64
	CooldownUntil *time.Time
}

// QuotaSnapshot is one official usage sample.
// UsedPercent is nil when the protocol did not report a figure.
type QuotaSnapshot struct {
	Agent         string
	Provider      string
	Window        string
	Source        string
	Confidence    string
	UsedPercent   *float64
	WindowMinutes int
	ResetsAt      time.Time
	SampledAt     time.Time
}

// WorktreeInfo is the core-owned git worktree for one run.
type WorktreeInfo struct {
	ID        string
	ProjectID string
	RunID     string
	CardSlug  string
	Path      string
	Branch    string
	BaseSHA   string
	Status    string
	Owner     string
}

// Store is the persistence boundary. The core implements it on SQLite.
// The engine must not open the database itself.
type Store interface {
	SaveRun(ctx context.Context, run Run) error
	GetRun(ctx context.Context, id string) (Run, error)
	ListRuns(ctx context.Context, projectID string, limit, offset int) ([]Run, error)
	AppendEvent(ctx context.Context, event RunEvent) error
	ListEvents(ctx context.Context, runID string, afterSeq int64, limit int) ([]RunEvent, error)
	ListHistory(ctx context.Context, projectID, agent, tier string, limit, offset int) ([]RunEvent, error)
	SaveWorktree(ctx context.Context, info WorktreeInfo) error
	ListWorktrees(ctx context.Context, projectID string) ([]WorktreeInfo, error)
	SaveQuota(ctx context.Context, snap QuotaSnapshot) error
	ListQuota(ctx context.Context, agent string, since time.Time) ([]QuotaSnapshot, error)
	ListTiers(ctx context.Context) ([]Tier, error)
	ReplaceTiers(ctx context.Context, tiers []Tier) error
	UpsertAgent(ctx context.Context, agent Agent) error
	ListAgents(ctx context.Context) ([]Agent, error)
	SetCooldown(ctx context.Context, agent string, until time.Time) error
	ClearCooldown(ctx context.Context, agent string) error
}

// NewID returns a random 16-byte hex id.
func NewID() (string, error) {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf[:]), nil
}
