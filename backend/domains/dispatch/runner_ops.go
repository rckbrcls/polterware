package dispatch

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/polterware/polterware/backend/providers/dispatch/sandbox"
	"github.com/polterware/polterware/backend/providers/dispatch/worktree"
)

// MergeOptions controls Merge.
type MergeOptions struct {
	// Force merges a run whose verification failed.
	Force bool
	// NoVerify skips the post-merge verification.
	NoVerify bool
}

// MergeResult is the JSON body of a merge. Status is "merged",
// "merge_conflict", or "post_merge_verification_failed"; OK is true only for
// the first.
type MergeResult struct {
	OK                    bool          `json:"ok"`
	ID                    string        `json:"id"`
	Status                string        `json:"status"`
	Merged                string        `json:"merged,omitempty"`
	Git                   string        `json:"git,omitempty"`
	Cleaned               bool          `json:"cleaned,omitempty"`
	Note                  string        `json:"note,omitempty"`
	Conflicts             []string      `json:"conflicts,omitempty"`
	Hint                  string        `json:"hint,omitempty"`
	PostMergeVerification string        `json:"postMergeVerification,omitempty"`
	Revert                string        `json:"revert,omitempty"`
	Verify                *VerifyResult `json:"verify,omitempty"`
}

// Merge integrates a COMPLETED run's branch into the repository's current
// branch. It checks for conflicts before touching the working tree and
// re-verifies afterwards. A refusal (wrong status, failed verification,
// uncommitted overlap) is an error; a conflict or failed post-merge check is a
// result with OK false.
func (d Deps) Merge(ctx context.Context, id string, opt MergeOptions) (MergeResult, error) {
	rec, err := d.Store.GetRun(ctx, id)
	if err != nil {
		return MergeResult{}, err
	}
	res := MergeResult{ID: rec.ID}
	if rec.Branch == "" || rec.Repo == "" {
		return res, fmt.Errorf("run %s has no worktree branch to merge", rec.ID)
	}
	if rec.Status != StatusCompleted {
		return res, fmt.Errorf("run %s is %s; only COMPLETED runs can be merged", rec.ID, rec.Status)
	}
	if err := mergeRefusal(rec, opt.Force); err != nil {
		return res, err
	}

	target, _ := worktree.CurrentBranch(rec.Repo)
	unlock, err := worktree.LockMerge(rec.Repo, target)
	if err != nil {
		return res, redactErr(err)
	}
	defer unlock()

	overlapping, err := worktree.UncommittedOverlaps(rec.Repo, rec.Branch)
	if err != nil {
		return res, redactErr(err)
	}
	if len(overlapping) > 0 {
		return res, fmt.Errorf("working tree has uncommitted changes in files touched by %s: %s; commit or stash them before merging", rec.Branch, strings.Join(overlapping, ", "))
	}

	if worktree.SupportsMergeTree(rec.Repo) {
		tree, err := worktree.MergeTree(rec.Repo, "HEAD", rec.Branch)
		if err != nil {
			return res, redactErr(err)
		}
		if !tree.Clean {
			rec.ExitClass = "merge_conflict"
			if err := d.Store.SaveRun(ctx, rec); err != nil {
				return res, err
			}
			res.Status, res.Conflicts = "merge_conflict", tree.Conflicts
			res.Hint = fmt.Sprintf("ask the agent to rebase branch %s, or resolve the conflicts by hand", rec.Branch)
			return res, nil
		}
	} else {
		res.Note = "git does not support merge-tree --write-tree; skipped the pre-merge conflict check"
	}

	headBefore, _ := worktree.Head(rec.Repo)
	out, err := worktree.Merge(rec.Repo, rec.Branch, rec.ID)
	if err != nil {
		return res, redactErr(err)
	}
	mergeSHA, _ := worktree.Head(rec.Repo)
	res.Merged, res.Git = rec.Branch, out
	res.Cleaned = worktree.Remove(rec.Repo, rec.Worktree, rec.Branch, false) == nil
	res.Note = joinNote(res.Note, mergeNote(rec, opt.Force))
	res.OK, res.Status = true, "merged"

	if !opt.NoVerify && HasConfig(rec.Repo) {
		v, verr := Verify(ctx, VerifyOptions{Repo: rec.Repo, Worktree: rec.Repo, BaseSHA: headBefore})
		switch {
		case verr != nil || v.Status == VerifyStatusFailed || v.Status == VerifyStatusError:
			res.OK, res.Status = false, "post_merge_verification_failed"
			res.PostMergeVerification = "failed"
			res.Revert = "git revert -m 1 " + mergeSHA
			if len(v.Checks) > 0 {
				res.Verify = &v
			}
		case v.Status == VerifyStatusVerified:
			res.PostMergeVerification = "passed"
		}
	}

	now := d.now()
	rec.MergedAt, rec.MergeSHA, rec.MergeCheck = &now, mergeSHA, res.PostMergeVerification
	if err := d.Store.SaveRun(ctx, rec); err != nil {
		return res, err
	}
	_ = d.Store.AppendEvent(ctx, RunEvent{
		RunID: rec.ID, ProjectID: rec.ProjectID, Kind: EventMerged,
		Agent: rec.Agent, Tier: rec.Tier, Text: rec.Branch, At: now,
	})
	_ = d.Store.SaveWorktree(ctx, WorktreeInfo{
		ID: rec.ID, ProjectID: rec.ProjectID, RunID: rec.ID, CardSlug: rec.CardSlug,
		Path: rec.Worktree, Branch: rec.Branch, BaseSHA: rec.BaseSHA,
		Status: WorktreeMerged, Owner: rec.Agent,
	})
	return res, nil
}

func redactErr(err error) error { return fmt.Errorf("%s", sandbox.Redact(err.Error())) }

func mergeRefusal(rec Run, force bool) error {
	if force || rec.Verification != string(VerifyStatusFailed) {
		return nil
	}
	msg := fmt.Sprintf("run %s failed verification", rec.ID)
	if regs := regressionLines(rec, 20); len(regs) > 0 {
		msg += ": " + strings.Join(regs, ", ")
	}
	return fmt.Errorf("%s; use force to merge anyway", msg)
}

func mergeNote(rec Run, forced bool) string {
	switch rec.Verification {
	case string(VerifyStatusFailed):
		if !forced {
			return ""
		}
		if regs := regressionLines(rec, 20); len(regs) > 0 {
			return "merged despite verification_failed: " + strings.Join(regs, ", ")
		}
		return "merged despite verification_failed"
	case "":
		return "run was not verified"
	case string(VerifyStatusUnverified):
		return "verification skipped; nothing to verify"
	case string(VerifyStatusError):
		return "verifier error; merge was not blocked"
	default:
		return ""
	}
}

func regressionLines(rec Run, limit int) []string {
	v := rec.VerifyResult()
	if v == nil {
		return nil
	}
	var out []string
	for _, c := range v.Checks {
		out = append(out, c.Regressions...)
		if limit > 0 && len(out) >= limit {
			return out[:limit]
		}
	}
	return out
}

// Clean discards a run's worktree and branch. Without force it refuses a
// branch that is not merged.
func (d Deps) Clean(ctx context.Context, id string, force bool) (Run, error) {
	rec, err := d.Store.GetRun(ctx, id)
	if err != nil {
		return rec, err
	}
	if rec.Worktree == "" {
		return rec, fmt.Errorf("run %s has no worktree", rec.ID)
	}
	if err := worktree.Remove(rec.Repo, rec.Worktree, rec.Branch, force); err != nil {
		return rec, redactErr(err)
	}
	_ = d.Store.SaveWorktree(ctx, WorktreeInfo{
		ID: rec.ID, ProjectID: rec.ProjectID, RunID: rec.ID, CardSlug: rec.CardSlug,
		Path: rec.Worktree, Branch: rec.Branch, BaseSHA: rec.BaseSHA,
		Status: WorktreeAbandoned, Owner: rec.Agent,
	})
	return rec, nil
}

// VerifyRun re-runs the verifier on a run's worktree and stores the verdict.
func (d Deps) VerifyRun(ctx context.Context, id string) (Run, VerifyResult, error) {
	rec, err := d.Store.GetRun(ctx, id)
	if err != nil {
		return rec, VerifyResult{}, err
	}
	if rec.Worktree == "" {
		return rec, VerifyResult{}, fmt.Errorf("run %s has no worktree", rec.ID)
	}
	if info, err := os.Stat(rec.Worktree); err != nil || !info.IsDir() {
		return rec, VerifyResult{}, fmt.Errorf("worktree %s does not exist", rec.Worktree)
	}
	rec.NoVerify = false
	d.applyVerify(ctx, &rec)
	if terminalStatus(rec.Status) {
		rec.ExitClass = Classify(rec)
	}
	if err := d.Store.SaveRun(ctx, rec); err != nil {
		return rec, VerifyResult{}, err
	}
	res := VerifyResult{Status: VerifyStatus(rec.Verification)}
	if v := rec.VerifyResult(); v != nil {
		res = *v
	}
	return rec, res, nil
}
