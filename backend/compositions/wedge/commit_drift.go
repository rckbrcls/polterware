package wedge

import (
	"context"

	"github.com/polterware/polterware/backend/domains/drift"
	"github.com/polterware/polterware/backend/domains/polter"
	"github.com/polterware/polterware/backend/domains/work"
	gitpkg "github.com/polterware/polterware/backend/providers/git"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

type gitCheckout struct {
	name string
	root string
}

// assembleCommitDrift reads each checkout's recent commits and links them to
// tasks: a commit subject that cites a task (slug#T2), or a link a person made
// from the Inbox. Ready is false when no checkout has local main or master,
// and the commit-task findings stay out of the result.
func assembleCommitDrift(store *storepkg.Store, projectID, rootPath string) (bool, []drift.DoneTask, []drift.TaskCommit, []drift.WindowCommit, error) {
	checkouts, err := driftCheckouts(store, projectID, rootPath)
	if err != nil {
		return false, nil, nil, nil, err
	}
	type read struct {
		co   gitCheckout
		meta gitpkg.Metadata
		base string
	}
	var reads []read
	for _, co := range checkouts {
		meta := gitpkg.ReadMetadata(context.Background(), co.root)
		if !meta.Available {
			continue
		}
		base, ok := gitpkg.DeliveryBase(context.Background(), co.root)
		if !ok {
			continue
		}
		reads = append(reads, read{co: co, meta: meta, base: base})
	}
	if len(reads) == 0 {
		return false, nil, nil, nil, nil
	}
	stored, err := store.ListCommitLinks(projectID)
	if err != nil {
		return false, nil, nil, nil, err
	}
	snapshot, err := store.LoadWorkSnapshot(projectID)
	if err != nil {
		return false, nil, nil, nil, err
	}

	var window []drift.WindowCommit
	var links []drift.TaskCommit
	for _, read := range reads {
		shas := make([]string, 0, len(read.meta.Commits))
		for _, commit := range read.meta.Commits {
			shas = append(shas, commit.SHA)
		}
		for _, link := range stored {
			if link.Repo == read.co.name {
				shas = append(shas, link.SHA)
			}
		}
		ancestors := gitpkg.AncestorsOf(context.Background(), read.co.root, read.base, shas)
		for _, commit := range read.meta.Commits {
			window = append(window, drift.WindowCommit{
				Repo:    read.co.name,
				SHA:     commit.SHA,
				Subject: commit.Subject,
				OnMain:  ancestors[commit.SHA],
			})
			for _, task := range polter.MatchExplicitTasks(commit.Subject, snapshot.Cards) {
				links = append(links, drift.TaskCommit{TaskID: task.ID, Repo: read.co.name, SHA: commit.SHA, OnMain: ancestors[commit.SHA]})
			}
		}
		for _, link := range stored {
			if link.Repo == read.co.name {
				links = append(links, drift.TaskCommit{TaskID: link.TaskID, Repo: link.Repo, SHA: link.SHA, OnMain: ancestors[link.SHA]})
			}
		}
	}

	var tasks []drift.DoneTask
	for _, card := range snapshot.Cards {
		if card.Status != work.CardActive {
			continue
		}
		for _, task := range card.Tasks {
			if task.State != work.TaskDone {
				continue
			}
			tasks = append(tasks, drift.DoneTask{
				ID:     task.ID,
				CardID: card.ID,
				Slug:   card.Slug,
				Number: task.Number,
				Title:  task.Title,
			})
		}
	}
	return true, tasks, links, window, nil
}

func driftCheckouts(store *storepkg.Store, projectID, rootPath string) ([]gitCheckout, error) {
	var out []gitCheckout
	if rootPath != "" {
		out = append(out, gitCheckout{root: rootPath})
	}
	repos, err := store.ListProjectRepos(projectID)
	if err != nil {
		return nil, err
	}
	for _, repo := range repos {
		path := ExpandRootPath(repo.Path)
		if path == "" || samePath(path, rootPath) {
			continue
		}
		out = append(out, gitCheckout{name: repo.Name, root: path})
	}
	return out, nil
}
