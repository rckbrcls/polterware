package wedge

import (
	"context"

	"github.com/polterware/polterware/backend/domains/canon"
	"github.com/polterware/polterware/backend/domains/drift"
	"github.com/polterware/polterware/backend/domains/work"
	gitpkg "github.com/polterware/polterware/backend/providers/git"
	"github.com/polterware/polterware/backend/providers/importer"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

type gitCheckout struct {
	name   string
	root   string
	source string
}

// assembleCommitDrift loads done tasks, stored links, and the current commit
// window. Ready is false when no checkout has local main or master, and the
// commit-task findings stay out of the result.
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

	evidence, err := store.ListCanonEvidence(projectID)
	if err != nil {
		return false, nil, nil, nil, err
	}
	byID := map[string]canon.Evidence{}
	for _, item := range evidence {
		byID[item.ID] = item
	}
	stored, err := store.ListCommitLinks(projectID)
	if err != nil {
		return false, nil, nil, nil, err
	}

	onMain := map[string]bool{}
	var window []drift.WindowCommit
	for _, read := range reads {
		shas := make([]string, 0, len(read.meta.Commits))
		for _, commit := range read.meta.Commits {
			shas = append(shas, commit.SHA)
		}
		for _, link := range stored {
			item, ok := byID[link.EvidenceID]
			if ok && item.Source == read.co.source && item.Path != "" {
				shas = append(shas, item.Path)
			}
		}
		ancestors := gitpkg.AncestorsOf(context.Background(), read.co.root, read.base, shas)
		for _, commit := range read.meta.Commits {
			id := commitEvidenceID(projectID, read.co.name, commit.SHA)
			window = append(window, drift.WindowCommit{
				EvidenceID: id,
				SHA:        commit.SHA,
				Subject:    commit.Subject,
				OnMain:     ancestors[commit.SHA],
			})
			if ancestors[commit.SHA] {
				onMain[id] = true
			}
		}
		for _, link := range stored {
			item, ok := byID[link.EvidenceID]
			if ok && item.Source == read.co.source && ancestors[item.Path] {
				onMain[link.EvidenceID] = true
			}
		}
	}

	snapshot, err := store.LoadWorkSnapshot(projectID)
	if err != nil {
		return false, nil, nil, nil, err
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
	taskLinks := make([]drift.TaskCommit, 0, len(stored))
	for _, link := range stored {
		taskLinks = append(taskLinks, drift.TaskCommit{
			TaskID:     link.TaskID,
			EvidenceID: link.EvidenceID,
			Method:     link.Method,
			OnMain:     onMain[link.EvidenceID],
		})
	}
	return true, tasks, taskLinks, window, nil
}

func driftCheckouts(store *storepkg.Store, projectID, rootPath string) ([]gitCheckout, error) {
	var out []gitCheckout
	if rootPath != "" {
		out = append(out, gitCheckout{root: rootPath, source: gitCommitSource})
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
		out = append(out, gitCheckout{name: repo.Name, root: path, source: gitCommitSourceFor(repo.Name)})
	}
	return out, nil
}

func commitEvidenceID(projectID, repoName, sha string) string {
	if repoName == "" {
		return importer.StableGitCommitEvidenceID(projectID, sha)
	}
	return importer.StableGitRepoCommitEvidenceID(projectID, repoName, sha)
}
