package sqlite

import (
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"github.com/polterware/polterware/backend/domains/work"
	"github.com/polterware/polterware/backend/platform/ids"
)

type boardQuery interface {
	Query(query string, args ...any) (*sql.Rows, error)
}

// ListWorkBoards returns the project's saved views in position order.
// An empty result is the implicit default board grouped by stage.
func (s *Store) ListWorkBoards(projectID string) ([]work.Board, error) {
	return queryBoards(s.DB, projectID)
}

// CreateWorkBoard appends one board and records a change_ops create.
func (s *Store) CreateWorkBoard(projectID, agentRunID, batchID string, board work.Board) (work.Board, error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return work.Board{}, err
	}
	defer func() { _ = tx.Rollback() }()

	existing, err := queryBoards(tx, projectID)
	if err != nil {
		return work.Board{}, err
	}
	board.ProjectID = projectID
	prepared, err := work.PrepareBoardCreate(board, existing)
	if err != nil {
		return work.Board{}, err
	}
	if prepared.ID == "" {
		prepared.ID = ids.NewULID()
	}
	now := time.Now().UTC().Format(time.RFC3339)
	_, err = tx.Exec(`INSERT INTO work_boards(id,project_id,name,position,config_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`,
		prepared.ID, projectID, prepared.Name, prepared.Position, prepared.ConfigJSON, now, now)
	if err != nil {
		if constraint := boardConstraintError(err); constraint != nil {
			return work.Board{}, constraint
		}
		return work.Board{}, err
	}
	if err := insertBoardOp(tx, projectID, agentRunID, batchID, prepared.ID, work.OpCreate, map[string]any{
		"name": prepared.Name, "position": prepared.Position, "config_json": prepared.ConfigJSON,
	}, now); err != nil {
		return work.Board{}, err
	}
	if err := tx.Commit(); err != nil {
		return work.Board{}, err
	}
	prepared.CreatedAt, _ = time.Parse(time.RFC3339, now)
	prepared.UpdatedAt = prepared.CreatedAt
	return prepared, nil
}

// UpdateWorkBoard renames a board and/or replaces its config. A no-op writes
// nothing. Position is left for ReorderWorkBoards.
func (s *Store) UpdateWorkBoard(projectID, agentRunID, batchID string, board work.Board) (work.Board, error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return work.Board{}, err
	}
	defer func() { _ = tx.Rollback() }()

	existing, err := queryBoards(tx, projectID)
	if err != nil {
		return work.Board{}, err
	}
	next, changed, err := work.PrepareBoardUpdate(board, existing)
	if err != nil {
		return work.Board{}, err
	}
	if !changed {
		return next, nil
	}
	now := time.Now().UTC().Format(time.RFC3339)
	fields := map[string]any{}
	for _, current := range existing {
		if current.ID != next.ID {
			continue
		}
		if next.Name != current.Name {
			fields["name"] = next.Name
		}
		if next.ConfigJSON != current.ConfigJSON {
			fields["config_json"] = next.ConfigJSON
		}
		break
	}
	result, err := tx.Exec(`UPDATE work_boards SET name=?, config_json=?, updated_at=? WHERE id=? AND project_id=?`,
		next.Name, next.ConfigJSON, now, next.ID, projectID)
	if err != nil {
		if constraint := boardConstraintError(err); constraint != nil {
			return work.Board{}, constraint
		}
		return work.Board{}, err
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return work.Board{}, work.ErrBoardNotFound
	}
	if err := insertBoardOp(tx, projectID, agentRunID, batchID, next.ID, work.OpUpdate, fields, now); err != nil {
		return work.Board{}, err
	}
	if err := tx.Commit(); err != nil {
		return work.Board{}, err
	}
	next.UpdatedAt, _ = time.Parse(time.RFC3339, now)
	return next, nil
}

// DeleteWorkBoard removes one board, closes the position gap, and records the
// remove plus any position updates in one batch.
func (s *Store) DeleteWorkBoard(projectID, agentRunID, batchID, id string) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	existing, err := queryBoards(tx, projectID)
	if err != nil {
		return err
	}
	var target work.Board
	rest := make([]work.Board, 0, len(existing))
	found := false
	for _, board := range existing {
		if board.ID == id {
			target = board
			found = true
			continue
		}
		rest = append(rest, board)
	}
	if !found {
		return work.ErrBoardNotFound
	}
	if _, err := tx.Exec(`DELETE FROM work_boards WHERE id=? AND project_id=?`, id, projectID); err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if err := insertBoardOp(tx, projectID, agentRunID, batchID, id, work.OpRemove, map[string]any{
		"name": target.Name, "position": target.Position, "config_json": target.ConfigJSON,
	}, now); err != nil {
		return err
	}
	if err := writeBoardPositions(tx, projectID, agentRunID, batchID, rest, now); err != nil {
		return err
	}
	return tx.Commit()
}

// ReorderWorkBoards sets positions from ids. ids must list each board once.
// An order that changes nothing writes no change_ops rows.
func (s *Store) ReorderWorkBoards(projectID, agentRunID, batchID string, orderedIDs []string) ([]work.Board, error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	existing, err := queryBoards(tx, projectID)
	if err != nil {
		return nil, err
	}
	next, err := work.ReorderBoards(existing, orderedIDs)
	if err != nil {
		return nil, err
	}
	if !work.PositionsChanged(existing, next) {
		return existing, nil
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if err := writeBoardPositions(tx, projectID, agentRunID, batchID, next, now); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return queryBoards(s.DB, projectID)
}

// writeBoardPositions assigns positions 0..n-1 in the slice's order and
// records a change_ops update for each board that moved. Delete passes the
// survivors in their previous order so the gap closes. Reorder passes the
// requested order.
func writeBoardPositions(tx *sql.Tx, projectID, agentRunID, batchID string, ordered []work.Board, now string) error {
	rows, err := queryBoards(tx, projectID)
	if err != nil {
		return err
	}
	current := make(map[string]int, len(rows))
	for _, board := range rows {
		current[board.ID] = board.Position
	}
	for i, board := range ordered {
		position, ok := current[board.ID]
		if !ok {
			return work.ErrBoardNotFound
		}
		if position == i {
			continue
		}
		if _, err := tx.Exec(`UPDATE work_boards SET position=?, updated_at=? WHERE id=? AND project_id=?`,
			i, now, board.ID, projectID); err != nil {
			return err
		}
		if err := insertBoardOp(tx, projectID, agentRunID, batchID, board.ID, work.OpUpdate, map[string]any{
			"position": i,
		}, now); err != nil {
			return err
		}
	}
	return nil
}

func queryBoards(q boardQuery, projectID string) ([]work.Board, error) {
	rows, err := q.Query(`SELECT id,project_id,name,position,config_json,created_at,updated_at
		FROM work_boards WHERE project_id=? ORDER BY position, id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []work.Board
	for rows.Next() {
		var board work.Board
		var created, updated string
		if err := rows.Scan(&board.ID, &board.ProjectID, &board.Name, &board.Position, &board.ConfigJSON, &created, &updated); err != nil {
			return nil, err
		}
		board.CreatedAt, _ = time.Parse(time.RFC3339, created)
		board.UpdatedAt, _ = time.Parse(time.RFC3339, updated)
		out = append(out, board)
	}
	return out, rows.Err()
}

func insertBoardOp(tx *sql.Tx, projectID, agentRunID, batchID, entityID, kind string, fields map[string]any, now string) error {
	data, err := json.Marshal(fields)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`INSERT INTO change_ops(id,project_id,agent_run_id,batch_id,entity,entity_id,op,data_json,node_id,created_at)
		VALUES(?,?,?,?,?,?,?,?,?,?)`,
		ids.NewULID(), projectID, agentRunID, batchID, work.EntityBoard, entityID, kind, string(data), "", now)
	return err
}

func boardConstraintError(err error) error {
	if err == nil {
		return nil
	}
	msg := err.Error()
	if strings.Contains(msg, "work_boards.project_id") || strings.Contains(msg, "work_boards.name") {
		return work.ErrBoardNameTaken
	}
	return nil
}
