package demoseed

import (
	"time"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/projects"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

const (
	ProjectID        = "proj-polter"
	EnvProductionID  = "env-polter-prod"
	EnvStagingID     = "env-polter-staging"
	EnvDevelopmentID = "env-polter-dev"

	// EmptyProjectID is a project with no content, to show every empty state.
	EmptyProjectID = "proj-empty"
)

func Defaults(store *storepkg.Store) error {
	var count int
	if err := store.DB.QueryRow(`SELECT COUNT(*) FROM projects`).Scan(&count); err != nil {
		return err
	}
	if count != 0 {
		return nil
	}
	if err := seedProject(store); err != nil {
		return err
	}
	if err := seedKnowledge(store); err != nil {
		return err
	}
	if _, err := store.SyncProjectModel(ProjectID); err != nil {
		return err
	}
	if err := seedKnowledgeLinks(store); err != nil {
		return err
	}
	if err := seedFacts(store); err != nil {
		return err
	}
	if err := seedWork(store); err != nil {
		return err
	}
	if err := seedIntegrations(store); err != nil {
		return err
	}
	return seedEmptyProject(store)
}

// seedEmptyProject creates a project the way a user-registered one starts:
// empty layout, default settings, and one local environment.
func seedEmptyProject(store *storepkg.Store) error {
	_, err := wedge.InitProject(store, wedge.InitInput{ID: EmptyProjectID, Name: "Empty project", RootPath: "~/projects/empty"})
	return err
}

func seedProject(store *storepkg.Store) error {
	created := time.Date(2026, 3, 12, 9, 14, 2, 0, time.UTC)
	project := projects.Project{
		ID: ProjectID, Name: "Polter", RootPath: "~/projects/polter",
		CreatedAt: created, UpdatedAt: created,
	}
	if err := store.SaveProject(project); err != nil {
		return err
	}
	environments := []projects.Environment{
		{ID: EnvProductionID, ProjectID: ProjectID, Name: "main", Kind: "production", Protection: "strict", IsDefault: true, Description: "Customer-facing production stage."},
		{ID: EnvStagingID, ProjectID: ProjectID, Name: "staging", Kind: "staging", Protection: "standard", Description: "Pre-production validation stage."},
		{ID: EnvDevelopmentID, ProjectID: ProjectID, Name: "dev", Kind: "development", Protection: "relaxed", Description: "Day-to-day engineering stage."},
	}
	for _, environment := range environments {
		if err := store.SaveEnvironment(environment); err != nil {
			return err
		}
	}
	return store.SaveProjectSettings(projects.Settings{
		ProjectID:            ProjectID,
		Description:          "Local project context for AI coding",
		DefaultEnvironmentID: EnvProductionID,
		Repository:           "polterware/polter",
	})
}
