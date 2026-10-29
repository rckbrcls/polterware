package sqlite

import (
	"database/sql"
	"errors"
	"time"
)

// hookContextKeep is how long a session's sent briefs are remembered.
const hookContextKeep = 7 * 24 * time.Hour

// MarkHookContextSeen records that a session received a node's brief with
// hash. fresh is false when the session already has that same brief. Rows
// older than a week are dropped on the way.
func (s *Store) MarkHookContextSeen(sessionID, projectID, nodeID, hash string, at time.Time) (fresh bool, err error) {
	var current string
	err = s.DB.QueryRow(`SELECT brief_hash FROM hook_context_seen WHERE session_id=? AND project_id=? AND node_id=?`,
		sessionID, projectID, nodeID).Scan(&current)
	switch {
	case err == nil && current == hash:
		return false, nil
	case err != nil && !errors.Is(err, sql.ErrNoRows):
		return false, err
	}
	stamp := at.UTC().Format(time.RFC3339)
	if _, err := s.DB.Exec(`INSERT INTO hook_context_seen(session_id,project_id,node_id,brief_hash,seen_at) VALUES(?,?,?,?,?)
		ON CONFLICT(session_id,project_id,node_id) DO UPDATE SET brief_hash=excluded.brief_hash, seen_at=excluded.seen_at`,
		sessionID, projectID, nodeID, hash, stamp); err != nil {
		return false, err
	}
	if _, err := s.DB.Exec(`DELETE FROM hook_context_seen WHERE seen_at < ?`, at.Add(-hookContextKeep).UTC().Format(time.RFC3339)); err != nil {
		return false, err
	}
	return true, nil
}
