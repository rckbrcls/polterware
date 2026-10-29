package sqlite

import (
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"github.com/polterware/polterware/backend/domains/work"
	"github.com/polterware/polterware/backend/platform/ids"
)

// milestoneQuery is a DB or a transaction.
type milestoneQuery interface {
	Query(query string, args ...any) (*sql.Rows, error)
}

// ListMilestones returns every milestone of the project in position order,
// archived ones included (their ArchivedAt is set).
func (s *Store) ListMilestones(projectID string) ([]work.Milestone, error) {
	return queryMilestones(s.DB, projectID)
}

// CreateMilestone appends one milestone and records a change_ops create.
func (s *Store) CreateMilestone(projectID, agentRunID, batchID string, item work.Milestone) (work.Milestone, error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return work.Milestone{}, err
	}
	defer func() { _ = tx.Rollback() }()
	existing, err := queryMilestones(tx, projectID)
	if err != nil {
		return work.Milestone{}, err
	}
	item.ProjectID = projectID
	prepared, err := work.PrepareMilestoneCreate(item, existing)
	if err != nil {
		return work.Milestone{}, err
	}
	if prepared.ID == "" {
		prepared.ID = ids.NewULID()
	}
	criteria, err := json.Marshal(nonNilStrings(prepared.ExitCriteria))
	if err != nil {
		return work.Milestone{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := tx.Exec(`INSERT INTO milestones(id,project_id,slug,name,goal,exit_criteria_json,target_date,state,position,created_at,updated_at)
		VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
		prepared.ID, projectID, prepared.Slug, prepared.Name, prepared.Goal, string(criteria), prepared.TargetDate,
		prepared.State, prepared.Position, now, now); err != nil {
		if constraint := milestoneConstraintError(err); constraint != nil {
			return work.Milestone{}, constraint
		}
		return work.Milestone{}, err
	}
	if err := insertMilestoneOp(tx, projectID, agentRunID, batchID, prepared.ID, work.OpCreate, map[string]any{
		"slug": prepared.Slug, "name": prepared.Name, "goal": prepared.Goal, "exit_criteria": nonNilStrings(prepared.ExitCriteria),
		"target_date": prepared.TargetDate, "state": prepared.State, "position": prepared.Position,
	}, now); err != nil {
		return work.Milestone{}, err
	}
	if err := tx.Commit(); err != nil {
		return work.Milestone{}, err
	}
	prepared.CreatedAt, _ = time.Parse(time.RFC3339, now)
	prepared.UpdatedAt = prepared.CreatedAt
	return prepared, nil
}

// UpdateMilestone replaces a milestone's name, goal, exit criteria, target
// date, and state. The slug stays. A no-op writes nothing.
func (s *Store) UpdateMilestone(projectID, agentRunID, batchID string, item work.Milestone) (work.Milestone, error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return work.Milestone{}, err
	}
	defer func() { _ = tx.Rollback() }()
	existing, err := queryMilestones(tx, projectID)
	if err != nil {
		return work.Milestone{}, err
	}
	next, changed, err := work.PrepareMilestoneUpdate(item, existing)
	if err != nil || !changed {
		return next, err
	}
	var current work.Milestone
	for _, other := range existing {
		if other.ID == next.ID {
			current = other
		}
	}
	fields := map[string]any{}
	if next.Name != current.Name {
		fields["name"] = next.Name
	}
	if next.Goal != current.Goal {
		fields["goal"] = next.Goal
	}
	if strings.Join(next.ExitCriteria, "\n") != strings.Join(current.ExitCriteria, "\n") {
		fields["exit_criteria"] = nonNilStrings(next.ExitCriteria)
	}
	if next.TargetDate != current.TargetDate {
		fields["target_date"] = next.TargetDate
	}
	if next.State != current.State {
		fields["state"] = next.State
	}
	criteria, err := json.Marshal(nonNilStrings(next.ExitCriteria))
	if err != nil {
		return work.Milestone{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := tx.Exec(`UPDATE milestones SET name=?, goal=?, exit_criteria_json=?, target_date=?, state=?, updated_at=? WHERE id=? AND project_id=?`,
		next.Name, next.Goal, string(criteria), next.TargetDate, next.State, now, next.ID, projectID); err != nil {
		if constraint := milestoneConstraintError(err); constraint != nil {
			return work.Milestone{}, constraint
		}
		return work.Milestone{}, err
	}
	if err := insertMilestoneOp(tx, projectID, agentRunID, batchID, next.ID, work.OpUpdate, fields, now); err != nil {
		return work.Milestone{}, err
	}
	if err := tx.Commit(); err != nil {
		return work.Milestone{}, err
	}
	next.UpdatedAt, _ = time.Parse(time.RFC3339, now)
	return next, nil
}

// SetMilestoneArchived archives or restores a milestone. Its cards keep their
// milestone, so a restore brings them back with it.
func (s *Store) SetMilestoneArchived(projectID, agentRunID, batchID, id string, archived bool) (work.Milestone, error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return work.Milestone{}, err
	}
	defer func() { _ = tx.Rollback() }()
	existing, err := queryMilestones(tx, projectID)
	if err != nil {
		return work.Milestone{}, err
	}
	var target *work.Milestone
	for i := range existing {
		if existing[i].ID == id {
			target = &existing[i]
		}
	}
	if target == nil {
		return work.Milestone{}, work.ErrMilestoneNotFound
	}
	if (target.ArchivedAt != "") == archived {
		return *target, nil
	}
	now := time.Now().UTC().Format(time.RFC3339)
	stamp := ""
	if archived {
		stamp = now
	}
	if _, err := tx.Exec(`UPDATE milestones SET archived_at=?, updated_at=? WHERE id=? AND project_id=?`, stamp, now, id, projectID); err != nil {
		return work.Milestone{}, err
	}
	if err := insertMilestoneOp(tx, projectID, agentRunID, batchID, id, work.OpUpdate, map[string]any{"archived_at": stamp}, now); err != nil {
		return work.Milestone{}, err
	}
	if archived {
		if err := moveMilestoneCardsToBacklog(tx, projectID, agentRunID, batchID, id, now); err != nil {
			return work.Milestone{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return work.Milestone{}, err
	}
	target.ArchivedAt = stamp
	return *target, nil
}

// ReorderMilestones sets positions from ids, which must list each listed
// (unarchived) milestone once. An order that changes nothing writes no rows.
func (s *Store) ReorderMilestones(projectID, agentRunID, batchID string, orderedIDs []string) ([]work.Milestone, error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	all, err := queryMilestones(tx, projectID)
	if err != nil {
		return nil, err
	}
	var listed []work.Milestone
	for _, item := range all {
		if item.ArchivedAt == "" {
			listed = append(listed, item)
		}
	}
	next, err := work.ReorderMilestones(listed, orderedIDs)
	if err != nil {
		return nil, err
	}
	if !work.MilestonePositionsChanged(listed, next) {
		return all, nil
	}
	now := time.Now().UTC().Format(time.RFC3339)
	current := map[string]int{}
	for _, item := range listed {
		current[item.ID] = item.Position
	}
	for _, item := range next {
		if current[item.ID] == item.Position {
			continue
		}
		if _, err := tx.Exec(`UPDATE milestones SET position=?, updated_at=? WHERE id=? AND project_id=?`, item.Position, now, item.ID, projectID); err != nil {
			return nil, err
		}
		if err := insertMilestoneOp(tx, projectID, agentRunID, batchID, item.ID, work.OpUpdate, map[string]any{"position": item.Position}, now); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return queryMilestones(s.DB, projectID)
}

func queryMilestones(q milestoneQuery, projectID string) ([]work.Milestone, error) {
	rows, err := q.Query(`SELECT id,project_id,slug,name,goal,exit_criteria_json,target_date,state,position,archived_at,created_at,updated_at
		FROM milestones WHERE project_id=? ORDER BY position, id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []work.Milestone
	for rows.Next() {
		var item work.Milestone
		var criteria, created, updated string
		if err := rows.Scan(&item.ID, &item.ProjectID, &item.Slug, &item.Name, &item.Goal, &criteria, &item.TargetDate,
			&item.State, &item.Position, &item.ArchivedAt, &created, &updated); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(criteria), &item.ExitCriteria)
		item.CreatedAt, _ = time.Parse(time.RFC3339, created)
		item.UpdatedAt, _ = time.Parse(time.RFC3339, updated)
		out = append(out, item)
	}
	return out, rows.Err()
}

// moveMilestoneCardsToBacklog clears an archived milestone from its cards, one
// audited card op each, so no card is left in a milestone nobody can open.
func moveMilestoneCardsToBacklog(tx *sql.Tx, projectID, agentRunID, batchID, milestoneID, now string) error {
	rows, err := tx.Query(`SELECT id FROM work_cards WHERE project_id=? AND milestone_id=? ORDER BY rowid`, projectID, milestoneID)
	if err != nil {
		return err
	}
	var cardIDs []string
	for rows.Next() {
		var cardID string
		if err := rows.Scan(&cardID); err != nil {
			_ = rows.Close()
			return err
		}
		cardIDs = append(cardIDs, cardID)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	for _, cardID := range cardIDs {
		if _, err := tx.Exec(`UPDATE work_cards SET milestone_id=NULL, updated_at=? WHERE id=?`, now, cardID); err != nil {
			return err
		}
		if _, err := tx.Exec(`INSERT INTO change_ops(id,project_id,agent_run_id,batch_id,entity,entity_id,op,data_json,node_id,created_at)
			VALUES(?,?,?,?,?,?,?,?,?,?)`,
			ids.NewULID(), projectID, agentRunID, batchID, work.EntityCard, cardID, work.OpUpdate, `{"milestone":""}`, "", now); err != nil {
			return err
		}
	}
	return nil
}

func insertMilestoneOp(tx *sql.Tx, projectID, agentRunID, batchID, entityID, kind string, fields map[string]any, now string) error {
	data, err := json.Marshal(fields)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`INSERT INTO change_ops(id,project_id,agent_run_id,batch_id,entity,entity_id,op,data_json,node_id,created_at)
		VALUES(?,?,?,?,?,?,?,?,?,?)`,
		ids.NewULID(), projectID, agentRunID, batchID, work.EntityMilestone, entityID, kind, string(data), "", now)
	return err
}

func milestoneConstraintError(err error) error {
	if err != nil && strings.Contains(err.Error(), "milestones.name") {
		return work.ErrMilestoneNameTaken
	}
	return nil
}

func nonNilStrings(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}
