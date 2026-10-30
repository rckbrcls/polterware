package wedge

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/polterware/polterware/backend/domains/agentrun"
	"github.com/polterware/polterware/backend/domains/projects"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// InitInput registers a local project in the SQLite store. Dir is optional:
// given a folder, the project starts with one component linked to the
// repository cloned there.
type InitInput struct {
	ID   string
	Name string
	Dir  string
}

func InitProject(store *storepkg.Store, in InitInput) (projects.Project, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return projects.Project{}, fmt.Errorf("name is required")
	}
	dir := strings.TrimSpace(in.Dir)
	var err error
	if dir != "" {
		if dir, err = absoluteDir(dir); err != nil {
			return projects.Project{}, err
		}
	}
	id := strings.TrimSpace(in.ID)
	if id == "" {
		id, err = newProjectID()
		if err != nil {
			return projects.Project{}, err
		}
	}
	project, err := projects.NewProject(id, name)
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
	if dir != "" {
		if err := linkInitialComponent(store, project.ID, dir); err != nil {
			return projects.Project{}, err
		}
	}
	return project, nil
}

// linkInitialComponent gives a new project its first component, named after
// the folder and linked to the repository cloned there. A project that already
// has nodes keeps them.
func linkInitialComponent(store *storepkg.Store, projectID, dir string) error {
	snapshot, err := store.LoadWorkSnapshot(projectID)
	if err != nil || len(snapshot.Nodes) > 0 {
		return err
	}
	slug := repoNameFor("", dir)
	text := fmt.Sprintf("---\npolter: 1\n---\n\n# %s: %s\nlevel: component\ndir: %s\n", slug, filepath.Base(dir), dir)
	_, err = ApplyPolter(store, ApplyInput{
		ProjectID: projectID, Text: text, ActorKind: agentrun.ActorKindHuman, Tool: "init",
		Summary: "Link the project folder", Rationale: "The project was created from this folder",
	})
	return err
}

func newProjectID() (string, error) {
	var buf [4]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return "proj-" + hex.EncodeToString(buf[:]), nil
}
