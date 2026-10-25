package wedge

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/polterware/polterware/backend/domains/projects"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// InitInput registers a local project in the SQLite store.
type InitInput struct {
	ID       string
	Name     string
	RootPath string
}

func InitProject(store *storepkg.Store, in InitInput) (projects.Project, error) {
	name := strings.TrimSpace(in.Name)
	rootPath := strings.TrimSpace(in.RootPath)
	if name == "" {
		return projects.Project{}, fmt.Errorf("name is required")
	}
	if rootPath == "" {
		return projects.Project{}, fmt.Errorf("path is required")
	}
	abs, err := filepath.Abs(ExpandRootPath(rootPath))
	if err != nil {
		return projects.Project{}, fmt.Errorf("resolve path: %w", err)
	}
	id := strings.TrimSpace(in.ID)
	if id == "" {
		id, err = newProjectID()
		if err != nil {
			return projects.Project{}, err
		}
	}
	project, err := projects.NewProject(id, name, abs)
	if err != nil {
		return projects.Project{}, err
	}
	if err := store.SaveProject(project); err != nil {
		return projects.Project{}, err
	}
	if _, err := store.GetProjectSettings(project.ID); err != nil {
		if err := store.SaveProjectSettings(projects.Settings{ProjectID: project.ID}); err != nil {
			return projects.Project{}, err
		}
	}
	envs, err := store.ListEnvironments(project.ID)
	if err != nil {
		return projects.Project{}, err
	}
	if len(envs) == 0 {
		envID := project.ID + "-local"
		env, err := projects.NewEnvironment(envID, project.ID, "local", "local")
		if err != nil {
			return projects.Project{}, err
		}
		env.IsDefault = true
		env.Protection = "relaxed"
		env.Description = "local environment"
		if err := store.SaveEnvironment(env); err != nil {
			return projects.Project{}, err
		}
		if err := store.SaveProjectSettings(projects.Settings{
			ProjectID:            project.ID,
			DefaultEnvironmentID: envID,
		}); err != nil {
			return projects.Project{}, err
		}
	}
	return project, nil
}

func newProjectID() (string, error) {
	var buf [4]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return "proj-" + hex.EncodeToString(buf[:]), nil
}
