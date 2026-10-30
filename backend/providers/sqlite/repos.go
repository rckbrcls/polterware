package sqlite

import (
	"time"

	"github.com/polterware/polterware/backend/domains/projects"
)

// ListRepositories returns the project's repositories by name.
func (s *Store) ListRepositories(projectID string) ([]projects.Repository, error) {
	rows, err := s.DB.Query(`SELECT id, project_id, name, remote, local_path, created_at, updated_at FROM repositories WHERE project_id=? ORDER BY name`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []projects.Repository
	for rows.Next() {
		var item projects.Repository
		var created, updated string
		if err := rows.Scan(&item.ID, &item.ProjectID, &item.Name, &item.Remote, &item.LocalPath, &created, &updated); err != nil {
			return nil, err
		}
		item.CreatedAt, _ = time.Parse(time.RFC3339, created)
		item.UpdatedAt, _ = time.Parse(time.RFC3339, updated)
		out = append(out, item)
	}
	return out, rows.Err()
}

// SaveRepository inserts a repository or updates its remote and clone path.
func (s *Store) SaveRepository(repo projects.Repository) error {
	_, err := s.DB.Exec(`INSERT INTO repositories(id,project_id,name,remote,local_path,created_at,updated_at) VALUES(?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET remote=excluded.remote,local_path=excluded.local_path,updated_at=excluded.updated_at`,
		repo.ID, repo.ProjectID, repo.Name, repo.Remote, repo.LocalPath, repo.CreatedAt.Format(time.RFC3339), repo.UpdatedAt.Format(time.RFC3339))
	return err
}

// DeleteUnusedRepository removes a repository no Structure node and no task
// names any more. It reports whether it removed one.
func (s *Store) DeleteUnusedRepository(projectID, name string) (bool, error) {
	if name == "" {
		return false, nil
	}
	result, err := s.DB.Exec(`DELETE FROM repositories WHERE project_id=? AND name=?
		AND NOT EXISTS (SELECT 1 FROM structure_nodes WHERE project_id=? AND repo=? AND status<>'removed')
		AND NOT EXISTS (SELECT 1 FROM work_tasks t JOIN work_cards c ON c.id=t.card_id WHERE c.project_id=? AND t.repo=?)`,
		projectID, name, projectID, name, projectID, name)
	if err != nil {
		return false, err
	}
	n, err := result.RowsAffected()
	return n > 0, err
}
