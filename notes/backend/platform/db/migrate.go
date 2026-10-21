package db

import (
	"context"
	"fmt"
	"io/fs"
	"sort"
	"strconv"
	"strings"
	"time"
)

const createMigrations = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`

// Migrate applies numbered *.sql files from fsys/dir that are not yet in schema_migrations.
// Files run forward-only, one version per transaction, statements split on ';'.
func Migrate(ctx context.Context, h *Handle, fsys fs.FS, dir string) error {
	q := h.Writer()
	if _, err := q.ExecContext(ctx, createMigrations); err != nil {
		return fmt.Errorf("schema_migrations: %w", err)
	}
	entries, err := fs.ReadDir(fsys, dir)
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	for _, name := range names {
		ver, err := versionOf(name)
		if err != nil {
			return err
		}
		var exists int
		if err := q.QueryRowContext(ctx, `SELECT COUNT(1) FROM schema_migrations WHERE version=?`, ver).Scan(&exists); err != nil {
			return err
		}
		if exists > 0 {
			continue
		}
		body, err := fs.ReadFile(fsys, dir+"/"+name)
		if err != nil {
			return fmt.Errorf("read %s: %w", name, err)
		}
		tx, err := q.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		for i, stmt := range splitSQL(string(body)) {
			if _, err := tx.ExecContext(ctx, stmt); err != nil {
				_ = tx.Rollback()
				return fmt.Errorf("apply %s statement %d: %w", name, i, err)
			}
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations(version, name, applied_at) VALUES (?,?,?)`,
			ver, name, FormatTime(time.Now().UTC())); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("record %s: %w", name, err)
		}
		if err := tx.Commit(); err != nil {
			return err
		}
		h.discardCommitted()
	}
	return nil
}

func versionOf(name string) (int, error) {
	head, _, ok := strings.Cut(name, "_")
	if !ok {
		return 0, fmt.Errorf("migration name %s: want N_description.sql", name)
	}
	ver, err := strconv.Atoi(head)
	if err != nil {
		return 0, fmt.Errorf("migration name %s: %w", name, err)
	}
	return ver, nil
}

func splitSQL(script string) []string {
	var stmts []string
	var b strings.Builder
	inLineComment := false
	inString := false
	for i := 0; i < len(script); i++ {
		c := script[i]
		if inLineComment {
			b.WriteByte(c)
			if c == '\n' {
				inLineComment = false
			}
			continue
		}
		if inString {
			b.WriteByte(c)
			if c == '\'' {
				if i+1 < len(script) && script[i+1] == '\'' {
					b.WriteByte(script[i+1])
					i++
					continue
				}
				inString = false
			}
			continue
		}
		if c == '-' && i+1 < len(script) && script[i+1] == '-' {
			inLineComment = true
			b.WriteByte(c)
			continue
		}
		if c == '\'' {
			inString = true
			b.WriteByte(c)
			continue
		}
		if c == ';' {
			stmt := strings.TrimSpace(stripSQLComments(b.String()))
			b.Reset()
			if stmt != "" {
				stmts = append(stmts, stmt)
			}
			continue
		}
		b.WriteByte(c)
	}
	if stmt := strings.TrimSpace(stripSQLComments(b.String())); stmt != "" {
		stmts = append(stmts, stmt)
	}
	return stmts
}

func stripSQLComments(stmt string) string {
	var b strings.Builder
	for _, line := range strings.Split(stmt, "\n") {
		trim := strings.TrimSpace(line)
		if strings.HasPrefix(trim, "--") {
			continue
		}
		b.WriteString(line)
		b.WriteByte('\n')
	}
	return b.String()
}

// AppliedVersions returns applied migration versions in order.
func AppliedVersions(ctx context.Context, h *Handle) ([]int, error) {
	rows, err := h.Writer().QueryContext(ctx, `SELECT version FROM schema_migrations ORDER BY version`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []int
	for rows.Next() {
		var v int
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
