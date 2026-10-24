package sqlite

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/polterware/polterware/backend/domains/architecture"
	"github.com/polterware/polterware/backend/domains/integrations"
	"github.com/polterware/polterware/backend/domains/knowledge"
	"github.com/polterware/polterware/backend/domains/projects"
	dbsqlite "github.com/polterware/polterware/backend/platform/db/sqlite"
)

type Store struct{ DB *sql.DB }

func New(path string) (*Store, error) {
	db, err := dbsqlite.Open(path)
	if err != nil {
		return nil, err
	}
	if err := dbsqlite.Migrate(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	if err := dbsqlite.LoadProjectColumns(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	return &Store{DB: db}, nil
}

func (s *Store) Close() error { return s.DB.Close() }

func (s *Store) SaveProject(project projects.Project) error {
	if project.Status == "" {
		project.Status = projects.StatusActive
	}
	archivedAt := ""
	if !project.ArchivedAt.IsZero() {
		archivedAt = project.ArchivedAt.Format(time.RFC3339)
	}
	_, err := s.DB.Exec(`INSERT INTO projects(id,name,root_path,created_at,updated_at,status,archived_at) VALUES(?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET name=excluded.name,root_path=excluded.root_path,updated_at=excluded.updated_at,status=excluded.status,archived_at=excluded.archived_at`,
		project.ID, project.Name, project.RootPath, project.CreatedAt.Format(time.RFC3339), project.UpdatedAt.Format(time.RFC3339), project.Status, archivedAt)
	return err
}

func (s *Store) GetProject(id string) (projects.Project, error) {
	var item projects.Project
	var created, updated, archived string
	err := s.DB.QueryRow(`SELECT id,name,root_path,created_at,updated_at,status,archived_at FROM projects WHERE id=?`, id).
		Scan(&item.ID, &item.Name, &item.RootPath, &created, &updated, &item.Status, &archived)
	if err != nil {
		return projects.Project{}, err
	}
	item.CreatedAt, _ = time.Parse(time.RFC3339, created)
	item.UpdatedAt, _ = time.Parse(time.RFC3339, updated)
	if archived != "" {
		item.ArchivedAt, _ = time.Parse(time.RFC3339, archived)
	}
	if item.Status == "" {
		item.Status = projects.StatusActive
	}
	return item, nil
}

func (s *Store) ListProjects(includeArchived bool) ([]projects.Project, error) {
	query := `SELECT id,name,root_path,created_at,updated_at,status,archived_at FROM projects`
	if !includeArchived {
		query += ` WHERE status != 'archived'`
	}
	query += ` ORDER BY created_at, rowid`
	rows, err := s.DB.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []projects.Project
	for rows.Next() {
		var item projects.Project
		var created, updated, archived string
		if err := rows.Scan(&item.ID, &item.Name, &item.RootPath, &created, &updated, &item.Status, &archived); err != nil {
			return nil, err
		}
		item.CreatedAt, _ = time.Parse(time.RFC3339, created)
		item.UpdatedAt, _ = time.Parse(time.RFC3339, updated)
		if archived != "" {
			item.ArchivedAt, _ = time.Parse(time.RFC3339, archived)
		}
		if item.Status == "" {
			item.Status = projects.StatusActive
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (s *Store) ArchiveProject(id string) (projects.Project, error) {
	project, err := s.GetProject(id)
	if err != nil {
		return projects.Project{}, err
	}
	now := time.Now().UTC()
	project.Status = projects.StatusArchived
	project.ArchivedAt = now
	project.UpdatedAt = now
	if err := s.SaveProject(project); err != nil {
		return projects.Project{}, err
	}
	return project, nil
}

func (s *Store) SaveEnvironment(environment projects.Environment) error {
	if environment.Protection == "" {
		environment.Protection = "standard"
	}
	defaultFlag := 0
	if environment.IsDefault {
		defaultFlag = 1
	}
	_, err := s.DB.Exec(`INSERT INTO environments(id,project_id,name,kind,protection,is_default,description) VALUES(?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,name=excluded.name,kind=excluded.kind,protection=excluded.protection,is_default=excluded.is_default,description=excluded.description`,
		environment.ID, environment.ProjectID, environment.Name, environment.Kind, environment.Protection, defaultFlag, environment.Description)
	if err != nil {
		return err
	}
	_, _ = s.SyncProjectModel(environment.ProjectID)
	return nil
}

func (s *Store) ListEnvironments(projectID string) ([]projects.Environment, error) {
	rows, err := s.DB.Query(`SELECT id,project_id,name,kind,protection,is_default,description FROM environments WHERE project_id=? ORDER BY name`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []projects.Environment
	for rows.Next() {
		var item projects.Environment
		var defaultFlag int
		if err := rows.Scan(&item.ID, &item.ProjectID, &item.Name, &item.Kind, &item.Protection, &defaultFlag, &item.Description); err != nil {
			return nil, err
		}
		item.IsDefault = defaultFlag != 0
		result = append(result, item)
	}
	return result, rows.Err()
}

func (s *Store) GetEnvironment(id string) (projects.Environment, error) {
	var item projects.Environment
	var defaultFlag int
	err := s.DB.QueryRow(`SELECT id,project_id,name,kind,protection,is_default,description FROM environments WHERE id=?`, id).
		Scan(&item.ID, &item.ProjectID, &item.Name, &item.Kind, &item.Protection, &defaultFlag, &item.Description)
	if err != nil {
		return projects.Environment{}, err
	}
	item.IsDefault = defaultFlag != 0
	return item, nil
}

func (s *Store) DeleteEnvironment(id, projectID string) error {
	envs, err := s.ListEnvironments(projectID)
	if err != nil {
		return err
	}
	if len(envs) <= 1 {
		return errors.New("cannot delete the last environment")
	}
	var target *projects.Environment
	var replacement *projects.Environment
	for i := range envs {
		env := envs[i]
		if env.ID == id {
			if env.ProjectID != projectID {
				return errors.New("environment does not belong to project")
			}
			target = &env
			continue
		}
		if replacement == nil {
			replacement = &env
		}
	}
	if target == nil {
		return sql.ErrNoRows
	}
	if _, err := s.DB.Exec(`DELETE FROM environments WHERE id=? AND project_id=?`, id, projectID); err != nil {
		return err
	}
	if target.IsDefault && replacement != nil {
		replacement.IsDefault = true
		if err := s.SaveEnvironment(*replacement); err != nil {
			return err
		}
		settings, err := s.GetProjectSettings(projectID)
		if err == nil {
			settings.DefaultEnvironmentID = replacement.ID
			_ = s.SaveProjectSettings(settings)
		} else if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
	}
	return nil
}

func (s *Store) GetLayout(projectID string) (architecture.Layout, error) {
	var layout architecture.Layout
	err := s.DB.QueryRow(`SELECT id,project_id,revision,body_json FROM architecture_layouts WHERE project_id=?`, projectID).
		Scan(&layout.ID, &layout.ProjectID, &layout.Revision, &layout.BodyJSON)
	return layout, err
}

func (s *Store) UpdateLayout(projectID string, expectedRevision int64, body string) (architecture.Layout, error) {
	current, err := s.GetLayout(projectID)
	if errors.Is(err, sql.ErrNoRows) {
		current = architecture.Layout{ID: "layout-" + projectID, ProjectID: projectID, Revision: 0, BodyJSON: `{"nodes":[],"edges":[]}`}
	} else if err != nil {
		return current, err
	}
	updated, err := architecture.UpdateLayout(current, expectedRevision, body)
	if err != nil {
		return current, err
	}
	_, err = s.DB.Exec(`INSERT INTO architecture_layouts(id,project_id,revision,body_json) VALUES(?,?,?,?)
		ON CONFLICT(project_id) DO UPDATE SET revision=excluded.revision,body_json=excluded.body_json`, updated.ID, updated.ProjectID, updated.Revision, updated.BodyJSON)
	if err != nil {
		return updated, err
	}
	_, _ = s.syncArchitectureLayout(projectID, updated.BodyJSON, true)
	return updated, nil
}

func (s *Store) SaveKnowledge(item knowledge.Item) error {
	tags, _ := json.Marshal(item.Tags)
	if item.ExtraJSON == "" {
		item.ExtraJSON = "{}"
	}
	_, err := s.DB.Exec(`INSERT INTO knowledge_items(id,project_id,title,body,kind,tags_json,summary,owner,status,extra_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,title=excluded.title,body=excluded.body,kind=excluded.kind,tags_json=excluded.tags_json,summary=excluded.summary,owner=excluded.owner,status=excluded.status,extra_json=excluded.extra_json,updated_at=excluded.updated_at`,
		item.ID, item.ProjectID, item.Title, item.Body, item.Kind, string(tags), item.Summary, item.Owner, item.Status, item.ExtraJSON, item.CreatedAt.Format(time.RFC3339), item.UpdatedAt.Format(time.RFC3339))
	if err != nil {
		return err
	}
	return s.indexKnowledgeFTS(item)
}

func (s *Store) GetKnowledge(id string) (knowledge.Item, error) {
	var item knowledge.Item
	var tags, created, updated string
	err := s.DB.QueryRow(
		`SELECT id,project_id,title,body,kind,tags_json,summary,owner,status,extra_json,created_at,updated_at
		 FROM knowledge_items WHERE id=?`, id,
	).Scan(
		&item.ID, &item.ProjectID, &item.Title, &item.Body, &item.Kind, &tags,
		&item.Summary, &item.Owner, &item.Status, &item.ExtraJSON, &created, &updated,
	)
	if err != nil {
		return knowledge.Item{}, err
	}
	_ = json.Unmarshal([]byte(tags), &item.Tags)
	item.CreatedAt, _ = time.Parse(time.RFC3339, created)
	item.UpdatedAt, _ = time.Parse(time.RFC3339, updated)
	return item, nil
}

func (s *Store) ListKnowledge(projectID, kind string) ([]knowledge.Item, error) {
	query := `SELECT id,project_id,title,body,kind,tags_json,summary,owner,status,extra_json,created_at,updated_at FROM knowledge_items WHERE project_id=?`
	args := []any{projectID}
	if kind != "" {
		query += ` AND kind=?`
		args = append(args, kind)
	}
	query += ` ORDER BY updated_at DESC`
	rows, err := s.DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []knowledge.Item
	for rows.Next() {
		var item knowledge.Item
		var tags, created, updated string
		if err := rows.Scan(&item.ID, &item.ProjectID, &item.Title, &item.Body, &item.Kind, &tags, &item.Summary, &item.Owner, &item.Status, &item.ExtraJSON, &created, &updated); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(tags), &item.Tags)
		item.CreatedAt, _ = time.Parse(time.RFC3339, created)
		item.UpdatedAt, _ = time.Parse(time.RFC3339, updated)
		result = append(result, item)
	}
	return result, rows.Err()
}

func (s *Store) DeleteKnowledge(id string) error {
	if _, err := s.DB.Exec(`DELETE FROM knowledge_fts WHERE knowledge_id=?`, id); err != nil {
		return err
	}
	_, err := s.DB.Exec(`DELETE FROM knowledge_items WHERE id=?`, id)
	return err
}

func (s *Store) SaveConnection(connection integrations.Connection) error {
	_, err := s.DB.Exec(`INSERT INTO integration_connections(id,project_id,provider_id,status,label,environment_id,last_sync_at,summary,cli_command,sync_interval,freshness,error_message) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,provider_id=excluded.provider_id,status=excluded.status,label=excluded.label,environment_id=excluded.environment_id,last_sync_at=excluded.last_sync_at,summary=excluded.summary,cli_command=excluded.cli_command,sync_interval=excluded.sync_interval,freshness=excluded.freshness,error_message=excluded.error_message`,
		connection.ID, connection.ProjectID, connection.ProviderID, connection.Status, connection.Label, nullable(connection.EnvironmentID), connection.LastSyncAt, connection.Summary, connection.CLICommand, connection.SyncInterval, connection.Freshness, connection.ErrorMessage)
	return err
}

func (s *Store) GetConnection(id string) (integrations.Connection, error) {
	var item integrations.Connection
	err := s.DB.QueryRow(
		`SELECT id,project_id,provider_id,status,label,COALESCE(environment_id,''),last_sync_at,summary,cli_command,sync_interval,freshness,error_message FROM integration_connections WHERE id=?`,
		id,
	).Scan(
		&item.ID, &item.ProjectID, &item.ProviderID, &item.Status, &item.Label, &item.EnvironmentID,
		&item.LastSyncAt, &item.Summary, &item.CLICommand, &item.SyncInterval, &item.Freshness, &item.ErrorMessage,
	)
	return item, err
}

func (s *Store) ListConnections(projectID string) ([]integrations.Connection, error) {
	rows, err := s.DB.Query(`SELECT id,project_id,provider_id,status,label,COALESCE(environment_id,''),last_sync_at,summary,cli_command,sync_interval,freshness,error_message FROM integration_connections WHERE project_id=? ORDER BY label`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []integrations.Connection
	for rows.Next() {
		var item integrations.Connection
		if err := rows.Scan(&item.ID, &item.ProjectID, &item.ProviderID, &item.Status, &item.Label, &item.EnvironmentID, &item.LastSyncAt, &item.Summary, &item.CLICommand, &item.SyncInterval, &item.Freshness, &item.ErrorMessage); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (s *Store) StoreHealth() (bool, string, error) {
	var quarantined int
	var message string
	err := s.DB.QueryRow(`SELECT quarantined,message FROM store_health WHERE id=1`).Scan(&quarantined, &message)
	return quarantined != 0, message, err
}

func (s *Store) Reset() error {
	tables := []string{
		"node_deployments",
		"integration_sync_runs",
		"integration_resources",
		"architecture_view_members",
		"knowledge_items",
		"architecture_views",
		"architecture_layouts",
		"project_settings",
		"integration_connections",
		"environments",
		"projects",
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	for _, table := range tables {
		if _, err := tx.Exec(`DELETE FROM ` + table); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}
