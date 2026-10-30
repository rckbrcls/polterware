package wedge

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/polterware/polterware/backend/domains/polter"
	"github.com/polterware/polterware/backend/domains/work"
	gitpkg "github.com/polterware/polterware/backend/providers/git"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// CardCommit is one commit of a card's task, for the card page.
type CardCommit struct {
	TaskNumber  int
	Repo        string
	SHA         string
	Subject     string
	URL         string
	CommittedAt time.Time
	// Cited is true for a commit found by its subject (slug#T2), with no stored link.
	Cited bool
}

// ShortSHA is the first seven characters of the sha.
func (c CardCommit) ShortSHA() string {
	if len(c.SHA) > 7 {
		return c.SHA[:7]
	}
	return c.SHA
}

// ErrCommitInput is a caller mistake: an unknown task or commit.
var ErrCommitInput = errors.New("commit input")

func commitInput(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrCommitInput, fmt.Sprintf(format, args...))
}

// CardCommits lists a card's commits, newest first: the ones linked to its
// tasks, then the ones whose subject cites a task (slug#T2) in a checkout's
// recent history. It only reads.
func CardCommits(store *storepkg.Store, projectID, slug string) ([]CardCommit, error) {
	snapshot, err := store.LoadWorkSnapshot(projectID)
	if err != nil {
		return nil, err
	}
	card, ok := snapshot.Card(slug)
	if !ok {
		return nil, commitInput("unknown card %q", slug)
	}
	numbers := map[string]int{}
	for _, task := range card.Tasks {
		numbers[task.ID] = task.Number
	}
	links, err := store.ListCommitLinks(projectID)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	key := func(number int, sha string) string { return fmt.Sprintf("%d:%s", number, sha) }
	var out []CardCommit
	for _, link := range links {
		number, mine := numbers[link.TaskID]
		if !mine {
			continue
		}
		seen[key(number, link.SHA)] = true
		out = append(out, CardCommit{
			TaskNumber: number, Repo: link.Repo, SHA: link.SHA, Subject: link.Subject, URL: link.URL, CommittedAt: link.CommittedAt,
		})
	}
	checkouts, err := projectCheckouts(store, projectID)
	if err != nil {
		return nil, err
	}
	for _, co := range checkouts {
		meta := gitpkg.ReadMetadata(context.Background(), co.root)
		if !meta.Available {
			continue
		}
		ownerRepo, onGitHub := gitpkg.GitHubRepo(context.Background(), co.root)
		for _, commit := range meta.Commits {
			for _, task := range polter.MatchExplicitTasks(commit.Subject, []work.Card{card}) {
				number := numbers[task.ID]
				if seen[key(number, commit.SHA)] {
					continue
				}
				seen[key(number, commit.SHA)] = true
				found := CardCommit{TaskNumber: number, Repo: co.name, SHA: commit.SHA, Subject: commit.Subject, Cited: true}
				if onGitHub {
					found.URL = gitpkg.GitHubCommitURL(ownerRepo, commit.SHA)
				}
				if when, ok := gitpkg.CommitTime(context.Background(), co.root, commit.SHA); ok {
					found.CommittedAt = when
				}
				out = append(out, found)
			}
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].CommittedAt.After(out[j].CommittedAt) })
	return out, nil
}

// LinkTaskCommit links a commit (a sha or a prefix of one, found in any
// checkout) to a task given as slug#T2, keeping its subject, time, and GitHub URL.
func LinkTaskCommit(store *storepkg.Store, projectID, taskRef, sha string) (CardCommit, error) {
	task, err := resolveTaskRef(store, projectID, taskRef)
	if err != nil {
		return CardCommit{}, err
	}
	sha = strings.TrimSpace(sha)
	if sha == "" {
		return CardCommit{}, commitInput("link needs a commit sha")
	}
	checkouts, err := projectCheckouts(store, projectID)
	if err != nil {
		return CardCommit{}, err
	}
	for _, co := range checkouts {
		detail, ok := gitpkg.ReadCommit(context.Background(), co.root, sha)
		if !ok {
			continue
		}
		link := work.CommitLink{
			ProjectID: projectID, Repo: co.name, SHA: detail.SHA, TaskID: task.ID,
			Subject: detail.Subject, CommittedAt: detail.CommittedAt,
		}
		if ownerRepo, onGitHub := gitpkg.GitHubRepo(context.Background(), co.root); onGitHub {
			link.URL = gitpkg.GitHubCommitURL(ownerRepo, detail.SHA)
		}
		if err := store.InsertCommitLink(link, time.Now().UTC()); err != nil {
			return CardCommit{}, err
		}
		return CardCommit{
			TaskNumber: task.Number, Repo: link.Repo, SHA: link.SHA, Subject: link.Subject, URL: link.URL, CommittedAt: link.CommittedAt,
		}, nil
	}
	return CardCommit{}, commitInput("unknown commit %q: no checkout of this project has it", sha)
}

// UnlinkTaskCommit removes a stored link. A commit found by its subject has
// none: its subject names the task.
func UnlinkTaskCommit(store *storepkg.Store, projectID, taskRef, sha string) error {
	task, err := resolveTaskRef(store, projectID, taskRef)
	if err != nil {
		return err
	}
	removed, err := store.DeleteCommitLink(projectID, task.ID, strings.TrimSpace(sha))
	if err != nil {
		return err
	}
	if !removed {
		return commitInput("%s has no linked commit %q", strings.TrimSpace(taskRef), strings.TrimSpace(sha))
	}
	return nil
}

func resolveTaskRef(store *storepkg.Store, projectID, taskRef string) (work.Task, error) {
	ref, err := polter.ParseTaskRef(taskRef)
	if err != nil {
		return work.Task{}, commitInput("%s", err.Error())
	}
	snapshot, err := store.LoadWorkSnapshot(projectID)
	if err != nil {
		return work.Task{}, err
	}
	if card, ok := snapshot.Card(ref.Slug); ok {
		for _, task := range card.Tasks {
			if task.Number == ref.Number {
				return task, nil
			}
		}
	}
	return work.Task{}, commitInput("unknown task %q: use slug#T2", strings.TrimSpace(taskRef))
}
