package sqlite

import (
	"time"

	"github.com/polterware/polterware/backend/domains/inbox"
	"github.com/polterware/polterware/backend/platform/ids"
)

// InsertInboxDisposition appends one disposition row. Rows are never updated.
func (s *Store) InsertInboxDisposition(projectID string, d inbox.Disposition) error {
	_, err := s.DB.Exec(`INSERT INTO inbox_dispositions(id,project_id,item_key,action,actor,note,created_at)
		VALUES(?,?,?,?,?,?,?)`,
		ids.NewULID(), projectID, d.Key, d.Action, d.Actor, d.Note, d.CreatedAt.UTC().Format(time.RFC3339Nano))
	return err
}

// ListInboxDispositions returns the latest disposition per item key.
func (s *Store) ListInboxDispositions(projectID string) ([]inbox.Disposition, error) {
	rows, err := s.DB.Query(`SELECT item_key,action,actor,note,created_at FROM inbox_dispositions
		WHERE project_id=? ORDER BY item_key, created_at, id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	latest := map[string]int{}
	var out []inbox.Disposition
	for rows.Next() {
		var d inbox.Disposition
		var created string
		if err := rows.Scan(&d.Key, &d.Action, &d.Actor, &d.Note, &created); err != nil {
			return nil, err
		}
		d.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
		if i, ok := latest[d.Key]; ok {
			out[i] = d
			continue
		}
		latest[d.Key] = len(out)
		out = append(out, d)
	}
	return out, rows.Err()
}

// ListUnbackedCanonFacts returns declared and observed facts with no linked
// evidence, in one query.
func (s *Store) ListUnbackedCanonFacts(projectID string) ([]inbox.Fact, error) {
	rows, err := s.DB.Query(`SELECT f.id,f.statement,f.truth_class,f.source,f.actor FROM canon_facts f
		WHERE f.project_id=? AND f.truth_class IN ('declared','observed')
		AND NOT EXISTS (SELECT 1 FROM canon_fact_evidence fe WHERE fe.fact_id=f.id)
		ORDER BY f.created_at, f.id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []inbox.Fact
	for rows.Next() {
		var f inbox.Fact
		if err := rows.Scan(&f.ID, &f.Statement, &f.TruthClass, &f.Source, &f.Actor); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}
