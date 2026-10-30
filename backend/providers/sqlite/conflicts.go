package sqlite

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/polterware/polterware/backend/domains/work"
)

// loadConflicts returns every Conflict of the project, newest first.
func (s *Store) loadConflicts(projectID string) ([]work.Conflict, error) {
	var conflicts []work.Conflict
	err := s.eachRow(`SELECT id,slug,request,rule_id,decision_id,card_slug,options_json,state,answer,created_at,decided_at
		FROM conflicts WHERE project_id=? ORDER BY created_at DESC, id DESC`, projectID, func(rows *sql.Rows) error {
		var conflict work.Conflict
		var options string
		if err := rows.Scan(&conflict.ID, &conflict.Slug, &conflict.Request, &conflict.RuleID, &conflict.Decision, &conflict.CardSlug,
			&options, &conflict.State, &conflict.Answer, &conflict.CreatedAt, &conflict.DecidedAt); err != nil {
			return err
		}
		_ = json.Unmarshal([]byte(options), &conflict.Options)
		conflicts = append(conflicts, conflict)
		return nil
	})
	return conflicts, err
}

// ListConflicts returns every Conflict of the project, newest first.
func (s *Store) ListConflicts(projectID string) ([]work.Conflict, error) {
	return s.loadConflicts(projectID)
}

// applyConflictOp writes a Conflict in the same transaction as change_ops.
func applyConflictOp(tx *sql.Tx, projectID string, op work.Op, now string) error {
	text := func(key string) (string, bool) {
		value, ok := op.Fields[key].(string)
		return value, ok
	}
	switch op.Kind {
	case work.OpCreate:
		slug, _ := text("slug")
		request, _ := text("request")
		rule, _ := text("rule_id")
		decisionID, _ := text("decision_id")
		card, _ := text("card")
		options, err := columnValue(op.Fields["options"])
		if err != nil {
			return err
		}
		if options == nil {
			options = "[]"
		}
		_, err = tx.Exec(`INSERT INTO conflicts(id,project_id,slug,request,rule_id,decision_id,card_slug,options_json,state,created_at,updated_at)
			VALUES(?,?,?,?,?,?,?,?,?,?,?)`, op.EntityID, projectID, slug, request, rule, decisionID, card, options, work.ConflictOpen, now, now)
		return err
	case work.OpUpdate, work.OpRemove:
		columns := map[string]string{"request": "request", "rule_id": "rule_id", "decision_id": "decision_id", "card": "card_slug", "options": "options_json", "state": "state", "answer": "answer"}
		for field, value := range op.Fields {
			column, ok := columns[field]
			if !ok {
				return fmt.Errorf("unknown conflict field %q", field)
			}
			v, err := columnValue(value)
			if err != nil {
				return err
			}
			if _, err := tx.Exec(`UPDATE conflicts SET `+column+`=?, updated_at=? WHERE id=? AND project_id=?`, v, now, op.EntityID, projectID); err != nil {
				return err
			}
		}
		if state, ok := text("state"); ok {
			decided := ""
			if state != work.ConflictOpen {
				decided = now
			}
			if _, err := tx.Exec(`UPDATE conflicts SET decided_at=? WHERE id=?`, decided, op.EntityID); err != nil {
				return err
			}
		}
		return nil
	default:
		return fmt.Errorf("unknown conflict op %q", op.Kind)
	}
}
