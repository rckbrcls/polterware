package sqlite

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/polterware/polterware/backend/domains/canon"
	"github.com/polterware/polterware/backend/domains/work"
)

func (s *Store) loadPolterFacts(projectID string) ([]work.Fact, error) {
	facts, err := s.ListCanonFacts(projectID, "")
	if err != nil {
		return nil, err
	}
	result := make([]work.Fact, 0, len(facts))
	index := map[string]int{}
	for _, fact := range facts {
		index[fact.ID] = len(result)
		result = append(result, work.Fact{Fact: fact})
	}
	contexts, err := s.contextPaths(projectID)
	if err != nil {
		return nil, err
	}
	for i := range result {
		result[i].Scopes = contexts[result[i].ID]
	}
	err = s.eachRow(`SELECT id,COALESCE(slug,'') FROM canon_facts WHERE project_id=?`, projectID, func(rows *sql.Rows) error {
		var id, slug string
		if err := rows.Scan(&id, &slug); err != nil {
			return err
		}
		if i, ok := index[id]; ok {
			result[i].Slug = slug
		} // A concurrent insert belongs to the next snapshot.
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// applyFactOp writes the canon store in the same transaction as change_ops.
func applyFactOp(tx *sql.Tx, projectID string, op work.Op, now string) error {
	timestamp, _ := time.Parse(time.RFC3339, now)
	fact := canon.Fact{ID: op.EntityID, ProjectID: projectID, TruthClass: canon.TruthDeclared, Source: "polter", Actor: "agent", ObservedAt: timestamp, CreatedAt: timestamp}
	if op.Kind == work.OpUpdate {
		var err error
		fact, err = scanCanonFact(tx.QueryRow(`SELECT id,project_id,statement,truth_class,source,actor,observed_at,entity_id,created_at,updated_at FROM canon_facts WHERE id=? AND project_id=?`, op.EntityID, projectID))
		if err != nil {
			return fmt.Errorf("fact %s not found: %w", op.EntityID, err)
		}
	} else if op.Kind != work.OpCreate {
		return fmt.Errorf("facts cannot be removed through Polter")
	}
	if value, ok := op.Fields["statement"].(string); ok {
		fact.Statement = value
	}
	if value, ok := op.Fields["kind"].(string); ok {
		fact.TruthClass = value
	}
	if value, ok := op.Fields["actor"].(string); ok {
		fact.Actor = value
	}
	fact.UpdatedAt = timestamp
	if err := canon.ValidateFact(fact); err != nil {
		return err
	}
	if err := upsertCanonFact(tx, fact); err != nil {
		return err
	}
	if slug, ok := op.Fields["slug"].(string); ok {
		if _, err := tx.Exec(`UPDATE canon_facts SET slug=? WHERE id=? AND project_id=?`, slug, op.EntityID, projectID); err != nil {
			return err
		}
	}
	if paths, ok := op.Fields["scope"].([]string); ok {
		if err := setContextPaths(tx, projectID, op.EntityID, paths); err != nil {
			return err
		}
	}
	return nil
}
