package wedge

import (
	"context"
	"fmt"
	"time"

	"github.com/polterware/polterware/backend/domains/canon"
	"github.com/polterware/polterware/backend/domains/polter"
	"github.com/polterware/polterware/backend/domains/work"
	gitpkg "github.com/polterware/polterware/backend/providers/git"
	"github.com/polterware/polterware/backend/providers/importer"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

const (
	gitHeadSource   = "git:HEAD"
	gitCommitSource = "git:commit"
)

// recordGitMetadata upserts local HEAD and recent commits as commit evidence.
// repoName empty is the project root. A named checkout uses its own evidence
// ids and does not replace the root checkpoint. A directory that is not a
// work tree adds nothing and does not fail the scan. The returned id is the
// stable HEAD evidence row, empty when Git was skipped.
func recordGitMetadata(store *storepkg.Store, projectID, root, repoName string, now time.Time) (string, int32, string, error) {
	meta := gitpkg.ReadMetadata(context.Background(), root)
	if !meta.Available {
		if repoName == "" {
			return "", 0, "Git metadata skipped.", nil
		}
		return "", 0, fmt.Sprintf("Git %s skipped.", repoName), nil
	}
	headID := importer.StableGitHeadEvidenceID(projectID)
	headSource := gitHeadSource
	commitSource := gitCommitSourceFor(repoName)
	if repoName != "" {
		headID = importer.StableGitRepoHeadEvidenceID(projectID, repoName)
		headSource = "git:" + repoName + ":HEAD"
	}
	head, err := newCommitEvidence(projectID, headID, headSource, meta.Branch, meta.SHA, now)
	if err != nil {
		return "", 0, "", err
	}
	if err := upsertImportEvidence(store, head); err != nil {
		return "", 0, "", err
	}
	count := int32(1)
	var snapshot work.Snapshot
	if len(meta.Commits) > 0 {
		snapshot, err = store.LoadWorkSnapshot(projectID)
		if err != nil {
			return "", 0, "", err
		}
	}
	for _, commit := range meta.Commits {
		commitID := importer.StableGitCommitEvidenceID(projectID, commit.SHA)
		if repoName != "" {
			commitID = importer.StableGitRepoCommitEvidenceID(projectID, repoName, commit.SHA)
		}
		row, err := newCommitEvidence(projectID, commitID, commitSource, commit.Subject, commit.SHA, now)
		if err != nil {
			return "", 0, "", err
		}
		if err := upsertImportEvidence(store, row); err != nil {
			return "", 0, "", err
		}
		if err := linkCommitSubject(store, projectID, row.ID, commit.Subject, snapshot, now); err != nil {
			return "", 0, "", err
		}
		count++
	}
	if repoName == "" {
		return head.ID, count, fmt.Sprintf("Git branch %s.", meta.Branch), nil
	}
	return head.ID, count, fmt.Sprintf("Git %s branch %s.", repoName, meta.Branch), nil
}

func gitCommitSourceFor(repoName string) string {
	if repoName == "" {
		return gitCommitSource
	}
	return "git:" + repoName + ":commit"
}

// linkCommitSubject rewrites links for one commit in the current window.
// An explicit citation is stored as explicit. Otherwise at most one FTS hit
// is stored as suggested. A suggestion is not a delivery match.
func linkCommitSubject(store *storepkg.Store, projectID, evidenceID, subject string, snapshot work.Snapshot, now time.Time) error {
	var links []work.CommitLink
	if tasks := polter.MatchExplicitTasks(subject, snapshot.Cards); len(tasks) > 0 {
		for _, task := range tasks {
			links = append(links, work.CommitLink{
				ProjectID:  projectID,
				EvidenceID: evidenceID,
				TaskID:     task.ID,
				Method:     work.LinkExplicit,
			})
		}
	} else if task, ok, err := suggestCommitTask(store, projectID, subject, snapshot); err != nil {
		return err
	} else if ok {
		links = append(links, work.CommitLink{
			ProjectID:  projectID,
			EvidenceID: evidenceID,
			TaskID:     task.ID,
			Method:     work.LinkSuggested,
		})
	}
	return store.ReplaceCommitLinks(projectID, evidenceID, links, now)
}

func suggestCommitTask(store *storepkg.Store, projectID, subject string, snapshot work.Snapshot) (work.Task, bool, error) {
	ids, err := store.SearchWorkTasks(projectID, subject, 5)
	if err != nil || len(ids) == 0 {
		return work.Task{}, false, err
	}
	eligible := map[string]work.Task{}
	for _, card := range snapshot.Cards {
		if card.Status != work.CardActive {
			continue
		}
		for _, task := range card.Tasks {
			if task.State == work.TaskDropped {
				continue
			}
			eligible[task.ID] = task
		}
	}
	for _, id := range ids {
		if task, ok := eligible[id]; ok {
			return task, true, nil
		}
	}
	return work.Task{}, false, nil
}

func newCommitEvidence(projectID, id, source, summary, sha string, now time.Time) (canon.Evidence, error) {
	evidence := canon.Evidence{
		ID:         id,
		ProjectID:  projectID,
		Kind:       canon.EvidenceKindCommit,
		Summary:    summary,
		Source:     source,
		Path:       sha,
		Actor:      "system",
		ObservedAt: now,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if err := canon.ValidateEvidence(evidence); err != nil {
		return canon.Evidence{}, err
	}
	return evidence, nil
}

func upsertImportEvidence(store *storepkg.Store, evidence canon.Evidence) error {
	if existing, err := store.GetCanonEvidence(evidence.ID); err == nil {
		evidence.CreatedAt = existing.CreatedAt
	}
	return store.UpsertCanonEvidence(evidence)
}
