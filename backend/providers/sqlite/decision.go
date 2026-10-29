package sqlite

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/polterware/polterware/backend/domains/decision"
	"github.com/polterware/polterware/backend/domains/work"
)

// loadDecisions returns the project's Decisions with lifecycle state, oldest first.
func (s *Store) loadDecisions(projectID string) ([]decision.Decision, error) {
	var out []decision.Decision
	err := s.eachRow(`SELECT k.id,k.title,k.status,k.body,k.extra_json,COALESCE(n.path,'') FROM knowledge_items k
		LEFT JOIN structure_nodes n ON n.id=k.scope_node_id
		WHERE k.project_id=? AND k.kind='decision' ORDER BY k.created_at, k.id`,
		projectID, func(rows *sql.Rows) error {
			var d decision.Decision
			var extra string
			if err := rows.Scan(&d.ID, &d.Title, &d.Status, &d.Body, &extra, &d.Scope); err != nil {
				return err
			}
			d.Status = decision.Normalize(d.Status)
			d.Meta = decision.ParseMeta(extra)
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
		meta.Level, _ = str("level")
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
		if v, ok := str("level"); ok {
			meta.Level = v
		}
		extra = decision.MergeMeta(current, meta)
		if _, err := tx.Exec(`UPDATE knowledge_items SET title=?,body=?,status=?,extra_json=?,updated_at=? WHERE id=?`,
			title, body, status, extra, now, op.EntityID); err != nil {
			return err
		}
	default:
		return fmt.Errorf("decisions are never removed: supersede them")
	}
	if path, ok := str("scope"); ok {
		if err := setDecisionScope(tx, projectID, op.EntityID, path); err != nil {
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

// setDecisionScope points a Decision at the Structure node with the given path, or
// clears its scope when path is empty.
func setDecisionScope(tx *sql.Tx, projectID, id, path string) error {
	var node any
	if path = strings.TrimSpace(path); path != "" {
		var nodeID string
		if err := tx.QueryRow(`SELECT id FROM structure_nodes WHERE project_id=? AND path=? AND status<>'removed'`, projectID, path).Scan(&nodeID); err != nil {
			return fmt.Errorf("scope %q is not a Structure node path: list them with polterware structure", path)
		}
		node = nodeID
	}
	_, err := tx.Exec(`UPDATE knowledge_items SET scope_node_id=? WHERE id=?`, node, id)
	return err
}
