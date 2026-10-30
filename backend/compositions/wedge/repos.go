package wedge

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/polterware/polterware/backend/domains/projects"
	"github.com/polterware/polterware/backend/platform/ids"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// AddProjectRepo registers an extra local checkout. The project root stays the
// primary checkpoint and cannot be registered again.
func AddProjectRepo(store *storepkg.Store, projectID, name, path string) (projects.Repository, error) {
	if projectID == "" {
		return projects.Repository{}, fmt.Errorf("project id is required")
	}
	project, err := store.GetProject(projectID)
	if errors.Is(err, sql.ErrNoRows) {
		return projects.Repository{}, fmt.Errorf("unknown project")
	}
	if err != nil {
		return projects.Repository{}, err
	}
	abs, err := absoluteDir(path)
	if err != nil {
		return projects.Repository{}, err
	}
	root, err := absoluteDir(project.RootPath)
	if err != nil {
		return projects.Repository{}, fmt.Errorf("project root path does not exist")
	}
	if samePath(abs, root) {
		return projects.Repository{}, fmt.Errorf("the project directory is already the primary checkout")
	}
	if !projects.ValidRepoName(name) {
		return projects.Repository{}, fmt.Errorf("repository name must be a lowercase slug")
	}
	existing, err := store.ListProjectRepos(projectID)
	if err != nil {
		return projects.Repository{}, err
	}
	for _, repo := range existing {
		if repo.Name == name {
			return projects.Repository{}, fmt.Errorf("repository %q already exists", name)
		}
		if samePath(repo.Path, abs) {
			return projects.Repository{}, fmt.Errorf("repository path already registered as %s", repo.Name)
		}
	}
	repo, err := projects.NewRepository(ids.NewULID(), projectID, name, abs)
	if err != nil {
		return projects.Repository{}, err
	}
	if err := store.SaveProjectRepo(repo); err != nil {
		return projects.Repository{}, err
	}
	return repo, nil
}

// RemoveProjectRepo deletes one named checkout.
func RemoveProjectRepo(store *storepkg.Store, projectID, name string) error {
	if projectID == "" || name == "" {
		return fmt.Errorf("project id and repository name are required")
	}
	if _, err := store.GetProject(projectID); errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("unknown project")
	} else if err != nil {
		return err
	}
	err := store.DeleteProjectRepo(projectID, name)
	if errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("unknown repository %q", name)
	}
	return err
}

func absoluteDir(path string) (string, error) {
	expanded := ExpandRootPath(path)
	if expanded == "" {
		return "", fmt.Errorf("repository path is empty")
	}
	abs, err := filepath.Abs(expanded)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(abs)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", fmt.Errorf("repository path does not exist")
		}
		return "", err
	}
	if !info.IsDir() {
		return "", fmt.Errorf("repository path is not a directory")
	}
	return abs, nil
}

func samePath(a, b string) bool {
	return filepath.Clean(a) == filepath.Clean(b)
}
