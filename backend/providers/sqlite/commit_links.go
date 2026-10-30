package sqlite

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/polterware/polterware/backend/domains/work"
	"github.com/polterware/polterware/backend/platform/ids"
)

// InsertCommitLink stores a link a person made between one commit and one
// task. Links cited in commit subjects are derived when Drift runs.
func (s *Store) InsertCommitLink(link work.CommitLink, now time.Time) error {
	id := link.ID
	if id == "" {
		id = ids.NewULID()
	}
	_, err := s.DB.Exec(`INSERT OR IGNORE INTO work_commit_links(id,project_id,repo,sha,task_id,created_at) VALUES(?,?,?,?,?,?)`,
		id, link.ProjectID, link.Repo, link.SHA, link.TaskID, now.UTC().Format(time.RFC3339))
	return err
}

// ListCommitLinks returns every stored commit-to-task link for a project.
func (s *Store) ListCommitLinks(projectID string) ([]work.CommitLink, error) {
	rows, err := s.DB.Query(`SELECT id, project_id, repo, sha, task_id, created_at
		FROM work_commit_links WHERE project_id=? ORDER BY created_at, id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []work.CommitLink
	for rows.Next() {
		var link work.CommitLink
		var created string
		if err := rows.Scan(&link.ID, &link.ProjectID, &link.Repo, &link.SHA, &link.TaskID, &created); err != nil {
			return nil, err
		}
		link.CreatedAt, _ = time.Parse(time.RFC3339, created)
		out = append(out, link)
	}
	return out, rows.Err()
}

func reindexWorkCardFTS(tx *sql.Tx, cardID string) error {
	var projectID, slug, title, intent, status string
	err := tx.QueryRow(`SELECT project_id, slug, title, intent, status FROM work_cards WHERE id=?`, cardID).
		Scan(&projectID, &slug, &title, &intent, &status)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	rows, err := tx.Query(`SELECT id, title, state FROM work_tasks WHERE card_id=?`, cardID)
	if err != nil {
		return err
	}
	defer rows.Close()
	type taskRow struct {
		id, title, state string
	}
	var tasks []taskRow
	for rows.Next() {
		var task taskRow
		if err := rows.Scan(&task.id, &task.title, &task.state); err != nil {
			return err
		}
		tasks = append(tasks, task)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}
	for _, task := range tasks {
		if _, err := tx.Exec(`DELETE FROM work_fts WHERE task_id=?`, task.id); err != nil {
			return err
		}
		if status != work.CardActive || task.state == work.TaskDropped {
			continue
		}
		document := strings.TrimSpace(task.title + " " + title + " " + intent)
		if _, err := tx.Exec(`INSERT INTO work_fts(task_id, project_id, card_slug, title) VALUES(?,?,?,?)`,
			task.id, projectID, slug, document); err != nil {
			return err
		}
	}
	return nil
}
