package sqlite

import (
	"github.com/polterware/polterware/backend/domains/integrations"
	"github.com/polterware/polterware/backend/domains/projects"
)

func (s *Store) SaveProjectSettings(settings projects.Settings) error {
	_, err := s.DB.Exec(`INSERT INTO project_settings(project_id,description,default_environment_id,repository) VALUES(?,?,?,?)
		ON CONFLICT(project_id) DO UPDATE SET description=excluded.description,default_environment_id=excluded.default_environment_id,repository=excluded.repository`,
		settings.ProjectID, settings.Description, nullable(settings.DefaultEnvironmentID), settings.Repository)
	return err
}

func (s *Store) GetProjectSettings(projectID string) (projects.Settings, error) {
	var item projects.Settings
	var defaultEnv string
	err := s.DB.QueryRow(`SELECT project_id,description,COALESCE(default_environment_id,''),repository,agents_sync FROM project_settings WHERE project_id=?`, projectID).
		Scan(&item.ProjectID, &item.Description, &defaultEnv, &item.Repository, &item.AgentsSync)
	item.DefaultEnvironmentID = defaultEnv
	return item, err
}

// SetAgentsSync turns AGENTS.md sync on or off for a project, creating its
// settings row when it has none.
func (s *Store) SetAgentsSync(projectID string, on bool) error {
	_, err := s.DB.Exec(`INSERT INTO project_settings(project_id,agents_sync) VALUES(?,?)
		ON CONFLICT(project_id) DO UPDATE SET agents_sync=excluded.agents_sync`, projectID, on)
	return err
}

// AgentsSyncProjects lists the projects with AGENTS.md sync on.
func (s *Store) AgentsSyncProjects() ([]string, error) {
	rows, err := s.DB.Query(`SELECT ps.project_id FROM project_settings ps JOIN projects p ON p.id = ps.project_id
		WHERE ps.agents_sync = 1 AND p.status = 'active' ORDER BY ps.project_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func (s *Store) SaveIntegrationResource(resource integrations.Resource) error {
	_, err := s.DB.Exec(`INSERT INTO integration_resources(id,connection_id,name,kind,external_id,environment_id,status) VALUES(?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET connection_id=excluded.connection_id,name=excluded.name,kind=excluded.kind,external_id=excluded.external_id,environment_id=excluded.environment_id,status=excluded.status`,
		resource.ID, resource.ConnectionID, resource.Name, resource.Kind, resource.ExternalID, nullable(resource.EnvironmentID), resource.Status)
	return err
}

func (s *Store) DeleteIntegrationResourcesByConnection(connectionID string) error {
	_, err := s.DB.Exec(`DELETE FROM integration_resources WHERE connection_id=?`, connectionID)
	return err
}

func (s *Store) CountIntegrationResourcesByConnection(connectionID string) (int, error) {
	var count int
	err := s.DB.QueryRow(`SELECT COUNT(*) FROM integration_resources WHERE connection_id=?`, connectionID).Scan(&count)
	return count, err
}

func (s *Store) ListIntegrationResources(projectID string) ([]integrations.Resource, error) {
	rows, err := s.DB.Query(`SELECT r.id,r.connection_id,r.name,r.kind,r.external_id,COALESCE(r.environment_id,''),r.status
		FROM integration_resources r
		JOIN integration_connections c ON c.id = r.connection_id
		WHERE c.project_id=? ORDER BY r.name`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []integrations.Resource
	for rows.Next() {
		var item integrations.Resource
		if err := rows.Scan(&item.ID, &item.ConnectionID, &item.Name, &item.Kind, &item.ExternalID, &item.EnvironmentID, &item.Status); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (s *Store) SaveIntegrationSyncRun(run integrations.SyncRun) error {
	_, err := s.DB.Exec(`INSERT INTO integration_sync_runs(id,connection_id,started_at,finished_at,result,imported,changed,message) VALUES(?,?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET connection_id=excluded.connection_id,started_at=excluded.started_at,finished_at=excluded.finished_at,result=excluded.result,imported=excluded.imported,changed=excluded.changed,message=excluded.message`,
		run.ID, run.ConnectionID, run.StartedAt, run.FinishedAt, run.Result, run.Imported, run.Changed, run.Message)
	return err
}

func (s *Store) ListIntegrationSyncRuns(projectID string) ([]integrations.SyncRun, error) {
	rows, err := s.DB.Query(`SELECT r.id,r.connection_id,r.started_at,r.finished_at,r.result,r.imported,r.changed,r.message
		FROM integration_sync_runs r
		JOIN integration_connections c ON c.id = r.connection_id
		WHERE c.project_id=? ORDER BY r.started_at DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []integrations.SyncRun
	for rows.Next() {
		var item integrations.SyncRun
		if err := rows.Scan(&item.ID, &item.ConnectionID, &item.StartedAt, &item.FinishedAt, &item.Result, &item.Imported, &item.Changed, &item.Message); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}
