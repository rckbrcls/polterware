package sqlite

import (
	"time"

	"github.com/polterware/polterware/backend/domains/inbox"
	"github.com/polterware/polterware/backend/platform/ids"
)

// InsertInboxDisposition appends one disposition row. Rows are never updated.
func (s *Store) InsertInboxDisposition(projectID string, d inbox.Disposition) error {
	_, err := s.DB.Exec(`INSERT INTO inbox_dispositions(id,project_id,item_key,action,actor,note,created_at)
		VALUES(?,?,?,?,?,?,?)`,
		ids.NewULID(), projectID, d.Key, d.Action, d.Actor, d.Note, d.CreatedAt.UTC().Format(time.RFC3339Nano))
	return err
}

// ListInboxDispositions returns the latest disposition per item key.
func (s *Store) ListInboxDispositions(projectID string) ([]inbox.Disposition, error) {
	rows, err := s.DB.Query(`SELECT item_key,action,actor,note,created_at FROM inbox_dispositions
		WHERE project_id=? ORDER BY item_key, created_at, id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	latest := map[string]int{}
	var out []inbox.Disposition
	for rows.Next() {
		var d inbox.Disposition
		var created string
		if err := rows.Scan(&d.Key, &d.Action, &d.Actor, &d.Note, &created); err != nil {
			return nil, err
		}
		d.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
		if i, ok := latest[d.Key]; ok {
			out[i] = d
			continue
		}
		latest[d.Key] = len(out)
		out = append(out, d)
	}
	return out, rows.Err()
}

// ListNodeDeployLinks returns every deploy link on an active Structure node.
func (s *Store) ListNodeDeployLinks(projectID string) ([]inbox.DeployLink, error) {
	rows, err := s.DB.Query(`SELECT d.node_id,n.path,d.environment_id,COALESCE(e.name,''),d.provider,d.resource
		FROM node_deployments d
		JOIN structure_nodes n ON n.id=d.node_id
		LEFT JOIN environments e ON e.id=d.environment_id
		WHERE d.project_id=? AND n.status<>'removed'
		ORDER BY n.path, e.name, d.environment_id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []inbox.DeployLink
	for rows.Next() {
		var link inbox.DeployLink
		if err := rows.Scan(&link.NodeID, &link.NodePath, &link.EnvironmentID, &link.Environment, &link.Provider, &link.Resource); err != nil {
			return nil, err
		}
		out = append(out, link)
	}
	return out, rows.Err()
}
