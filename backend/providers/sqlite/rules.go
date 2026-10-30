package sqlite

import (
	"database/sql"
	"fmt"

	"github.com/polterware/polterware/backend/domains/work"
)

// loadRules returns the project's active Rules in position order, each with
// the paths of its context nodes.
func (s *Store) loadRules(projectID string) ([]work.Rule, error) {
	var rules []work.Rule
	err := s.eachRow(`SELECT id,COALESCE(slug,''),statement,status,position FROM rules
		WHERE project_id=? AND status='active' ORDER BY position, created_at, id`, projectID, func(rows *sql.Rows) error {
		var rule work.Rule
		if err := rows.Scan(&rule.ID, &rule.Slug, &rule.Statement, &rule.Status, &rule.Position); err != nil {
			return err
		}
		rules = append(rules, rule)
		return nil
	})
	if err != nil {
		return nil, err
	}
	contexts, err := s.contextPaths(projectID)
	if err != nil {
		return nil, err
	}
	for i := range rules {
		rules[i].Scopes = contexts[rules[i].ID]
	}
	return rules, nil
}

// ListRules returns the project's active Rules.
func (s *Store) ListRules(projectID string) ([]work.Rule, error) {
	return s.loadRules(projectID)
}

// applyRuleOp writes a Rule in the same transaction as change_ops.
func applyRuleOp(tx *sql.Tx, projectID string, op work.Op, now string) error {
	switch op.Kind {
	case work.OpCreate:
		statement, _ := op.Fields["statement"].(string)
		var slug any
		if value, ok := op.Fields["slug"].(string); ok && value != "" {
			slug = value
		}
		var position int
		if err := tx.QueryRow(`SELECT COALESCE(MAX(position),-1)+1 FROM rules WHERE project_id=?`, projectID).Scan(&position); err != nil {
			return err
		}
		if _, err := tx.Exec(`INSERT INTO rules(id,project_id,slug,statement,status,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`,
			op.EntityID, projectID, slug, statement, work.RuleActive, position, now, now); err != nil {
			return err
		}
	case work.OpUpdate, work.OpRemove:
		var found string
		if err := tx.QueryRow(`SELECT id FROM rules WHERE id=? AND project_id=?`, op.EntityID, projectID).Scan(&found); err != nil {
			return fmt.Errorf("rule %s not found: %w", op.EntityID, err)
		}
		if value, ok := op.Fields["statement"].(string); ok {
			if _, err := tx.Exec(`UPDATE rules SET statement=?, updated_at=? WHERE id=?`, value, now, op.EntityID); err != nil {
				return err
			}
		}
		status := ""
		if op.Kind == work.OpRemove {
			status = work.RuleRemoved
		} else if value, ok := op.Fields["status"].(string); ok {
			status = value
		}
		if status != "" {
			// A removed Rule gives its slug back, so a new Rule may take it.
			if _, err := tx.Exec(`UPDATE rules SET status=?, slug=CASE WHEN ?='removed' THEN NULL ELSE slug END, updated_at=? WHERE id=?`, status, status, now, op.EntityID); err != nil {
				return err
			}
		}
	default:
		return fmt.Errorf("unknown rule op %q", op.Kind)
	}
	if paths, ok := op.Fields["scope"].([]string); ok {
		if err := setContextPaths(tx, projectID, op.EntityID, paths); err != nil {
			return err
		}
	}
	return nil
}
