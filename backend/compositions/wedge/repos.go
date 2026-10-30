package wedge

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/polterware/polterware/backend/domains/polter"
	"github.com/polterware/polterware/backend/domains/projects"
	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
	"github.com/polterware/polterware/backend/platform/ids"
	gitpkg "github.com/polterware/polterware/backend/providers/git"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// gitCheckout is one repository cloned on this machine.
type gitCheckout struct {
	name string
	root string
}

// projectCheckouts lists the project's repositories that have a clone here.
func projectCheckouts(store *storepkg.Store, projectID string) ([]gitCheckout, error) {
	repos, err := store.ListRepositories(projectID)
	if err != nil {
		return nil, err
	}
	var out []gitCheckout
	for _, repo := range repos {
		if path := ExpandPath(repo.LocalPath); path != "" {
			out = append(out, gitCheckout{name: repo.Name, root: path})
		}
	}
	return out, nil
}

// checkoutDir is the clone of the named repository, or of the only one when
// name is empty; empty when there is none to pick.
func checkoutDir(checkouts []gitCheckout, name string) string {
	if name == "" && len(checkouts) == 1 {
		return checkouts[0].root
	}
	for _, co := range checkouts {
		if co.name == name && name != "" {
			return co.root
		}
	}
	return ""
}

// RepositoryRemote is the GitHub-level identity of a clone's origin
// (github.com/owner/repo), empty when it has no GitHub remote.
func RepositoryRemote(dir string) string {
	if ownerRepo, ok := gitpkg.GitHubRepo(context.Background(), dir); ok {
		return "github.com/" + ownerRepo
	}
	return ""
}

var repoNameUnsafe = regexp.MustCompile(`[^a-z0-9]+`)

// repoNameFor proposes a repository name: the GitHub repository's, else the
// folder's, as a lowercase slug.
func repoNameFor(remote, dir string) string {
	base := filepath.Base(dir)
	if remote != "" {
		base = remote[strings.LastIndex(remote, "/")+1:]
	}
	name := strings.Trim(repoNameUnsafe.ReplaceAllString(strings.ToLower(base), "-"), "-")
	if len(name) > 32 {
		name = strings.Trim(name[:32], "-")
	}
	if name == "" {
		name = "repo"
	}
	return name
}

// EnsureRepository returns the project's repository for a local folder: the
// one cloned there, else the one with the same GitHub remote (its clone path
// becomes dir), else a new one named after the remote or the folder.
func EnsureRepository(store *storepkg.Store, projectID, dir string) (projects.Repository, error) {
	abs, err := absoluteDir(dir)
	if err != nil {
		return projects.Repository{}, err
	}
	existing, err := store.ListRepositories(projectID)
	if err != nil {
		return projects.Repository{}, err
	}
	for _, repo := range existing {
		if repo.LocalPath != "" && samePath(ExpandPath(repo.LocalPath), abs) {
			return repo, nil
		}
	}
	remote := RepositoryRemote(abs)
	for _, repo := range existing {
		if remote != "" && repo.Remote == remote {
			repo.LocalPath = abs
			return repo, store.SaveRepository(repo)
		}
	}
	name, taken := repoNameFor(remote, abs), map[string]bool{}
	for _, repo := range existing {
		taken[repo.Name] = true
	}
	for i := 2; taken[name]; i++ {
		name = fmt.Sprintf("%s-%d", strings.TrimSuffix(repoNameFor(remote, abs), fmt.Sprintf("-%d", i-1)), i)
	}
	repo, err := projects.NewRepository(ids.NewULID(), projectID, name, remote, abs)
	if err != nil {
		return projects.Repository{}, err
	}
	return repo, store.SaveRepository(repo)
}

func absoluteDir(path string) (string, error) {
	expanded := ExpandPath(path)
	if expanded == "" {
		return "", fmt.Errorf("repository folder is empty")
	}
	abs, err := filepath.Abs(expanded)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(abs)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", fmt.Errorf("repository folder %s does not exist", abs)
		}
		return "", err
	}
	if !info.IsDir() {
		return "", fmt.Errorf("repository folder %s is not a directory", abs)
	}
	return abs, nil
}

func samePath(a, b string) bool {
	return filepath.Clean(a) == filepath.Clean(b)
}

// resolveNodeDirs rewrites each node's `dir: <folder>` line to `repo: <name>`,
// the repository cloned there (created when the project has none). A dry run
// creates nothing and returns the names it would create.
func resolveNodeDirs(store *storepkg.Store, projectID, text string, dryRun bool) (string, []string, error) {
	doc, _ := polter.Decode(text)
	lines := strings.Split(text, "\n")
	var proposed []string
	for _, node := range doc.Nodes {
		for _, entry := range node.Meta {
			if entry.Key != "dir" || entry.Line < 1 || entry.Line > len(lines) {
				continue
			}
			var name string
			if dryRun {
				abs, err := absoluteDir(entry.Value)
				if err != nil {
					return "", nil, err
				}
				name = repoNameFor(RepositoryRemote(abs), abs)
				repos, err := store.ListRepositories(projectID)
				if err != nil {
					return "", nil, err
				}
				for _, repo := range repos {
					if samePath(ExpandPath(repo.LocalPath), abs) {
						name = repo.Name
					}
				}
				proposed = append(proposed, name)
			} else {
				repo, err := EnsureRepository(store, projectID, entry.Value)
				if err != nil {
					return "", nil, err
				}
				name = repo.Name
			}
			line := lines[entry.Line-1]
			if i := strings.Index(line, "dir:"); i >= 0 {
				rest := line[i+len("dir:"):]
				end := len(rest)
				if j := strings.Index(rest, " · "); j >= 0 {
					end = j
				}
				lines[entry.Line-1] = line[:i] + "repo: " + name + rest[end:]
			}
		}
	}
	return strings.Join(lines, "\n"), proposed, nil
}

// pruneRepositories removes the repositories a write unlinked from its last
// node, so a repository lives only while a component uses it.
func pruneRepositories(store *storepkg.Store, projectID string, ops []work.Op) error {
	for _, op := range ops {
		if op.Entity != work.EntityNode {
			continue
		}
		if name, ok := op.Before["repo"].(string); ok && name != "" {
			if _, err := store.DeleteUnusedRepository(projectID, name); err != nil {
				return err
			}
		}
	}
	return nil
}

// ErrPickRepository means a run or read needs a repository and the project
// has several (or none) with nothing naming one.
var ErrPickRepository = errors.New("pick a repository: the project has none or several, and nothing names one")

// RunDir picks the clone a dispatch run works in: the named repository, else
// the card's component repository, else the project's only repository.
func RunDir(store *storepkg.Store, projectID, repo, cardSlug string) (string, error) {
	checkouts, err := projectCheckouts(store, projectID)
	if err != nil {
		return "", err
	}
	if repo = strings.TrimSpace(repo); repo != "" {
		if dir := checkoutDir(checkouts, repo); dir != "" {
			return dir, nil
		}
		return "", fmt.Errorf("repository %q has no clone on this machine", repo)
	}
	if cardSlug = strings.TrimSpace(cardSlug); cardSlug != "" {
		snapshot, err := store.LoadWorkSnapshot(projectID)
		if err != nil {
			return "", err
		}
		if card, ok := snapshot.Card(cardSlug); ok {
			for _, node := range snapshot.Nodes {
				if node.Path == card.Under && node.Repo != "" {
					if dir := checkoutDir(checkouts, node.Repo); dir != "" {
						return dir, nil
					}
				}
			}
		}
	}
	if dir := checkoutDir(checkouts, ""); dir != "" {
		return dir, nil
	}
	return "", ErrPickRepository
}

// FirstCheckout is the clone of the project's first repository by name, empty
// when none is cloned here.
func FirstCheckout(store *storepkg.Store, projectID string) string {
	checkouts, err := projectCheckouts(store, projectID)
	if err != nil || len(checkouts) == 0 {
		return ""
	}
	return checkouts[0].root
}

// withDefaultRepo returns nodes where a node naming no repository belongs to
// the project's only one, so a one-repository project needs no repo: lines.
func withDefaultRepo(nodes []structure.Node, checkouts []gitCheckout) []structure.Node {
	if len(checkouts) != 1 {
		return nodes
	}
	out := make([]structure.Node, len(nodes))
	for i, node := range nodes {
		if node.Repo == "" {
			node.Repo = checkouts[0].name
		}
		out[i] = node
	}
	return out
}
