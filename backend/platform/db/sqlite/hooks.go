package sqlite

import (
	"database/sql"
	"sort"
	"sync"
	"sync/atomic"

	"modernc.org/sqlite"
)

// ChangeRecorder receives, once per committed transaction, the tables it wrote
// and the project ids found in the written rows (Verdict 0007). It runs inside the
// SQLite commit hook, before the commit is visible to other connections, so it
// must only record and return.
type ChangeRecorder func(tables, projectIDs []string)

var (
	recorder       atomic.Pointer[ChangeRecorder]
	projectColumns atomic.Pointer[map[string]int]
)

// SetChangeRecorder installs fn for every connection of this process; nil
// turns recording off.
func SetChangeRecorder(fn ChangeRecorder) {
	if fn == nil {
		recorder.Store(nil)
		return
	}
	recorder.Store(&fn)
}

func init() {
	sqlite.RegisterConnectionHook(func(conn sqlite.ExecQuerierContext, _ string) error {
		hooks, ok := conn.(sqlite.HookRegisterer)
		if !ok {
			return nil
		}
		tx := &pendingTx{}
		hooks.RegisterPreUpdateHook(tx.preUpdate)
		hooks.RegisterCommitHook(tx.commit)
		hooks.RegisterRollbackHook(tx.reset)
		return nil
	})
}

// pendingTx accumulates what one connection's open transaction wrote.
type pendingTx struct {
	mu       sync.Mutex
	tables   map[string]bool
	projects map[string]bool
}

func (p *pendingTx) preUpdate(data sqlite.SQLitePreUpdateData) {
	if recorder.Load() == nil || data.DatabaseName != "main" || data.TableName == "schema_migrations" {
		return
	}
	projectID := rowProjectID(&data)
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.tables == nil {
		p.tables, p.projects = map[string]bool{}, map[string]bool{}
	}
	p.tables[data.TableName] = true
	if projectID != "" {
		p.projects[projectID] = true
	}
}

func (p *pendingTx) commit() int32 {
	p.mu.Lock()
	tables, projects := keys(p.tables), keys(p.projects)
	p.tables, p.projects = nil, nil
	p.mu.Unlock()
	if len(tables) == 0 {
		return 0
	}
	if fn := recorder.Load(); fn != nil {
		(*fn)(tables, projects)
	}
	return 0
}

func (p *pendingTx) reset() {
	p.mu.Lock()
	p.tables, p.projects = nil, nil
	p.mu.Unlock()
}

// rowProjectID reads the project id column of the written row, when the table
// has one (projects.id counts as the project id of that row).
func rowProjectID(data *sqlite.SQLitePreUpdateData) string {
	columns := projectColumns.Load()
	if columns == nil {
		return ""
	}
	index, ok := (*columns)[data.TableName]
	if !ok {
		return ""
	}
	row := make([]any, index+1)
	var err error
	if data.Op == sqliteDelete {
		err = data.Old(row...)
	} else {
		err = data.New(row...)
	}
	if err != nil {
		return ""
	}
	value, _ := row[index].(string)
	return value
}

// SQLite operation code for DELETE (sqlite3.SQLITE_DELETE).
const sqliteDelete = 9

// LoadProjectColumns records, for each table, which column holds its project
// id, so change events can name the projects a transaction touched.
func LoadProjectColumns(db *sql.DB) error {
	rows, err := db.Query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
	if err != nil {
		return err
	}
	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			_ = rows.Close()
			return err
		}
		tables = append(tables, name)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	columns := map[string]int{}
	for _, table := range tables {
		want := "project_id"
		if table == "projects" {
			want = "id"
		}
		info, err := db.Query(`SELECT cid, name FROM pragma_table_info(?)`, table)
		if err != nil {
			return err
		}
		for info.Next() {
			var cid int
			var name string
			if err := info.Scan(&cid, &name); err != nil {
				_ = info.Close()
				return err
			}
			if name == want {
				columns[table] = cid
			}
		}
		if err := info.Close(); err != nil {
			return err
		}
	}
	projectColumns.Store(&columns)
	return nil
}

func keys(set map[string]bool) []string {
	out := make([]string, 0, len(set))
	for key := range set {
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}
