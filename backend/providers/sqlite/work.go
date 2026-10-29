package sqlite

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
	"github.com/polterware/polterware/backend/platform/ids"
)

// LoadWorkSnapshot returns every card of a project with its tasks, questions,
// and invariants, ordered by position.
func (s *Store) LoadWorkSnapshot(projectID string) (work.Snapshot, error) {
	snapshot := work.Snapshot{ProjectID: projectID}
	envs, err := s.ListEnvironments(projectID)
	if err != nil {
		return snapshot, err
	}
	for _, env := range envs {
		snapshot.Environments = append(snapshot.Environments, work.NamedEnvironment{ID: env.ID, Name: env.Name})
	}
	rows, err := s.DB.Query(`SELECT id,slug,title,intent,stage,status,owner,kind,under,decisions_json,position,created_at,updated_at
		FROM work_cards WHERE project_id=? ORDER BY position, created_at`, projectID)
	if err != nil {
		return snapshot, err
	}
	index := map[string]int{}
	for rows.Next() {
		card := work.Card{ProjectID: projectID}
		var decisions, created, updated string
		if err := rows.Scan(&card.ID, &card.Slug, &card.Title, &card.Intent, &card.Stage, &card.Status,
			&card.Owner, &card.Kind, &card.Under, &decisions, &card.Position, &created, &updated); err != nil {
			_ = rows.Close()
			return snapshot, err
		}
		_ = json.Unmarshal([]byte(decisions), &card.Decisions)
		card.CreatedAt, _ = time.Parse(time.RFC3339, created)
		card.UpdatedAt, _ = time.Parse(time.RFC3339, updated)
		index[card.ID] = len(snapshot.Cards)
		snapshot.Cards = append(snapshot.Cards, card)
	}
	if err := rows.Close(); err != nil {
		return snapshot, err
	}
	if snapshot.Repos, err = s.loadRepoNames(projectID); err != nil {
		return snapshot, err
	}
	if snapshot.Decisions, err = s.loadDecisions(projectID); err != nil {
		return snapshot, err
	}
	if snapshot.Facts, err = s.loadPolterFacts(projectID); err != nil {
		return snapshot, err
	}
	if snapshot.Evidence, err = s.ListCanonEvidence(projectID); err != nil {
		return snapshot, err
	}
	if len(snapshot.Cards) == 0 {
		snapshot.Nodes, err = s.loadStructureNodes(projectID)
		return snapshot, err
	}

	const scope = `card_id IN (SELECT id FROM work_cards WHERE project_id=?)`
	if err := s.eachRow(`SELECT id,card_id,number,title,state,repo,scope,position FROM work_tasks WHERE `+scope+` ORDER BY position, number`,
		projectID, func(rows *sql.Rows) error {
			var t work.Task
			if err := rows.Scan(&t.ID, &t.CardID, &t.Number, &t.Title, &t.State, &t.Repo, &t.Scope, &t.Position); err != nil {
				return err
			}
			if i, ok := index[t.CardID]; ok {
				snapshot.Cards[i].Tasks = append(snapshot.Cards[i].Tasks, t)
			}
			return nil
		}); err != nil {
		return snapshot, err
	}
	if err := s.eachRow(`SELECT id,card_id,text,blocking,options_json,state,answer,position FROM work_questions WHERE `+scope+` ORDER BY position`,
		projectID, func(rows *sql.Rows) error {
			var q work.Question
			var blocking int
			var options string
			if err := rows.Scan(&q.ID, &q.CardID, &q.Text, &blocking, &options, &q.State, &q.Answer, &q.Position); err != nil {
				return err
			}
			q.Blocking = blocking != 0
			_ = json.Unmarshal([]byte(options), &q.Options)
			if i, ok := index[q.CardID]; ok {
				snapshot.Cards[i].Questions = append(snapshot.Cards[i].Questions, q)
			}
			return nil
		}); err != nil {
		return snapshot, err
	}
	if err := s.eachRow(`SELECT id,card_id,text,state,position FROM work_invariants WHERE `+scope+` ORDER BY position`,
		projectID, func(rows *sql.Rows) error {
			var inv work.Invariant
			if err := rows.Scan(&inv.ID, &inv.CardID, &inv.Text, &inv.State, &inv.Position); err != nil {
				return err
			}
			if i, ok := index[inv.CardID]; ok {
				snapshot.Cards[i].Invariants = append(snapshot.Cards[i].Invariants, inv)
			}
			return nil
		}); err != nil {
		return snapshot, err
	}
	if err := s.loadWorkClaims(projectID, snapshot.Cards); err != nil {
		return snapshot, err
	}
	err = s.eachRow(`SELECT id,project_id,card_id,branch,goal,done,in_progress,next,touched_json,agent,created_at
		FROM work_handoffs WHERE `+scope+` ORDER BY created_at, id`,
		projectID, func(rows *sql.Rows) error {
			var handoff work.Handoff
			var touched, created string
			if err := rows.Scan(&handoff.ID, &handoff.ProjectID, &handoff.CardID, &handoff.Branch, &handoff.Goal,
				&handoff.Done, &handoff.InProgress, &handoff.Next, &touched, &handoff.Agent, &created); err != nil {
				return err
			}
			_ = json.Unmarshal([]byte(touched), &handoff.Touched)
			handoff.CreatedAt, _ = time.Parse(time.RFC3339, created)
			if i, ok := index[handoff.CardID]; ok {
				snapshot.Cards[i].Handoffs = append(snapshot.Cards[i].Handoffs, handoff)
			}
			return nil
		})
	if err != nil {
		return snapshot, err
	}
	snapshot.Nodes, err = s.loadStructureNodes(projectID)
	return snapshot, err
}

// loadRepoNames lists the project's registered checkout names.
func (s *Store) loadRepoNames(projectID string) ([]string, error) {
	var names []string
	err := s.eachRow(`SELECT name FROM project_repos WHERE project_id=? ORDER BY name`, projectID, func(rows *sql.Rows) error {
		var name string
		if err := rows.Scan(&name); err != nil {
			return err
		}
		names = append(names, name)
		return nil
	})
	return names, err
}

// loadWorkClaims attaches each active claim to its task.
func (s *Store) loadWorkClaims(projectID string, cards []work.Card) error {
	tasks := map[string]*work.Task{}
	for i := range cards {
		for j := range cards[i].Tasks {
			tasks[cards[i].Tasks[j].ID] = &cards[i].Tasks[j]
		}
	}
	return s.eachRow(`SELECT id,project_id,task_id,holder,scope,created_at FROM work_claims WHERE project_id=?`,
		projectID, func(rows *sql.Rows) error {
			var claim work.Claim
			var created string
			if err := rows.Scan(&claim.ID, &claim.ProjectID, &claim.TaskID, &claim.Holder, &claim.Scope, &created); err != nil {
				return err
			}
			claim.CreatedAt, _ = time.Parse(time.RFC3339, created)
			if task, ok := tasks[claim.TaskID]; ok {
				task.Claim = &claim
			}
			return nil
		})
}

func (s *Store) eachRow(query string, arg any, scan func(*sql.Rows) error) error {
	rows, err := s.DB.Query(query, arg)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		if err := scan(rows); err != nil {
			return err
		}
	}
	return rows.Err()
}

// workColumns maps Op field names to columns per entity. Anything else is rejected.
var workColumns = map[string]map[string]string{
	work.EntityCard: {
		"slug": "slug", "title": "title", "intent": "intent", "stage": "stage", "status": "status",
		"owner": "owner", "kind": "kind", "under": "under", "decisions": "decisions_json", "position": "position",
	},
	work.EntityTask: {
		"number": "number", "title": "title", "state": "state", "repo": "repo", "scope": "scope", "position": "position",
	},
	work.EntityQuestion: {
		"text": "text", "blocking": "blocking", "options": "options_json", "state": "state",
		"answer": "answer", "position": "position",
	},
	work.EntityInvariant: {
		"text": "text", "state": "state", "position": "position",
	},
	work.EntityHandoff: {
		"branch": "branch", "agent": "agent", "goal": "goal", "done": "done",
		"in_progress": "in_progress", "next": "next", "touched": "touched_json",
	},
}

var workTables = map[string]string{
	work.EntityCard:      "work_cards",
	work.EntityTask:      "work_tasks",
	work.EntityQuestion:  "work_questions",
	work.EntityInvariant: "work_invariants",
	work.EntityHandoff:   "work_handoffs",
}

// ApplyWorkOps writes ops in one transaction and appends one change_ops row per
// op. It returns the ids of the cards touched, in first-touch order.
func (s *Store) ApplyWorkOps(projectID, agentRunID, batchID string, ops []work.Op) ([]string, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	tx, err := s.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	var cardIDs []string
	seen := map[string]bool{}
	for _, op := range ops {
		if err := applyWorkOp(tx, projectID, op, now); err != nil {
			return nil, fmt.Errorf("%s %s %s: %w", op.Kind, op.Entity, op.CardSlug, err)
		}
		switch {
		case op.Entity == work.EntityNode && op.NodeID != "":
			if _, err := tx.Exec(`UPDATE structure_nodes SET updated_at=? WHERE id=?`, now, op.NodeID); err != nil {
				return nil, err
			}
		case op.Entity != work.EntityCard && op.Entity != work.EntityNode && op.Entity != work.EntityDecision && op.CardID != "":
			if _, err := tx.Exec(`UPDATE work_cards SET updated_at=? WHERE id=?`, now, op.CardID); err != nil {
				return nil, err
			}
		}
		data, err := json.Marshal(op.Fields)
		if err != nil {
			return nil, err
		}
		if _, err := tx.Exec(`INSERT INTO change_ops(id,project_id,agent_run_id,batch_id,entity,entity_id,op,data_json,node_id,created_at)
			VALUES(?,?,?,?,?,?,?,?,?,?)`,
			ids.NewULID(), projectID, agentRunID, batchID, op.Entity, op.EntityID, op.Kind, string(data), op.NodeID, now); err != nil {
			return nil, err
		}
		if op.CardID != "" && op.Entity != work.EntityNode && !seen[op.CardID] {
			seen[op.CardID] = true
			cardIDs = append(cardIDs, op.CardID)
		}
	}
	for _, cardID := range cardIDs {
		if err := reindexWorkCardFTS(tx, cardID); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return cardIDs, nil
}

func applyWorkOp(tx *sql.Tx, projectID string, op work.Op, now string) error {
	if op.Entity == work.EntityClaim {
		return applyClaimOp(tx, projectID, op, now)
	}
	if op.Entity == work.EntityNode {
		return applyStructureOp(tx, projectID, op, now)
	}
	if op.Entity == work.EntityFact {
		return applyFactOp(tx, projectID, op, now)
	}
	if op.Entity == work.EntityDecision {
		return applyDecisionOp(tx, projectID, op, now)
	}
	table, ok := workTables[op.Entity]
	if !ok {
		return fmt.Errorf("unknown entity %q", op.Entity)
	}
	columns := workColumns[op.Entity]
	var names []string
	var values []any
	for field, value := range op.Fields {
		column, ok := columns[field]
		if !ok {
			return fmt.Errorf("unknown field %q", field)
		}
		v, err := columnValue(value)
		if err != nil {
			return err
		}
		names = append(names, column)
		values = append(values, v)
	}

	if op.Kind == work.OpCreate {
		if op.Entity == work.EntityHandoff {
			names = append(names, "id", "project_id", "card_id", "created_at")
			values = append(values, op.EntityID, projectID, op.CardID, now)
		} else {
			names = append(names, "id", "created_at", "updated_at")
			values = append(values, op.EntityID, now, now)
			if op.Entity == work.EntityCard {
				names = append(names, "project_id")
				values = append(values, projectID)
			} else {
				names = append(names, "card_id")
				values = append(values, op.CardID)
			}
		}
		marks := strings.TrimSuffix(strings.Repeat("?,", len(names)), ",")
		_, err := tx.Exec(`INSERT INTO `+table+`(`+strings.Join(names, ",")+`) VALUES(`+marks+`)`, values...)
		return err
	}

	if len(names) == 0 {
		return nil
	}
	assignments := make([]string, 0, len(names)+1)
	for _, name := range names {
		assignments = append(assignments, name+"=?")
	}
	assignments = append(assignments, "updated_at=?")
	values = append(values, now, op.EntityID)
	result, err := tx.Exec(`UPDATE `+table+` SET `+strings.Join(assignments, ",")+` WHERE id=?`, values...)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return fmt.Errorf("record %s not found", op.EntityID)
	}
	return nil
}

func columnValue(value any) (any, error) {
	switch v := value.(type) {
	case []string:
		if v == nil {
			v = []string{}
		}
		body, err := json.Marshal(v)
		return string(body), err
	case bool:
		if v {
			return 1, nil
		}
		return 0, nil
	default:
		return v, nil
	}
}

// applyClaimOp inserts or deletes one work_claims row. The planner already
// arbitrated; the checks here only catch a claim another write committed in
// between (the task_id unique key covers the same task).
func applyClaimOp(tx *sql.Tx, projectID string, op work.Op, now string) error {
	holder, _ := op.Fields["holder"].(string)
	switch op.Kind {
	case work.OpCreate:
		taskID, _ := op.Fields["task_id"].(string)
		scope, _ := op.Fields["scope"].(string)
		if scope != "" {
			rows, err := tx.Query(`SELECT holder,scope FROM work_claims WHERE project_id=? AND holder<>? AND scope<>''`, projectID, holder)
			if err != nil {
				return err
			}
			defer rows.Close()
			for rows.Next() {
				var otherHolder, otherScope string
				if err := rows.Scan(&otherHolder, &otherScope); err != nil {
					return err
				}
				if work.ScopesOverlap(scope, otherScope) {
					return fmt.Errorf("scope %s overlaps %s held by %s", scope, otherScope, otherHolder)
				}
			}
			if err := rows.Err(); err != nil {
				return err
			}
		}
		_, err := tx.Exec(`INSERT INTO work_claims(id,project_id,task_id,holder,scope,created_at) VALUES(?,?,?,?,?,?)`,
			op.EntityID, projectID, taskID, holder, scope, now)
		return err
	case work.OpRemove:
		result, err := tx.Exec(`DELETE FROM work_claims WHERE id=?`, op.EntityID)
		if err != nil {
			return err
		}
		if n, _ := result.RowsAffected(); n == 0 {
			return fmt.Errorf("claim %s not found", op.EntityID)
		}
		return nil
	default:
		return fmt.Errorf("unsupported claim op %q", op.Kind)
	}
}

// ListStructureChangeOps returns the change_ops rows that touched Structure nodes and
// invariants, oldest first.
func (s *Store) ListStructureChangeOps(projectID string) ([]structure.HistoryOp, error) {
	var ops []structure.HistoryOp
	err := s.eachRow(`SELECT rowid,batch_id,agent_run_id,op,entity_id,node_id,data_json,created_at
		FROM change_ops WHERE project_id=? AND entity='node' ORDER BY rowid`, projectID, func(rows *sql.Rows) error {
		var op structure.HistoryOp
		var data, created string
		if err := rows.Scan(&op.Seq, &op.BatchID, &op.AgentRunID, &op.Kind, &op.EntityID, &op.NodeID, &data, &created); err != nil {
			return err
		}
		_ = json.Unmarshal([]byte(data), &op.Fields)
		op.CreatedAt, _ = time.Parse(time.RFC3339, created)
		ops = append(ops, op)
		return nil
	})
	return ops, err
}
