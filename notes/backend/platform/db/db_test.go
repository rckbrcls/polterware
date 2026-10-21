package db

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"testing/fstest"
	"time"

	"github.com/polterware/polterware/notes/backend/platform/changes"
)

func tempHandle(t *testing.T) *Handle {
	t.Helper()
	h, err := Open(filepath.Join(t.TempDir(), "notes.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = h.Close() })
	return h
}

func TestOpenWALPragmas(t *testing.T) {
	h := tempHandle(t)
	ctx := context.Background()
	var mode string
	if err := h.Writer().QueryRowContext(ctx, `PRAGMA journal_mode`).Scan(&mode); err != nil {
		t.Fatal(err)
	}
	if mode != "wal" {
		t.Fatalf("journal_mode=%s", mode)
	}
	var fk, timeout, sync string
	if err := h.Writer().QueryRowContext(ctx, `PRAGMA foreign_keys`).Scan(&fk); err != nil {
		t.Fatal(err)
	}
	if fk != "1" {
		t.Fatalf("foreign_keys=%s", fk)
	}
	if err := h.Writer().QueryRowContext(ctx, `PRAGMA busy_timeout`).Scan(&timeout); err != nil {
		t.Fatal(err)
	}
	if timeout != "5000" {
		t.Fatalf("busy_timeout=%s", timeout)
	}
	if err := h.Writer().QueryRowContext(ctx, `PRAGMA synchronous`).Scan(&sync); err != nil {
		t.Fatal(err)
	}
	if sync != "1" { // NORMAL
		t.Fatalf("synchronous=%s", sync)
	}
}

func TestMigrateForwardOnlyIdempotent(t *testing.T) {
	h := tempHandle(t)
	ctx := context.Background()
	fsys := fstest.MapFS{
		"migrations/0001_one.sql": &fstest.MapFile{Data: []byte("CREATE TABLE t (id TEXT PRIMARY KEY) STRICT;\nINSERT INTO t(id) VALUES ('a');\n")},
		"migrations/0002_two.sql": &fstest.MapFile{Data: []byte("ALTER TABLE t ADD COLUMN n INTEGER NOT NULL DEFAULT 0;\n")},
	}
	if err := Migrate(ctx, h, fsys, "migrations"); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(ctx, h, fsys, "migrations"); err != nil {
		t.Fatal(err)
	}
	vers, err := AppliedVersions(ctx, h)
	if err != nil {
		t.Fatal(err)
	}
	if len(vers) != 2 || vers[0] != 1 || vers[1] != 2 {
		t.Fatalf("versions=%v", vers)
	}
	var n, rows int
	if err := h.Writer().QueryRowContext(ctx, `SELECT n, COUNT(*) FROM t`).Scan(&n, &rows); err != nil {
		t.Fatal(err)
	}
	if n != 0 || rows != 1 {
		t.Fatalf("n=%d rows=%d", n, rows)
	}
}

func TestWALReaderDuringWrite(t *testing.T) {
	h := tempHandle(t)
	ctx := context.Background()
	if _, err := h.Writer().ExecContext(ctx, `CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT NOT NULL) STRICT`); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Writer().ExecContext(ctx, `INSERT INTO notes(id, title) VALUES ('a', 'seed')`); err != nil {
		t.Fatal(err)
	}
	tx, err := h.Writer().BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO notes(id, title) VALUES ('b', 'uncommitted')`); err != nil {
		t.Fatal(err)
	}
	started := time.Now()
	var n int
	if err := h.Reader().QueryRowContext(ctx, `SELECT COUNT(*) FROM notes`).Scan(&n); err != nil {
		t.Fatalf("reader during write: %v", err)
	}
	if time.Since(started) > time.Second {
		t.Fatalf("reader blocked for %s", time.Since(started))
	}
	if n != 1 {
		t.Fatalf("reader saw %d rows before commit", n)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if err := h.Reader().QueryRowContext(ctx, `SELECT COUNT(*) FROM notes`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 2 {
		t.Fatalf("reader saw %d after commit", n)
	}
}

func TestChangesAfterCommitNeverOnRollback(t *testing.T) {
	h := tempHandle(t)
	ctx := context.Background()
	if _, err := h.Writer().ExecContext(ctx, `CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT NOT NULL) STRICT`); err != nil {
		t.Fatal(err)
	}
	h.discardCommitted()
	var got []changes.Change
	h.AfterCommit = func(batch []changes.Change) { got = append([]changes.Change(nil), batch...) }
	err := h.Within(ctx, func(ctx context.Context) error {
		_, err := h.Q(ctx, true).ExecContext(ctx, `INSERT INTO notes(id, title) VALUES ('m1', 'one')`)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Entity != "note" || got[0].ID != "m1" || got[0].Op != "create" {
		t.Fatalf("commit batch: %+v", got)
	}
	got = nil
	err = h.Within(ctx, func(ctx context.Context) error {
		if _, err := h.Q(ctx, true).ExecContext(ctx, `INSERT INTO notes(id, title) VALUES ('m2', 'two')`); err != nil {
			return err
		}
		return errRollback
	})
	if err != errRollback {
		t.Fatalf("rollback: %v", err)
	}
	if got != nil {
		t.Fatalf("published on rollback: %+v", got)
	}
	var n int
	if err := h.Reader().QueryRowContext(ctx, `SELECT COUNT(*) FROM notes`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("rolled back row leaked: %d", n)
	}
}

type rollbackError struct{}

func (rollbackError) Error() string { return "rollback" }

var errRollback rollbackError

func TestWaitingWriterHonorsCancellation(t *testing.T) {
	h := tempHandle(t)
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	entered, release := make(chan struct{}), make(chan struct{})
	first := make(chan error, 1)
	go func() {
		first <- h.Within(ctx, func(context.Context) error {
			close(entered)
			<-release
			return nil
		})
	}()
	select {
	case <-entered:
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	waitCtx, stop := context.WithCancel(ctx)
	second := make(chan error, 1)
	go func() {
		second <- h.Within(waitCtx, func(context.Context) error {
			return errors.New("cancelled writer entered transaction")
		})
	}()
	stop()
	var err error
	var blocked bool
	select {
	case err = <-second:
	case <-time.After(100 * time.Millisecond):
		blocked = true
	}
	close(release)
	if firstErr := <-first; firstErr != nil {
		t.Fatal(firstErr)
	}
	if blocked {
		err = <-second
		t.Error("cancelled writer waited for unrelated transaction")
	}
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled writer: %v", err)
	}
}

func TestWriterWaitsForCommitPublication(t *testing.T) {
	h := tempHandle(t)
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	if _, err := h.Writer().ExecContext(ctx, `CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT NOT NULL) STRICT`); err != nil {
		t.Fatal(err)
	}
	h.discardCommitted()
	publishing, release := make(chan struct{}), make(chan struct{})
	batches := make(chan []changes.Change, 2)
	h.AfterCommit = func(batch []changes.Change) {
		close(publishing)
		<-release
		batches <- batch
	}
	committed := make(chan error, 1)
	go func() {
		committed <- h.Within(ctx, func(ctx context.Context) error {
			// Nested writes must join rather than lock again.
			return h.Within(ctx, func(ctx context.Context) error {
				_, err := h.Q(ctx, true).ExecContext(ctx, `INSERT INTO notes VALUES ('a', 'committed')`)
				return err
			})
		})
	}()
	select {
	case <-publishing:
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	entered := make(chan struct{})
	rolledBack := make(chan error, 1)
	go func() {
		rolledBack <- h.Within(ctx, func(ctx context.Context) error {
			close(entered)
			if _, err := h.Q(ctx, true).ExecContext(ctx, `INSERT INTO notes VALUES ('b', 'rolled back')`); err != nil {
				return err
			}
			return errRollback
		})
	}()
	var overtook bool
	select {
	case <-entered:
		overtook = true
	case <-time.After(50 * time.Millisecond):
	}
	close(release)
	if err := <-committed; err != nil {
		t.Fatal(err)
	}
	if err := <-rolledBack; err != errRollback {
		t.Fatalf("rollback: %v", err)
	}
	if overtook {
		t.Error("next writer entered before the previous commit was published")
	}
	batch := <-batches
	if len(batch) != 1 || batch[0].ID != "a" || batch[0].Op != "create" {
		t.Fatalf("committed batch lost or mixed with rollback: %+v", batch)
	}
	select {
	case batch := <-batches:
		t.Fatalf("rollback published: %+v", batch)
	default:
	}
}
