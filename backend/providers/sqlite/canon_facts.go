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

func (s *Store) UpsertCanonEvidence(evidence canon.Evidence) error {
	return upsertCanonEvidence(s.DB, evidence)
}

func upsertCanonEvidence(db interface {
	Exec(string, ...any) (sql.Result, error)
}, evidence canon.Evidence) error {
	_, err := db.Exec(`INSERT INTO canon_evidence(
		id,project_id,kind,summary,source,path,actor,observed_at,created_at,updated_at
	) VALUES(?,?,?,?,?,?,?,?,?,?)
	ON CONFLICT(id) DO UPDATE SET
		kind=excluded.kind,
		summary=excluded.summary,
		source=excluded.source,
		path=excluded.path,
		actor=excluded.actor,
		observed_at=excluded.observed_at,
		updated_at=excluded.updated_at`,
		evidence.ID, evidence.ProjectID, evidence.Kind, evidence.Summary, evidence.Source, evidence.Path,
		evidence.Actor, evidence.ObservedAt.Format(time.RFC3339),
		evidence.CreatedAt.Format(time.RFC3339), evidence.UpdatedAt.Format(time.RFC3339),
	)
	return err
}

func (s *Store) ListCanonEvidence(projectID string) ([]canon.Evidence, error) {
	rows, err := s.DB.Query(`SELECT id,project_id,kind,summary,source,path,actor,observed_at,created_at,updated_at
		FROM canon_evidence WHERE project_id=? ORDER BY observed_at DESC, created_at DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []canon.Evidence
	for rows.Next() {
		item, err := scanCanonEvidence(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (s *Store) GetCanonEvidence(id string) (canon.Evidence, error) {
	row := s.DB.QueryRow(`SELECT id,project_id,kind,summary,source,path,actor,observed_at,created_at,updated_at
		FROM canon_evidence WHERE id=?`, id)
	return scanCanonEvidence(row)
}

func (s *Store) LinkCanonEvidenceToFact(projectID, factID, evidenceID string) error {
	fact, err := s.GetCanonFact(factID)
	if err != nil {
		return err
	}
	if fact.ProjectID != projectID {
		return canon.ErrUnknownFact
	}
	evidence, err := s.GetCanonEvidence(evidenceID)
	if err != nil {
		return err
	}
	if evidence.ProjectID != projectID {
		return canon.ErrUnknownEvidence
	}
	now := time.Now().UTC().Format(time.RFC3339)
	_, err = s.DB.Exec(`INSERT INTO canon_fact_evidence(fact_id, evidence_id, created_at) VALUES(?,?,?)
		ON CONFLICT(fact_id, evidence_id) DO NOTHING`, factID, evidenceID, now)
	return err
}

func (s *Store) ListCanonEvidenceForFact(factID string) ([]canon.Evidence, error) {
	rows, err := s.DB.Query(`SELECT e.id,e.project_id,e.kind,e.summary,e.source,e.path,e.actor,e.observed_at,e.created_at,e.updated_at
		FROM canon_evidence e
		INNER JOIN canon_fact_evidence fe ON fe.evidence_id = e.id
		WHERE fe.fact_id=?
		ORDER BY e.observed_at DESC, e.created_at DESC`, factID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []canon.Evidence
	for rows.Next() {
		item, err := scanCanonEvidence(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
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

func scanCanonEvidence(scanner interface {
	Scan(dest ...any) error
}) (canon.Evidence, error) {
	var item canon.Evidence
	var observed, created, updated string
	if err := scanner.Scan(
		&item.ID, &item.ProjectID, &item.Kind, &item.Summary, &item.Source, &item.Path, &item.Actor,
		&observed, &created, &updated,
	); err != nil {
		return canon.Evidence{}, err
	}
	item.ObservedAt, _ = time.Parse(time.RFC3339, observed)
	item.CreatedAt, _ = time.Parse(time.RFC3339, created)
	item.UpdatedAt, _ = time.Parse(time.RFC3339, updated)
	return item, nil
}
