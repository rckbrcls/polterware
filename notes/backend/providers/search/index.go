// Package search implements the FTS5 index over the core SQLite database.
package search

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode"

	domain "github.com/polterware/polterware/notes/backend/domains/search"
	"github.com/polterware/polterware/notes/backend/platform/db"
)

type dbtx interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

// Index uses the caller-owned connection so callers can share their write transaction.
type Index struct {
	writer *sql.DB
	read   dbtx
}

var _ domain.Index = (*Index)(nil)

func New(writer *sql.DB) *Index { return &Index{writer: writer, read: writer} }

func NewWithReader(writer *sql.DB, read dbtx) *Index {
	return &Index{writer: writer, read: read}
}

func (i *Index) writeConn(ctx context.Context) dbtx {
	if tx, ok := db.TxFrom(ctx); ok {
		return tx
	}
	return i.writer
}

func (i *Index) readConn(ctx context.Context) dbtx {
	if tx, ok := db.TxFrom(ctx); ok {
		return tx
	}
	return i.read
}

func (i *Index) Upsert(ctx context.Context, doc domain.Document) error {
	return i.upsert(ctx, i.writeConn(ctx), doc)
}

func (i *Index) upsert(ctx context.Context, conn dbtx, doc domain.Document) error {
	if strings.TrimSpace(doc.NoteID) == "" {
		return errors.New("search: note id is required")
	}
	if _, err := conn.ExecContext(ctx, `DELETE FROM note_fts WHERE note_id = ?`, doc.NoteID); err != nil {
		return fmt.Errorf("search delete existing index row: %w", err)
	}
	_, err := conn.ExecContext(ctx, `INSERT INTO note_fts(note_id,title,content,checklist,tags,space) VALUES(?,?,?,?,?,?)`,
		doc.NoteID, doc.Title, StripMarkdown(doc.Content), doc.Checklist, doc.Tags, doc.Space)
	if err != nil {
		return fmt.Errorf("search insert index row: %w", err)
	}
	return nil
}

func (i *Index) Delete(ctx context.Context, noteID string) error {
	if _, err := i.writeConn(ctx).ExecContext(ctx, `DELETE FROM note_fts WHERE note_id = ?`, noteID); err != nil {
		return fmt.Errorf("search delete index row: %w", err)
	}
	return nil
}

func (i *Index) Search(ctx context.Context, query string, filter domain.Filter) ([]domain.Hit, error) {
	match := BuildQuery(query)
	if match == "" {
		return []domain.Hit{}, nil
	}
	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 500 {
		limit = 500
	}
	var where strings.Builder
	args := []any{match}
	where.WriteString(`note_fts MATCH ?`)
	if filter.Status != "" {
		where.WriteString(` AND m.status = ?`)
		args = append(args, filter.Status)
	}
	if filter.SpaceID != nil && *filter.SpaceID != "" {
		if filter.IncludeDescendants {
			where.WriteString(` AND m.space_id IN (WITH RECURSIVE tree(id) AS (SELECT id FROM spaces WHERE id = ? UNION ALL SELECT spaces.id FROM spaces JOIN tree ON spaces.parent_id=tree.id) SELECT id FROM tree)`)
		} else {
			where.WriteString(` AND m.space_id = ?`)
		}
		args = append(args, *filter.SpaceID)
	}
	if len(filter.TagIDs) != 0 {
		marks := make([]string, len(filter.TagIDs))
		for n, id := range filter.TagIDs {
			marks[n] = "?"
			args = append(args, id)
		}
		where.WriteString(` AND EXISTS (SELECT 1 FROM note_tags mt WHERE mt.note_id=m.id AND mt.tag_id IN (` + strings.Join(marks, ",") + `))`)
	}
	appendTime := func(column string, op string, value *time.Time) {
		if value != nil {
			where.WriteString(` AND m.` + column + op + `?`)
			args = append(args, value.UTC().Format(time.RFC3339Nano))
		}
	}
	appendTime("due_at", ">=", filter.DueFrom)
	appendTime("due_at", "<=", filter.DueTo)
	appendTime("updated_at", ">=", filter.UpdatedFrom)
	appendTime("updated_at", "<=", filter.UpdatedTo)
	args = append(args, limit)
	sqlQuery := `SELECT note_fts.note_id, note_fts.title, bm25(note_fts,10.0,1.0,2.0,3.0,1.5), ` +
		`snippet(note_fts,1,'<b>','</b>','…',12), ` +
		`snippet(note_fts,2,'<b>','</b>','…',12), snippet(note_fts,3,'<b>','</b>','…',12), ` +
		`snippet(note_fts,4,'<b>','</b>','…',12), snippet(note_fts,5,'<b>','</b>','…',12) ` +
		`FROM note_fts JOIN notes m ON m.id=note_fts.note_id WHERE ` + where.String() + ` ORDER BY bm25(note_fts,10.0,1.0,2.0,3.0,1.5), note_fts.note_id LIMIT ?`
	rows, err := i.readConn(ctx).QueryContext(ctx, sqlQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("search query: %w", err)
	}
	defer rows.Close()
	var hits []domain.Hit
	for rows.Next() {
		var hit domain.Hit
		var snippets [5]string
		if err := rows.Scan(&hit.NoteID, &hit.Title, &hit.Score, &snippets[0], &snippets[1], &snippets[2], &snippets[3], &snippets[4]); err != nil {
			return nil, fmt.Errorf("search scan result: %w", err)
		}
		for n, name := range []string{"title", "content", "checklist", "tags", "space"} {
			if strings.Contains(snippets[n], "<b>") {
				hit.MatchedIn = append(hit.MatchedIn, name)
				if hit.Snippet == "" {
					hit.Snippet = snippets[n]
				}
			}
		}
		hits = append(hits, hit)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("search iterate results: %w", err)
	}
	return hits, nil
}

func (i *Index) Rebuild(ctx context.Context, docs []domain.Document) error {
	dbtx, err := i.writer.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("search begin rebuild: %w", err)
	}
	defer dbtx.Rollback()
	if _, err := dbtx.ExecContext(ctx, `DELETE FROM note_fts`); err != nil {
		return fmt.Errorf("search clear index: %w", err)
	}
	for _, doc := range docs {
		if err := i.upsert(ctx, dbtx, doc); err != nil {
			return err
		}
	}
	if err := dbtx.Commit(); err != nil {
		return fmt.Errorf("search commit rebuild: %w", err)
	}
	return nil
}

func (i *Index) Count(ctx context.Context) (int, error) {
	var count int
	if err := i.readConn(ctx).QueryRowContext(ctx, `SELECT count(*) FROM note_fts`).Scan(&count); err != nil {
		return 0, fmt.Errorf("search count index: %w", err)
	}
	return count, nil
}

var words = regexp.MustCompile(`[\p{L}\p{N}_]+`)

// BuildQuery quotes all user terms, making FTS operators ordinary searchable words.
// An explicitly quoted query remains a phrase; otherwise the final term is a prefix.
func BuildQuery(input string) string {
	input = strings.TrimSpace(input)
	if len(input) >= 2 && input[0] == '"' && input[len(input)-1] == '"' {
		phrase := strings.TrimSpace(input[1 : len(input)-1])
		if phrase == "" {
			return ""
		}
		return `"` + strings.ReplaceAll(phrase, `"`, `""`) + `"`
	}
	terms := words.FindAllString(input, -1)
	for n := range terms {
		terms[n] = `"` + strings.ReplaceAll(terms[n], `"`, `""`) + `"`
	}
	if len(terms) == 0 {
		return ""
	}
	terms[len(terms)-1] += "*"
	return strings.Join(terms, " AND ")
}

var markdownMarkup = regexp.MustCompile(`<[^>]*>|!?\[([^\]]*)\]\([^)]*\)|[*_` + "`" + `~>#]`)

// StripMarkdown removes common Markdown structure while retaining visible link labels and text.
func StripMarkdown(markdown string) string {
	markdown = strings.ReplaceAll(markdown, "\r\n", "\n")
	markdown = markdownMarkup.ReplaceAllString(markdown, "$1")
	markdown = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) && r != '\n' && r != '\t' {
			return -1
		}
		return r
	}, markdown)
	return markdown
}
