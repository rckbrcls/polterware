package wedge_test

import (
	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/projects"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// initWithRepo registers a project whose only repository is cloned at root.
func initWithRepo(store *storepkg.Store, name, root string) (projects.Project, error) {
	project, err := wedge.InitProject(store, wedge.InitInput{Name: name})
	if err != nil {
		return project, err
	}
	_, err = wedge.EnsureRepository(store, project.ID, root)
	return project, err
}
