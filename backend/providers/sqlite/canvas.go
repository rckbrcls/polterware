package sqlite

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/polterware/polterware/backend/domains/atlas"
	"github.com/polterware/polterware/backend/domains/canvas"
	"github.com/polterware/polterware/backend/platform/ids"
)

type rowQuery interface {
	QueryRow(query string, args ...any) *sql.Row
}

// RequireAtlasNode reports whether nodeID belongs to the project. An empty
// nodeID is the whole project and is allowed.
func (s *Store) RequireAtlasNode(projectID, nodeID string) error {
	return requireAtlasNode(s.DB, projectID, nodeID)
}

func requireAtlasNode(q rowQuery, projectID, nodeID string) error {
	if nodeID == "" {
		return nil
	}
	var id string
	err := q.QueryRow(`SELECT id FROM atlas_nodes WHERE id=? AND project_id=? AND status<>?`, nodeID, projectID, atlas.NodeRemoved).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return canvas.ErrUnknownScope
	}
	return err
}

const canvasColumns = `id,project_id,name,type,agent_visible,graph_json,layout_json,COALESCE(scope_node_id,''),created_at,updated_at,archived_at`

// ListCanvases returns the project's active canvases ordered by name.
func (s *Store) ListCanvases(projectID string) ([]canvas.Canvas, error) {
	return s.listCanvases(projectID, false)
}

// ListArchivedCanvases returns the project's archived canvases ordered by name.
func (s *Store) ListArchivedCanvases(projectID string) ([]canvas.Canvas, error) {
	return s.listCanvases(projectID, true)
}

func (s *Store) listCanvases(projectID string, archived bool) ([]canvas.Canvas, error) {
	filter := `archived_at=''`
	if archived {
		filter = `archived_at<>''`
	}
	rows, err := s.DB.Query(`SELECT `+canvasColumns+` FROM canvases WHERE project_id=? AND `+filter+` ORDER BY name, id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []canvas.Canvas
	for rows.Next() {
		item, err := scanCanvas(rows.Scan)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// GetCanvas returns one canvas in the project, archived or not.
func (s *Store) GetCanvas(projectID, id string) (canvas.Canvas, error) {
	row := s.DB.QueryRow(`SELECT `+canvasColumns+` FROM canvases WHERE project_id=? AND id=?`, projectID, id)
	return scanCanvas(row.Scan)
}

// CreateCanvas inserts a canvas and one change_ops row. The graph is validated.
func (s *Store) CreateCanvas(item canvas.Canvas, agentRunID, batchID string) (canvas.Canvas, error) {
	return s.writeCanvas(item, agentRunID, batchID, canvas.OpCreate, true)
}

// UpdateCanvas replaces the mutable columns and appends one change_ops row.
func (s *Store) UpdateCanvas(item canvas.Canvas, agentRunID, batchID string) (canvas.Canvas, error) {
	return s.writeCanvas(item, agentRunID, batchID, canvas.OpUpdate, false)
}

// SetCanvasArchived moves a canvas into the archive or back out of it and
// appends an update op that records the move.
func (s *Store) SetCanvasArchived(projectID, id string, archived bool, at time.Time, agentRunID, batchID string) (canvas.Canvas, error) {
	existing, err := s.GetCanvas(projectID, id)
	if err != nil {
		return canvas.Canvas{}, err
	}
	if batchID == "" {
		batchID = ids.NewULID()
	}
	stamp := ""
	if archived {
		stamp = at.UTC().Format(time.RFC3339)
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return canvas.Canvas{}, err
	}
	defer func() { _ = tx.Rollback() }()
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := tx.Exec(`UPDATE canvases SET archived_at=?, updated_at=? WHERE project_id=? AND id=?`, stamp, now, projectID, id); err != nil {
		return canvas.Canvas{}, err
	}
	if err := insertCanvasOpData(tx, existing, agentRunID, batchID, canvas.OpUpdate, now, map[string]any{"archived": archived}); err != nil {
		return canvas.Canvas{}, err
	}
	if err := tx.Commit(); err != nil {
		return canvas.Canvas{}, err
	}
	return s.GetCanvas(projectID, id)
}

// DeleteCanvas removes an archived canvas for good and appends a remove op.
// An active canvas is refused; missing rows return sql.ErrNoRows.
func (s *Store) DeleteCanvas(projectID, id, agentRunID, batchID string) error {
	existing, err := s.GetCanvas(projectID, id)
	if err != nil {
		return err
	}
	if !existing.Archived() {
		return canvas.ErrNotArchived
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	now := time.Now().UTC().Format(time.RFC3339)
	if err := insertCanvasOp(tx, existing, agentRunID, batchID, canvas.OpRemove, now); err != nil {
		return err
	}
	result, err := tx.Exec(`DELETE FROM canvases WHERE project_id=? AND id=?`, projectID, id)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return tx.Commit()
}

func (s *Store) writeCanvas(item canvas.Canvas, agentRunID, batchID, op string, insert bool) (canvas.Canvas, error) {
	prepared, err := canvas.Prepare(item)
	if err != nil {
		return canvas.Canvas{}, err
	}
	if prepared.ID == "" {
		prepared.ID = ids.NewULID()
	}
	if batchID == "" {
		batchID = ids.NewULID()
	}
	graphJSON, err := canvas.MarshalGraph(prepared.Graph)
	if err != nil {
		return canvas.Canvas{}, err
	}
	visible := 0
	if prepared.AgentVisible {
		visible = 1
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return canvas.Canvas{}, err
	}
	defer func() { _ = tx.Rollback() }()
	if err := requireAtlasNode(tx, prepared.ProjectID, prepared.ScopeNodeID); err != nil {
		return canvas.Canvas{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if insert {
		_, err = tx.Exec(`INSERT INTO canvases(id,project_id,name,type,agent_visible,graph_json,layout_json,scope_node_id,created_at,updated_at)
			VALUES(?,?,?,?,?,?,?,?,?,?)`,
			prepared.ID, prepared.ProjectID, prepared.Name, prepared.Type, visible, graphJSON, prepared.LayoutJSON,
			nullable(prepared.ScopeNodeID), now, now)
	} else {
		var existing string
		err = tx.QueryRow(`SELECT id FROM canvases WHERE project_id=? AND id=?`, prepared.ProjectID, prepared.ID).Scan(&existing)
		if err == nil {
			_, err = tx.Exec(`UPDATE canvases SET name=?, agent_visible=?, graph_json=?, layout_json=?, scope_node_id=?, updated_at=?
				WHERE project_id=? AND id=?`,
				prepared.Name, visible, graphJSON, prepared.LayoutJSON, nullable(prepared.ScopeNodeID), now, prepared.ProjectID, prepared.ID)
		}
	}
	if err != nil {
		return canvas.Canvas{}, err
	}
	if err := insertCanvasOp(tx, prepared, agentRunID, batchID, op, now); err != nil {
		return canvas.Canvas{}, err
	}
	if err := tx.Commit(); err != nil {
		return canvas.Canvas{}, err
	}
	return s.GetCanvas(prepared.ProjectID, prepared.ID)
}

func insertCanvasOp(tx *sql.Tx, item canvas.Canvas, agentRunID, batchID, op, now string) error {
	return insertCanvasOpData(tx, item, agentRunID, batchID, op, now, nil)
}

func insertCanvasOpData(tx *sql.Tx, item canvas.Canvas, agentRunID, batchID, op, now string, extra map[string]any) error {
	data := map[string]any{
		"name":          item.Name,
		"type":          item.Type,
		"agent_visible": item.AgentVisible,
	}
	for key, value := range extra {
		data[key] = value
	}
	payload, err := json.Marshal(data)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`INSERT INTO change_ops(id,project_id,agent_run_id,batch_id,entity,entity_id,op,data_json,node_id,created_at)
		VALUES(?,?,?,?,?,?,?,?,?,?)`,
		ids.NewULID(), item.ProjectID, agentRunID, batchID, canvas.Entity, item.ID, op, string(payload), item.ScopeNodeID, now)
	return err
}

func scanCanvas(scan func(dest ...any) error) (canvas.Canvas, error) {
	var item canvas.Canvas
	var visible int
	var graphRaw, created, updated, archived string
	if err := scan(&item.ID, &item.ProjectID, &item.Name, &item.Type, &visible, &graphRaw, &item.LayoutJSON, &item.ScopeNodeID, &created, &updated, &archived); err != nil {
		return canvas.Canvas{}, err
	}
	item.AgentVisible = visible != 0
	graph, err := canvas.UnmarshalGraph(graphRaw)
	if err != nil {
		return canvas.Canvas{}, err
	}
	item.Graph = graph
	item.CreatedAt, _ = time.Parse(time.RFC3339, created)
	item.UpdatedAt, _ = time.Parse(time.RFC3339, updated)
	if archived != "" {
		item.ArchivedAt, _ = time.Parse(time.RFC3339, archived)
	}
	return item, nil
}
