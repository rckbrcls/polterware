package sqlite

import (
	"strings"
	"time"

	"github.com/polterware/polterware/backend/domains/filters"
	"github.com/polterware/polterware/backend/platform/ids"
)

// ListSavedFilters returns one surface's saved filters in position order. An
// empty projectID lists the app-level surface.
func (s *Store) ListSavedFilters(projectID, surface string) ([]filters.SavedFilter, error) {
	return querySavedFilters(s.DB, strings.TrimSpace(projectID), strings.TrimSpace(surface))
}

// SaveSavedFilter upserts by (project, surface, name). A new name is appended
// after the surface's filters; an existing one keeps its id and position and
// takes the new payload. Saved filters are UI preferences, so no change_ops
// are written.
func (s *Store) SaveSavedFilter(filter filters.SavedFilter) (filters.SavedFilter, error) {
	prepared, err := filters.PrepareSave(filter)
	if err != nil {
		return filters.SavedFilter{}, err
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return filters.SavedFilter{}, err
	}
	defer func() { _ = tx.Rollback() }()

	existing, err := querySavedFilters(tx, prepared.ProjectID, prepared.Surface)
	if err != nil {
		return filters.SavedFilter{}, err
	}
	stamp := time.Now().UTC().Format(time.RFC3339)
	for _, current := range existing {
		if current.Name != prepared.Name {
			continue
		}
		if current.PayloadJSON == prepared.PayloadJSON {
			return current, nil
		}
		if _, err := tx.Exec(`UPDATE saved_filters SET payload_json=?, updated_at=? WHERE id=?`,
			prepared.PayloadJSON, stamp, current.ID); err != nil {
			return filters.SavedFilter{}, err
		}
		if err := tx.Commit(); err != nil {
			return filters.SavedFilter{}, err
		}
		current.PayloadJSON = prepared.PayloadJSON
		current.UpdatedAt, _ = time.Parse(time.RFC3339, stamp)
		return current, nil
	}
	prepared.ID = ids.NewULID()
	prepared.Position = filters.NextPosition(existing)
	if _, err := tx.Exec(`INSERT INTO saved_filters(id,project_id,surface,name,payload_json,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`,
		prepared.ID, nullableProjectID(prepared.ProjectID), prepared.Surface, prepared.Name, prepared.PayloadJSON, prepared.Position, stamp, stamp); err != nil {
		if strings.Contains(err.Error(), "FOREIGN KEY constraint failed") {
			return filters.SavedFilter{}, filters.ErrProjectNotFound
		}
		return filters.SavedFilter{}, err
	}
	if err := tx.Commit(); err != nil {
		return filters.SavedFilter{}, err
	}
	prepared.CreatedAt, _ = time.Parse(time.RFC3339, stamp)
	prepared.UpdatedAt = prepared.CreatedAt
	return prepared, nil
}

// DeleteSavedFilter removes one saved filter. Positions of the rest are left
// as they are; list order only depends on their relative order.
func (s *Store) DeleteSavedFilter(id string) error {
	result, err := s.DB.Exec(`DELETE FROM saved_filters WHERE id=?`, id)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return filters.ErrNotFound
	}
	return nil
}

func querySavedFilters(q milestoneQuery, projectID, surface string) ([]filters.SavedFilter, error) {
	rows, err := q.Query(`SELECT id,COALESCE(project_id,''),surface,name,payload_json,position,created_at,updated_at
		FROM saved_filters WHERE COALESCE(project_id,'')=? AND surface=? ORDER BY position, name`, projectID, surface)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []filters.SavedFilter
	for rows.Next() {
		var item filters.SavedFilter
		var created, updated string
		if err := rows.Scan(&item.ID, &item.ProjectID, &item.Surface, &item.Name, &item.PayloadJSON, &item.Position, &created, &updated); err != nil {
			return nil, err
		}
		item.CreatedAt, _ = time.Parse(time.RFC3339, created)
		item.UpdatedAt, _ = time.Parse(time.RFC3339, updated)
		out = append(out, item)
	}
	return out, rows.Err()
}

func nullableProjectID(projectID string) any {
	if projectID == "" {
		return nil
	}
	return projectID
}
