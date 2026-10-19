package db

import (
	"database/sql"
	"fmt"
	"strings"
	"sync"

	"github.com/polterware/polterware/notes/backend/platform/changes"
	"modernc.org/sqlite"
)

const (
	driverName = "notes-sqlite"

	opDelete = 9
	opInsert = 18
	opUpdate = 23
)

type tableMeta struct {
	entity string
	idCol  int
}

var watched = map[string]tableMeta{
	"spaces":           {entity: "space", idCol: 0},
	"notes":            {entity: "note", idCol: 0},
	"tags":             {entity: "tag", idCol: 0},
	"note_tags":        {entity: "note", idCol: 0},
	"check_items":      {entity: "note", idCol: 1},
	"schedules":        {entity: "note", idCol: 0},
	"places":           {entity: "note", idCol: 0},
	"completions":      {entity: "note", idCol: 1},
	"attachments":      {entity: "attachment", idCol: 0},
	"focus_sessions":   {entity: "focus", idCol: 0},
	"reminder_oneoffs": {entity: "reminder", idCol: 0},
	"settings":         {entity: "setting", idCol: 0},
}

var harvests sync.Map // key string -> *harvestBuf

type harvestBuf struct {
	writer chan struct{} // serialize transactions through harvesting and publication
	mu     sync.Mutex
	list   []changes.Change
}

func bufFor(key string) *harvestBuf {
	actual, _ := harvests.LoadOrStore(key, &harvestBuf{writer: make(chan struct{}, 1)})
	return actual.(*harvestBuf)
}

func init() {
	var d sqlite.Driver
	d.RegisterConnectionHook(func(conn sqlite.ExecQuerierContext, dsn string) error {
		hooks, ok := conn.(sqlite.HookRegisterer)
		if !ok {
			return fmt.Errorf("sqlite connection does not implement hooks")
		}
		tx := &pendingTx{key: dsnKey(dsn)}
		hooks.RegisterPreUpdateHook(tx.preUpdate)
		hooks.RegisterCommitHook(tx.commit)
		hooks.RegisterRollbackHook(tx.reset)
		return nil
	})
	sql.Register(driverName, &d)
}

func dsnKey(dsn string) string {
	dsn = strings.TrimPrefix(dsn, "file:")
	key, _, _ := strings.Cut(dsn, "?")
	return key
}

type pendingTx struct {
	key     string
	mu      sync.Mutex
	changes []changes.Change
}

func (p *pendingTx) preUpdate(data sqlite.SQLitePreUpdateData) {
	if data.DatabaseName != "main" {
		return
	}
	meta, ok := watched[data.TableName]
	if !ok {
		return
	}
	op, ok := opName(data.Op)
	if !ok {
		return
	}
	id := rowID(&data, meta.idCol)
	p.mu.Lock()
	p.changes = append(p.changes, changes.Change{Entity: meta.entity, ID: id, Op: op})
	p.mu.Unlock()
}

func (p *pendingTx) commit() int32 {
	p.mu.Lock()
	batch := coalesce(p.changes)
	p.changes = nil
	p.mu.Unlock()
	if len(batch) == 0 {
		return 0
	}
	buf := bufFor(p.key)
	buf.mu.Lock()
	buf.list = append(buf.list, batch...)
	buf.mu.Unlock()
	return 0
}

func (p *pendingTx) reset() {
	p.mu.Lock()
	p.changes = nil
	p.mu.Unlock()
}

func (h *Handle) takeCommitted() []changes.Change {
	buf := bufFor(h.key)
	buf.mu.Lock()
	defer buf.mu.Unlock()
	out := buf.list
	buf.list = nil
	return out
}

func (h *Handle) discardCommitted() {
	buf := bufFor(h.key)
	buf.mu.Lock()
	buf.list = nil
	buf.mu.Unlock()
}

func opName(op int32) (string, bool) {
	switch op {
	case opInsert:
		return "create", true
	case opUpdate:
		return "update", true
	case opDelete:
		return "delete", true
	default:
		return "", false
	}
}

func rowID(data *sqlite.SQLitePreUpdateData, col int) string {
	cols := make([]any, col+1)
	var err error
	if data.Op == opDelete {
		err = data.Old(cols...)
	} else {
		err = data.New(cols...)
	}
	if err != nil || cols[col] == nil {
		if data.Op == opDelete {
			return fmt.Sprintf("%d", data.OldRowID)
		}
		return fmt.Sprintf("%d", data.NewRowID)
	}
	switch v := cols[col].(type) {
	case string:
		return v
	default:
		return fmt.Sprint(v)
	}
}

func coalesce(in []changes.Change) []changes.Change {
	type key struct{ entity, id string }
	order := make([]key, 0, len(in))
	ops := make(map[key]string, len(in))
	for _, c := range in {
		k := key{c.Entity, c.ID}
		if _, seen := ops[k]; !seen {
			order = append(order, k)
		}
		ops[k] = mergeOp(ops[k], c.Op)
	}
	out := make([]changes.Change, 0, len(order))
	for _, k := range order {
		if op := ops[k]; op != "" {
			out = append(out, changes.Change{Entity: k.entity, ID: k.id, Op: op})
		}
	}
	return out
}

func mergeOp(prev, next string) string {
	if prev == "" {
		return next
	}
	if prev == "create" && next == "delete" {
		return ""
	}
	if prev == "create" {
		return "create"
	}
	if next == "delete" {
		return "delete"
	}
	return next
}
