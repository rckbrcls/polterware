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
	// Load handles and links together rather than querying once per Fact.
	err = s.eachRow(`SELECT f.id,COALESCE(f.slug,''),COALESCE(fe.evidence_id,'')
		FROM canon_facts f LEFT JOIN canon_fact_evidence fe ON fe.fact_id=f.id WHERE f.project_id=?`, projectID, func(rows *sql.Rows) error {
		var id, slug, evidence string
		if err := rows.Scan(&id, &slug, &evidence); err != nil {
			return err
		}
		i, ok := index[id]
		if !ok {
			return nil
		} // A concurrent insert belongs to the next snapshot.
		item := &result[i]
		item.Slug = slug
		if evidence != "" {
			item.Evidence = append(item.Evidence, evidence)
		}
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
	// Typed references (file:, commit:, url:) record their evidence before the links.
	if records, ok := op.Fields["evidence_new"].([]map[string]string); ok {
		for _, record := range records {
			evidence := canon.Evidence{
				ID: record["id"], ProjectID: projectID, Kind: record["kind"], Summary: record["summary"], Path: record["path"],
				Source: "polter", Actor: fact.Actor, ObservedAt: timestamp, CreatedAt: timestamp, UpdatedAt: timestamp,
			}
			if err := canon.ValidateEvidence(evidence); err != nil {
				return err
			}
			if err := upsertCanonEvidence(tx, evidence); err != nil {
				return err
			}
		}
	}
	if evidence, ok := op.Fields["evidence"].([]string); ok {
		if _, err := tx.Exec(`DELETE FROM canon_fact_evidence WHERE fact_id=?`, op.EntityID); err != nil {
			return err
		}
		for _, id := range evidence {
			var found string
			if err := tx.QueryRow(`SELECT id FROM canon_evidence WHERE project_id=? AND id=?`, projectID, id).Scan(&found); err != nil {
				return fmt.Errorf("unknown evidence %q", id)
			}
			if _, err := tx.Exec(`INSERT INTO canon_fact_evidence(fact_id,evidence_id,created_at) VALUES(?,?,?)`, op.EntityID, id, now); err != nil {
				return err
			}
		}
	}
	return nil
}
