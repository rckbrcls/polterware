package sqlite

import (
	"database/sql"
	"time"

	"github.com/polterware/polterware/backend/domains/canon"
)

func (s *Store) UpsertCanonFact(fact canon.Fact) error {
	return upsertCanonFact(s.DB, fact)
}

// upsertCanonFact also accepts the Work transaction so facts and audit ops commit together.
func upsertCanonFact(db interface {
	Exec(string, ...any) (sql.Result, error)
}, fact canon.Fact) error {
	var entityID any
	if fact.EntityID != "" {
		entityID = fact.EntityID
	}
	_, err := db.Exec(`INSERT INTO canon_facts(
		id,project_id,statement,truth_class,source,actor,observed_at,entity_id,created_at,updated_at
	) VALUES(?,?,?,?,?,?,?,?,?,?)
	ON CONFLICT(id) DO UPDATE SET
		statement=excluded.statement,
		truth_class=excluded.truth_class,
		source=excluded.source,
		actor=excluded.actor,
		observed_at=excluded.observed_at,
		entity_id=excluded.entity_id,
		updated_at=excluded.updated_at`,
		fact.ID, fact.ProjectID, fact.Statement, fact.TruthClass, fact.Source, fact.Actor,
		fact.ObservedAt.Format(time.RFC3339), entityID,
		fact.CreatedAt.Format(time.RFC3339), fact.UpdatedAt.Format(time.RFC3339),
	)
	return err
}

func (s *Store) ListCanonFacts(projectID, entityID string) ([]canon.Fact, error) {
	query := `SELECT id,project_id,statement,truth_class,source,actor,observed_at,entity_id,created_at,updated_at
		FROM canon_facts WHERE project_id=?`
	args := []any{projectID}
	if entityID != "" {
		query += ` AND entity_id=?`
		args = append(args, entityID)
	}
	query += ` ORDER BY observed_at DESC, created_at DESC`
	rows, err := s.DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []canon.Fact
	for rows.Next() {
		fact, err := scanCanonFact(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, fact)
	}
	return result, rows.Err()
}

func (s *Store) GetCanonFact(id string) (canon.Fact, error) {
	row := s.DB.QueryRow(`SELECT id,project_id,statement,truth_class,source,actor,observed_at,entity_id,created_at,updated_at
		FROM canon_facts WHERE id=?`, id)
	return scanCanonFact(row)
}

func scanCanonFact(scanner interface {
	Scan(dest ...any) error
}) (canon.Fact, error) {
	var fact canon.Fact
	var observed, created, updated string
	var entityID sql.NullString
	if err := scanner.Scan(
		&fact.ID, &fact.ProjectID, &fact.Statement, &fact.TruthClass, &fact.Source, &fact.Actor,
		&observed, &entityID, &created, &updated,
	); err != nil {
		return canon.Fact{}, err
	}
	if entityID.Valid {
		fact.EntityID = entityID.String
	}
	fact.ObservedAt, _ = time.Parse(time.RFC3339, observed)
	fact.CreatedAt, _ = time.Parse(time.RFC3339, created)
	fact.UpdatedAt, _ = time.Parse(time.RFC3339, updated)
	return fact, nil
}
