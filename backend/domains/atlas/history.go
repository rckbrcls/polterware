package atlas

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

// HistoryOp is one change_ops row that touched an Atlas node or invariant.
type HistoryOp struct {
	Seq        int64
	BatchID    string
	AgentRunID string
	Kind       string
	EntityID   string
	// NodeID is set for invariant ops; empty for node ops.
	NodeID    string
	Fields    map[string]any
	CreatedAt time.Time
}

// HistoryEntry is one batch that touched the Atlas.
type HistoryEntry struct {
	BatchID    string
	At         time.Time
	AgentRunID string
	NodeOps    int
	Summary    string
}

// History groups ops into batches, oldest first.
func History(ops []HistoryOp) []HistoryEntry {
	var entries []HistoryEntry
	index := map[string]int{}
	for _, op := range ops {
		i, ok := index[op.BatchID]
		if !ok {
			i = len(entries)
			index[op.BatchID] = i
			entries = append(entries, HistoryEntry{BatchID: op.BatchID, At: op.CreatedAt, AgentRunID: op.AgentRunID})
		}
		entries[i].NodeOps++
		if entries[i].Summary == "" && op.NodeID == "" {
			entries[i].Summary = firstString(op.Fields, "path", "title", "slug")
		}
	}
	return entries
}

// Cut returns how many leading ops belong to the point at: a change batch id
// (that batch is included), an RFC3339 time, or a YYYY-MM-DD day (the whole
// day is included, in UTC). ops must be ordered oldest first.
func Cut(ops []HistoryOp, at string) (int, error) {
	at = strings.TrimSpace(at)
	if at == "" {
		return len(ops), nil
	}
	last := -1
	for i, op := range ops {
		if op.BatchID == at {
			last = i
		}
	}
	if last >= 0 {
		return last + 1, nil
	}
	limit, err := ParsePoint(at)
	if err != nil {
		return 0, err
	}
	n := 0
	for _, op := range ops {
		if op.CreatedAt.After(limit) {
			break
		}
		n++
	}
	return n, nil
}

// ParsePoint reads an RFC3339 time or a YYYY-MM-DD day (end of that day, UTC).
func ParsePoint(at string) (time.Time, error) {
	if t, err := time.Parse(time.RFC3339, at); err == nil {
		return t, nil
	}
	if day, err := time.Parse("2006-01-02", at); err == nil {
		return day.Add(24*time.Hour - time.Second), nil
	}
	return time.Time{}, fmt.Errorf("unknown point %q: use a change batch id, an RFC3339 time, a YYYY-MM-DD day, or a commit sha", at)
}

// Replay rebuilds the nodes as they were after ops (oldest first). Ops are
// diffs: a create carries every column, an update only the changed ones. The
// result is ordered by position; removed nodes stay, marked NodeRemoved.
func Replay(projectID string, ops []HistoryOp) []Node {
	nodes := map[string]*Node{}
	var order []string
	invariantOwner := map[string]string{}
	for _, op := range ops {
		if op.NodeID != "" {
			node := nodes[op.NodeID]
			if node == nil {
				continue
			}
			invariantOwner[op.EntityID] = op.NodeID
			replayInvariant(node, op)
			continue
		}
		if _, isInvariant := invariantOwner[op.EntityID]; isInvariant {
			continue
		}
		node := nodes[op.EntityID]
		if node == nil {
			// Invariant ops written before migration 0023 carry no node id;
			// they have no path either, so they are skipped here.
			if op.Kind != "create" || firstString(op.Fields, "path") == "" {
				continue
			}
			node = &Node{ID: op.EntityID, ProjectID: projectID, Status: NodeActive}
			nodes[op.EntityID] = node
			order = append(order, op.EntityID)
		}
		applyNodeFields(node, op.Fields)
	}
	result := make([]Node, 0, len(order))
	for _, id := range order {
		result = append(result, *nodes[id])
	}
	sort.SliceStable(result, func(i, j int) bool { return result[i].Position < result[j].Position })
	return result
}

func replayInvariant(node *Node, op HistoryOp) {
	for i := range node.Invariants {
		if node.Invariants[i].ID != op.EntityID {
			continue
		}
		applyInvariantFields(&node.Invariants[i], op.Fields)
		return
	}
	inv := Invariant{ID: op.EntityID, NodeID: node.ID}
	applyInvariantFields(&inv, op.Fields)
	node.Invariants = append(node.Invariants, inv)
}

func applyInvariantFields(inv *Invariant, fields map[string]any) {
	if v, ok := fields["text"].(string); ok {
		inv.Text = v
	}
	if v, ok := fields["state"].(string); ok {
		inv.State = v
	}
	if v, ok := number(fields["position"]); ok {
		inv.Position = v
	}
}

func applyNodeFields(node *Node, fields map[string]any) {
	for key, value := range fields {
		text, _ := value.(string)
		switch key {
		case "parent_id":
			node.ParentID = text
		case "level":
			node.Level = text
		case "slug":
			node.Slug = text
		case "path":
			node.Path = text
		case "title":
			node.Title = text
		case "intent":
			node.Intent = text
		case "status":
			node.Status = text
		case "repo":
			node.Repo = text
		case "folder":
			node.Folder = text
		case "migration_from":
			node.MigrationFrom = text
		case "migration_to":
			node.MigrationTo = text
		case "position":
			if n, ok := number(value); ok {
				node.Position = n
			}
		case "decisions":
			node.Decisions = stringList(value)
		case "uses":
			node.Uses = stringList(value)
		case "deploys":
			if deploys, ok := DeploymentsFrom(value); ok {
				node.Deploys = deploys
			}
		}
	}
}

func number(value any) (int, bool) {
	switch v := value.(type) {
	case float64:
		return int(v), true
	case int:
		return v, true
	}
	return 0, false
}

func stringList(value any) []string {
	items, _ := value.([]any)
	if strings, ok := value.([]string); ok {
		return strings
	}
	var out []string
	for _, item := range items {
		if text, ok := item.(string); ok {
			out = append(out, text)
		}
	}
	return out
}

func firstString(fields map[string]any, keys ...string) string {
	for _, key := range keys {
		if text, _ := fields[key].(string); text != "" {
			return text
		}
	}
	return ""
}

// Historical wraps replayed nodes as rows with no derived status or counts.
// Removed nodes are left out. Child counts are still computed.
func Historical(nodes []Node) []Row {
	rows := Decorate(nodes, nil)
	for i := range rows {
		rows[i].Derived = ""
	}
	return rows
}
