package sqlite

import (
	"database/sql"
	"errors"
	"time"

	"github.com/polterware/polterware/backend/domains/agentrun"
)

func (s *Store) CreateAgentRun(run agentrun.Run) error {
	if run.ID == "" {
		run.ID = agentrun.NewRunID()
	}
	if run.CreatedAt.IsZero() {
		run.CreatedAt = time.Now().UTC()
	}
	if run.Status == "" {
		run.Status = agentrun.StatusOpen
	}
	if run.ActorKind == "" {
		run.ActorKind = agentrun.ActorKindAgent
	}
	var completed any
	if run.CompletedAt != nil {
		completed = run.CompletedAt.UTC().Format(time.RFC3339)
	}
	_, err := s.DB.Exec(
		`INSERT INTO agent_runs(id,project_id,task,agent_label,actor_kind,status,created_at,completed_at)
		 VALUES(?,?,?,?,?,?,?,?)`,
		run.ID, run.ProjectID, run.Task, run.AgentLabel, run.ActorKind, run.Status,
		run.CreatedAt.UTC().Format(time.RFC3339), completed,
	)
	return err
}

func (s *Store) GetAgentRun(id string) (agentrun.Run, error) {
	var run agentrun.Run
	var created string
	var completed sql.NullString
	err := s.DB.QueryRow(
		`SELECT id,project_id,task,agent_label,actor_kind,status,created_at,completed_at
		 FROM agent_runs WHERE id=?`, id,
	).Scan(&run.ID, &run.ProjectID, &run.Task, &run.AgentLabel, &run.ActorKind, &run.Status, &created, &completed)
	if errors.Is(err, sql.ErrNoRows) {
		return agentrun.Run{}, agentrun.ErrUnknownRun
	}
	if err != nil {
		return agentrun.Run{}, err
	}
	if run.ActorKind == "" {
		run.ActorKind = agentrun.ActorKindAgent
	}
	run.CreatedAt, _ = time.Parse(time.RFC3339, created)
	if completed.Valid && completed.String != "" {
		t, _ := time.Parse(time.RFC3339, completed.String)
		run.CompletedAt = &t
	}
	return run, nil
}

func (s *Store) UpdateAgentRun(run agentrun.Run) error {
	var completed any
	if run.CompletedAt != nil {
		completed = run.CompletedAt.UTC().Format(time.RFC3339)
	}
	res, err := s.DB.Exec(
		`UPDATE agent_runs SET task=?, agent_label=?, actor_kind=?, status=?, completed_at=? WHERE id=?`,
		run.Task, run.AgentLabel, run.ActorKind, run.Status, completed, run.ID,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return agentrun.ErrUnknownRun
	}
	return nil
}

func (s *Store) AppendAgentRunStep(step agentrun.Step) error {
	if step.ID == "" {
		step.ID = agentrun.NewStepID()
	}
	if step.CreatedAt.IsZero() {
		step.CreatedAt = time.Now().UTC()
	}
	if step.PayloadJSON == "" {
		step.PayloadJSON = "{}"
	}
	_, err := s.DB.Exec(
		`INSERT INTO agent_run_steps(id,agent_run_id,kind,summary,payload_json,created_at)
		 VALUES(?,?,?,?,?,?)`,
		step.ID, step.AgentRunID, step.Kind, step.Summary, step.PayloadJSON,
		step.CreatedAt.UTC().Format(time.RFC3339Nano),
	)
	return err
}

func (s *Store) ListAgentRunSteps(runID string) ([]agentrun.Step, error) {
	rows, err := s.DB.Query(
		`SELECT id,agent_run_id,kind,summary,payload_json,created_at
		 FROM agent_run_steps WHERE agent_run_id=? ORDER BY created_at ASC, rowid ASC`, runID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []agentrun.Step
	for rows.Next() {
		var step agentrun.Step
		var created string
		if err := rows.Scan(
			&step.ID, &step.AgentRunID, &step.Kind, &step.Summary, &step.PayloadJSON, &created,
		); err != nil {
			return nil, err
		}
		step.CreatedAt = parseAgentRunTime(created)
		out = append(out, step)
	}
	return out, rows.Err()
}

func parseAgentRunTime(value string) time.Time {
	if value == "" {
		return time.Time{}
	}
	if t, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return t
	}
	t, _ := time.Parse(time.RFC3339, value)
	return t
}

func (s *Store) GetAgentRunRecord(id string) (agentrun.Record, error) {
	run, err := s.GetAgentRun(id)
	if err != nil {
		return agentrun.Record{}, err
	}
	steps, err := s.ListAgentRunSteps(id)
	if err != nil {
		return agentrun.Record{}, err
	}
	if steps == nil {
		steps = []agentrun.Step{}
	}
	return agentrun.Record{Run: run, Steps: steps}, nil
}

func (s *Store) ListAgentRuns(projectID string, limit int) ([]agentrun.Run, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.DB.Query(
		`SELECT id,project_id,task,agent_label,actor_kind,status,created_at,completed_at
		 FROM agent_runs WHERE project_id=? ORDER BY created_at DESC LIMIT ?`,
		projectID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []agentrun.Run
	for rows.Next() {
		var run agentrun.Run
		var created string
		var completed sql.NullString
		if err := rows.Scan(
			&run.ID, &run.ProjectID, &run.Task, &run.AgentLabel, &run.ActorKind, &run.Status, &created, &completed,
		); err != nil {
			return nil, err
		}
		if run.ActorKind == "" {
			run.ActorKind = agentrun.ActorKindAgent
		}
		run.CreatedAt, _ = time.Parse(time.RFC3339, created)
		if completed.Valid && completed.String != "" {
			t, _ := time.Parse(time.RFC3339, completed.String)
			run.CompletedAt = &t
		}
		out = append(out, run)
	}
	return out, rows.Err()
}

// ChangeRow is one justified mutation for Unified Change History (B9).
type ChangeRow struct {
	StepID      string
	AgentRunID  string
	ProjectID   string
	ActorKind   string
	AgentLabel  string
	RunStatus   string
	RunTask     string
	Summary     string
	PayloadJSON string
	CreatedAt   time.Time
}

// ChangeLimit clamps a history page size. Non-positive and oversized limits
// fall back to 50, matching ListChanges.
func ChangeLimit(limit int) int {
	if limit <= 0 || limit > 200 {
		return 50
	}
	return limit
}

// ListChanges returns change steps for a project, newest first, with optional actor filter.
func (s *Store) ListChanges(projectID, actorKind string, limit int) ([]ChangeRow, error) {
	return s.queryChanges(projectID, actorKind, "", ChangeLimit(limit))
}

// ListAllChanges returns every change step for a project, newest first.
func (s *Store) ListAllChanges(projectID, actorKind string) ([]ChangeRow, error) {
	return s.queryChanges(projectID, actorKind, "", 0)
}

// ListSubjectChanges returns the change steps that name subjectID among their
// subjects, newest first: the history of one card, Decision, doc, fact, or node.
func (s *Store) ListSubjectChanges(projectID, actorKind, subjectID string, limit int) ([]ChangeRow, error) {
	return s.queryChanges(projectID, actorKind, subjectID, ChangeLimit(limit))
}

// historyHiddenTools are write tools whose change steps stay audited (change_ops
// keep the run) but are left out of the history: canvas edits are workspace
// layout, not project truth, and every autosave would add a row.
var historyHiddenTools = []string{"desktop.canvas.%"}

func (s *Store) queryChanges(projectID, actorKind, subjectID string, limit int) ([]ChangeRow, error) {
	query := `
		SELECT s.id, s.agent_run_id, r.project_id, r.actor_kind, r.agent_label, r.status, r.task,
		       s.summary, s.payload_json, s.created_at
		FROM agent_run_steps s
		INNER JOIN agent_runs r ON r.id = s.agent_run_id
		WHERE r.project_id = ? AND s.kind = 'change'`
	args := []any{projectID}
	for _, pattern := range historyHiddenTools {
		query += ` AND COALESCE(json_extract(s.payload_json, '$.tool'), '') NOT LIKE ?`
		args = append(args, pattern)
	}
	if actorKind != "" {
		query += ` AND r.actor_kind = ?`
		args = append(args, actorKind)
	}
	if subjectID != "" {
		query += ` AND EXISTS (SELECT 1 FROM json_each(s.payload_json, '$.subject_ids') WHERE value = ?)`
		args = append(args, subjectID)
	}
	query += ` ORDER BY s.created_at DESC, s.rowid DESC`
	if limit > 0 {
		query += ` LIMIT ?`
		args = append(args, limit)
	}

	rows, err := s.DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ChangeRow
	for rows.Next() {
		var row ChangeRow
		var created string
		if err := rows.Scan(
			&row.StepID, &row.AgentRunID, &row.ProjectID, &row.ActorKind, &row.AgentLabel,
			&row.RunStatus, &row.RunTask, &row.Summary, &row.PayloadJSON, &created,
		); err != nil {
			return nil, err
		}
		if row.ActorKind == "" {
			row.ActorKind = agentrun.ActorKindAgent
		}
		row.CreatedAt = parseAgentRunTime(created)
		out = append(out, row)
	}
	return out, rows.Err()
}

// AppendAgentRunStepIfOpen loads the run, ensures it is open, and appends the step.
func (s *Store) AppendAgentRunStepIfOpen(runID string, build func(run agentrun.Run) (agentrun.Step, error)) error {
	run, err := s.GetAgentRun(runID)
	if err != nil {
		return err
	}
	if err := agentrun.CanAppend(run); err != nil {
		return err
	}
	step, err := build(run)
	if err != nil {
		return err
	}
	return s.AppendAgentRunStep(step)
}
