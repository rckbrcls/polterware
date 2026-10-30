package sqlite

import (
	"database/sql"
	"fmt"

	"github.com/polterware/polterware/backend/domains/decision"
	"github.com/polterware/polterware/backend/domains/work"
)

// loadDecisions returns the project's Decisions with lifecycle state, oldest first.
func (s *Store) loadDecisions(projectID string) ([]decision.Decision, error) {
	contexts, err := s.contextPaths(projectID)
	if err != nil {
		return nil, err
	}
	var out []decision.Decision
	err = s.eachRow(`SELECT id,title,status,body,extra_json FROM knowledge_items
		WHERE project_id=? AND kind='decision' ORDER BY created_at, id`,
		projectID, func(rows *sql.Rows) error {
			var d decision.Decision
			var extra string
			if err := rows.Scan(&d.ID, &d.Title, &d.Status, &d.Body, &extra); err != nil {
				return err
			}
			d.Status = decision.Normalize(d.Status)
			d.Meta = decision.ParseMeta(extra)
			d.Scopes = contexts[d.ID]
			out = append(out, d)
			return nil
		})
	return out, err
}

// applyDecisionOp creates or updates one Decision knowledge item. Fields holds
// title, body, status, superseded_by, review_trigger, and status_reason;
// only the keys present change.
func applyDecisionOp(tx *sql.Tx, projectID string, op work.Op, now string) error {
	str := func(key string) (string, bool) {
		v, ok := op.Fields[key]
		if !ok {
			return "", false
		}
		text, _ := v.(string)
		return text, true
	}
	var title, body, status, extra string
	switch op.Kind {
	case work.OpCreate:
		title, _ = str("title")
		body, _ = str("body")
		status, _ = str("status")
		if status == "" {
			status = decision.StateProposed
		}
		meta := decision.Meta{}
		meta.SupersededBy, _ = str("superseded_by")
		meta.ReviewTrigger, _ = str("review_trigger")
		meta.StatusReason, _ = str("status_reason")
		extra = decision.MergeMeta("{}", meta)
		if _, err := tx.Exec(`INSERT INTO knowledge_items(id,project_id,title,body,kind,tags_json,summary,owner,status,extra_json,created_at,updated_at)
			VALUES(?,?,?,?,'decision','[]','','',?,?,?,?)`,
			op.EntityID, projectID, title, body, status, extra, now, now); err != nil {
			return err
		}
	case work.OpUpdate:
		var current string
		if err := tx.QueryRow(`SELECT title,body,status,extra_json FROM knowledge_items WHERE id=? AND kind='decision'`, op.EntityID).
			Scan(&title, &body, &status, &current); err != nil {
			return fmt.Errorf("decision %s not found", op.EntityID)
		}
		if v, ok := str("title"); ok {
			title = v
		}
		if v, ok := str("body"); ok {
			body = v
		}
		if v, ok := str("status"); ok {
			status = v
		}
		meta := decision.ParseMeta(current)
		if v, ok := str("superseded_by"); ok {
			meta.SupersededBy = v
		}
		if v, ok := str("review_trigger"); ok {
			meta.ReviewTrigger = v
		}
		if v, ok := str("status_reason"); ok {
			meta.StatusReason = v
		}
		extra = decision.MergeMeta(current, meta)
		if _, err := tx.Exec(`UPDATE knowledge_items SET title=?,body=?,status=?,extra_json=?,updated_at=? WHERE id=?`,
			title, body, status, extra, now, op.EntityID); err != nil {
			return err
		}
	default:
		return fmt.Errorf("decisions are never removed: supersede them")
	}
	if paths, ok := op.Fields["scope"].([]string); ok {
		if err := setContextPaths(tx, projectID, op.EntityID, paths); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(`DELETE FROM knowledge_fts WHERE knowledge_id=?`, op.EntityID); err != nil {
		return err
	}
	_, err := tx.Exec(`INSERT INTO knowledge_fts(knowledge_id, project_id, kind, title, body, summary, tags) VALUES(?,?,?,?,?,?,?)`,
		op.EntityID, projectID, "decision", title, body, "", "")
	return err
}
