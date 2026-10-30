package drift

// CheckerNarrow is the finding producer name for the drift read.
const CheckerNarrow = "narrow"

// Finding types. Drift compares delivered work with the commits on main.
const (
	TypeTaskDoneUnmatched = "task_done_unmatched"
	TypeCommitWithoutTask = "commit_without_task"
)

const (
	SeverityInfo     = "info"
	SeverityWarning  = "warning"
	SeverityConflict = "conflict"
)

// Finding is one drift finding.
type Finding struct {
	Type       string            `json:"type"`
	Summary    string            `json:"summary"`
	Severity   string            `json:"severity"`
	SubjectIDs []string          `json:"subject_ids,omitempty"`
	Details    map[string]string `json:"details,omitempty"`
}

// Result is the stable drift check response shape.
type Result struct {
	ProjectID string    `json:"project_id"`
	EntityID  string    `json:"entity_id,omitempty"`
	Status    string    `json:"status"`
	Checker   string    `json:"checker"`
	Findings  []Finding `json:"findings"`
}

// Input is everything the checker needs (pure; no I/O).
type Input struct {
	ProjectID string
	EntityID  string
	// GitDeliveryReady is true when at least one checkout has local main or master.
	// The commit-task findings are skipped when it is false.
	GitDeliveryReady bool
	DoneTasks        []DoneTask
	TaskCommits      []TaskCommit
	WindowCommits    []WindowCommit
}

// DoneTask is a task whose stored state is done on an active card.
type DoneTask struct {
	ID     string
	CardID string
	Slug   string
	Number int
	Title  string
}

// TaskCommit links one commit to one task: cited in the commit subject, or
// linked by a person. OnMain is resolved for that checkout.
type TaskCommit struct {
	TaskID string
	Repo   string
	SHA    string
	OnMain bool
}

// WindowCommit is one recent commit of a checkout; Repo is empty for the project root.
type WindowCommit struct {
	Repo    string
	SHA     string
	Subject string
	OnMain  bool
}

// CommitKey identifies a commit across checkouts.
func CommitKey(repo, sha string) string {
	return "commit:" + repo + ":" + sha
}
