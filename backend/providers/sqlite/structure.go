package sqlite

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/polterware/polterware/backend/domains/integrations"
	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
	"github.com/polterware/polterware/backend/platform/ids"
)

func (s *Store) loadStructureNodes(projectID string) ([]structure.Node, error) {
	rows, err := s.DB.Query(`SELECT id,project_id,COALESCE(parent_id,''),level,slug,path,title,intent,status,decisions_json,position,repo,folder,kind,tech,migration_from,migration_to
		FROM structure_nodes WHERE project_id=? ORDER BY position, created_at`, projectID)
	if err != nil {
		return nil, err
	}
	var nodes []structure.Node
	index := map[string]int{}
	for rows.Next() {
		var node structure.Node
		var decisions string
		if err := rows.Scan(&node.ID, &node.ProjectID, &node.ParentID, &node.Level, &node.Slug, &node.Path,
			&node.Title, &node.Intent, &node.Status, &decisions, &node.Position, &node.Repo, &node.Folder, &node.Kind, &node.Tech, &node.MigrationFrom, &node.MigrationTo); err != nil {
			_ = rows.Close()
			return nil, err
		}
		_ = json.Unmarshal([]byte(decisions), &node.Decisions)
		index[node.ID] = len(nodes)
		nodes = append(nodes, node)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	if len(nodes) == 0 {
		return nil, nil
	}
	err = s.eachRow(`SELECT id,node_id,text,state,position FROM structure_invariants
		WHERE node_id IN (SELECT id FROM structure_nodes WHERE project_id=?) ORDER BY position`,
		projectID, func(rows *sql.Rows) error {
			var inv structure.Invariant
			if err := rows.Scan(&inv.ID, &inv.NodeID, &inv.Text, &inv.State, &inv.Position); err != nil {
				return err
			}
			if i, ok := index[inv.NodeID]; ok {
				nodes[i].Invariants = append(nodes[i].Invariants, inv)
			}
			return nil
		})
	if err != nil {
		return nil, err
	}
	err = s.eachRow(`SELECT d.id,d.node_id,d.environment_id,COALESCE(e.name,''),d.provider,d.resource
		FROM node_deployments d LEFT JOIN environments e ON e.id=d.environment_id
		WHERE d.project_id=? ORDER BY e.name, d.environment_id`,
		projectID, func(rows *sql.Rows) error {
			var deploy structure.Deployment
			var nodeID string
			if err := rows.Scan(&deploy.ID, &nodeID, &deploy.EnvironmentID, &deploy.Environment, &deploy.Provider, &deploy.Resource); err != nil {
				return err
			}
			if i, ok := index[nodeID]; ok {
				nodes[i].Deploys = append(nodes[i].Deploys, deploy)
			}
			return nil
		})
	return nodes, err
}

func applyStructureOp(tx *sql.Tx, projectID string, op work.Op, now string) error {
	if op.NodeID != "" {
		return applyStructureInvariant(tx, op, now)
	}
	deploys, hasDeploys := op.Fields["deploys"]
	parent, _ := op.Fields["parent_id"].(string)
	switch op.Kind {
	case work.OpCreate:
		decisions, err := columnValue(op.Fields["decisions"])
		if err != nil {
			return err
		}
		repo, _ := op.Fields["repo"].(string)
		folder, _ := op.Fields["folder"].(string)
		kind, _ := op.Fields["kind"].(string)
		tech, _ := op.Fields["tech"].(string)
		migrationFrom, _ := op.Fields["migration_from"].(string)
		migrationTo, _ := op.Fields["migration_to"].(string)
		_, err = tx.Exec(`INSERT INTO structure_nodes(id,project_id,parent_id,level,slug,path,title,intent,status,decisions_json,position,repo,folder,kind,tech,migration_from,migration_to,created_at,updated_at)
			VALUES(?,?,NULLIF(?,''),?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			op.EntityID, projectID, parent, op.Fields["level"], op.Fields["slug"], op.Fields["path"],
			op.Fields["title"], op.Fields["intent"], op.Fields["status"], decisions, op.Fields["position"], repo, folder, kind, tech, migrationFrom, migrationTo, now, now)
		if err != nil {
			return err
		}
	case work.OpUpdate, work.OpRemove:
		columnOp := op
		columnOp.Fields = withoutField(op.Fields, "deploys")
		if err := updateStructureNode(tx, columnOp, now); err != nil {
			return err
		}
	default:
		return fmt.Errorf("unknown op %q", op.Kind)
	}
	if !hasDeploys {
		return nil
	}
	return applyNodeDeploys(tx, projectID, op.EntityID, deploys, now)
}

func withoutField(fields map[string]any, key string) map[string]any {
	out := make(map[string]any, len(fields))
	for name, value := range fields {
		if name == key {
			continue
		}
		out[name] = value
	}
	return out
}

// applyNodeDeploys replaces the node's links with value. An empty list clears
// them. Provider is checked again so a hand-built op cannot store an unknown
// catalog id or a credential.
func applyNodeDeploys(tx *sql.Tx, projectID, nodeID string, value any, now string) error {
	deploys, ok := structure.DeploymentsFrom(value)
	if !ok {
		return fmt.Errorf("invalid deploys")
	}
	existing := map[string]structure.Deployment{}
	rows, err := tx.Query(`SELECT id,environment_id,provider,resource FROM node_deployments WHERE node_id=?`, nodeID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var deploy structure.Deployment
		if err := rows.Scan(&deploy.ID, &deploy.EnvironmentID, &deploy.Provider, &deploy.Resource); err != nil {
			_ = rows.Close()
			return err
		}
		existing[deploy.EnvironmentID] = deploy
	}
	if err := rows.Close(); err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, deploy := range deploys {
		if !integrations.KnownProvider(deploy.Provider) {
			return fmt.Errorf("unknown provider %q", deploy.Provider)
		}
		if deploy.EnvironmentID == "" || strings.TrimSpace(deploy.Resource) == "" || strings.ContainsAny(deploy.Resource, "\r\n") {
			return fmt.Errorf("deployment needs an environment and a resource")
		}
		if strings.Contains(strings.ToLower(deploy.Resource), "begin private") || strings.Contains(strings.ToLower(deploy.Resource), "begin rsa") {
			return fmt.Errorf("deployment resource must not be a credential")
		}
		seen[deploy.EnvironmentID] = true
		current, found := existing[deploy.EnvironmentID]
		if found && current.Provider == deploy.Provider && current.Resource == deploy.Resource {
			continue
		}
		if found {
			if _, err := tx.Exec(`UPDATE node_deployments SET provider=?, resource=?, updated_at=? WHERE id=?`,
				deploy.Provider, deploy.Resource, now, current.ID); err != nil {
				return err
			}
			continue
		}
		id := deploy.ID
		if id == "" {
			id = ids.NewULID()
		}
		if _, err := tx.Exec(`INSERT INTO node_deployments(id,project_id,node_id,environment_id,provider,resource,created_at,updated_at)
			VALUES(?,?,?,?,?,?,?,?)`,
			id, projectID, nodeID, deploy.EnvironmentID, deploy.Provider, deploy.Resource, now, now); err != nil {
			return err
		}
	}
	for env, deploy := range existing {
		if seen[env] {
			continue
		}
		if _, err := tx.Exec(`DELETE FROM node_deployments WHERE id=?`, deploy.ID); err != nil {
			return err
		}
	}
	return rows.Err()
}

func updateStructureNode(tx *sql.Tx, op work.Op, now string) error {
	var sets []string
	var values []any
	for field, value := range op.Fields {
		switch field {
		case "parent_id":
			sets = append(sets, "parent_id=NULLIF(?,'')")
			values = append(values, value)
		case "decisions":
			encoded, err := columnValue(value)
			if err != nil {
				return err
			}
			sets = append(sets, "decisions_json=?")
			values = append(values, encoded)
		case "slug", "path", "title", "intent", "level", "status", "position", "repo", "folder", "kind", "tech", "migration_from", "migration_to":
			sets = append(sets, field+"=?")
			values = append(values, value)
		default:
			return fmt.Errorf("unknown field %q", field)
		}
	}
	if len(sets) == 0 {
		return nil
	}
	sets = append(sets, "updated_at=?")
	values = append(values, now, op.EntityID)
	_, err := tx.Exec(`UPDATE structure_nodes SET `+strings.Join(sets, ",")+` WHERE id=?`, values...)
	return err
}

func applyStructureInvariant(tx *sql.Tx, op work.Op, now string) error {
	switch op.Kind {
	case work.OpCreate:
		_, err := tx.Exec(`INSERT INTO structure_invariants(id,node_id,text,state,position,created_at,updated_at)
			VALUES(?,?,?,?,?,?,?)`,
			op.EntityID, op.NodeID, op.Fields["text"], op.Fields["state"], op.Fields["position"], now, now)
		return err
	case work.OpUpdate, work.OpRemove:
		var sets []string
		var values []any
		for _, field := range []string{"text", "state", "position"} {
			value, ok := op.Fields[field]
			if !ok {
				continue
			}
			sets = append(sets, field+"=?")
			values = append(values, value)
		}
		if len(sets) == 0 {
			return nil
		}
		sets = append(sets, "updated_at=?")
		values = append(values, now, op.EntityID)
		_, err := tx.Exec(`UPDATE structure_invariants SET `+strings.Join(sets, ",")+` WHERE id=?`, values...)
		return err
	default:
		return fmt.Errorf("unknown op %q", op.Kind)
	}
}
