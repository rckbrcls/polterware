package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/polterware/polterware/notes/backend/domains/search"
)

// DocumentSource projects a note's indexed text for search.Index.
type DocumentSource struct {
	store *Store
}

func (s *Store) Documents() DocumentSource { return DocumentSource{store: s} }

func (d DocumentSource) Document(ctx context.Context, noteID string) (search.Document, error) {
	return d.store.document(ctx, noteID)
}

// Rebuild replaces the index in the caller's transaction. Collection must use
// that same transaction so a newer note write cannot be overwritten.
func (d DocumentSource) Rebuild(ctx context.Context, docs []search.Document) error {
	return d.store.Within(ctx, func(ctx context.Context) error {
		if d.store.index == nil {
			return fmt.Errorf("search index is not configured")
		}
		if _, err := d.store.q(ctx, true).ExecContext(ctx, `DELETE FROM note_fts`); err != nil {
			return fmt.Errorf("clear search index: %w", err)
		}
		for _, doc := range docs {
			if err := d.store.index.Upsert(ctx, doc); err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *Store) document(ctx context.Context, noteID string) (search.Document, error) {
	q := s.q(ctx, false)
	var title, content string
	var spaceID sql.NullString
	if err := q.QueryRowContext(ctx, `SELECT title, content, space_id FROM notes WHERE id=?`, noteID).
		Scan(&title, &content, &spaceID); err != nil {
		return search.Document{}, mapSQL(err, "note", noteID)
	}
	path := ""
	if spaceID.Valid {
		p, err := s.spacePath(ctx, spaceID.String)
		if err != nil {
			return search.Document{}, err
		}
		path = p
	}
	checklist, err := s.checklistText(ctx, noteID)
	if err != nil {
		return search.Document{}, err
	}
	tags, err := s.tagText(ctx, noteID)
	if err != nil {
		return search.Document{}, err
	}
	return search.Document{
		NoteID:    noteID,
		Title:     title,
		Content:   stripMarkdown(content),
		Checklist: checklist,
		Tags:      tags,
		Space:     path,
	}, nil
}

func (s *Store) spacePath(ctx context.Context, spaceID string) (string, error) {
	rows, err := s.q(ctx, false).QueryContext(ctx, `
		WITH RECURSIVE chain AS (
			SELECT id, parent_id, name, 0 AS depth FROM spaces WHERE id = ?
			UNION ALL
			SELECT m.id, m.parent_id, m.name, c.depth + 1
			FROM spaces m JOIN chain c ON c.parent_id = m.id
		)
		SELECT name FROM chain ORDER BY depth DESC`, spaceID)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return "", err
		}
		names = append(names, name)
	}
	return strings.Join(names, " / "), rows.Err()
}

func (s *Store) checklistText(ctx context.Context, noteID string) (string, error) {
	rows, err := s.q(ctx, false).QueryContext(ctx, `
		SELECT title, detail FROM check_items WHERE note_id=? ORDER BY sort_order, id`, noteID)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	var parts []string
	for rows.Next() {
		var title, detail string
		if err := rows.Scan(&title, &detail); err != nil {
			return "", err
		}
		if detail != "" {
			parts = append(parts, title+"\n"+detail)
		} else {
			parts = append(parts, title)
		}
	}
	return strings.Join(parts, "\n"), rows.Err()
}

func (s *Store) tagText(ctx context.Context, noteID string) (string, error) {
	rows, err := s.q(ctx, false).QueryContext(ctx, `
		SELECT t.name FROM note_tags mt JOIN tags t ON t.id = mt.tag_id
		WHERE mt.note_id=? ORDER BY t.name COLLATE NOCASE`, noteID)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return "", err
		}
		names = append(names, name)
	}
	return strings.Join(names, " "), rows.Err()
}

func (s *Store) syncIndex(ctx context.Context, noteID string, deleted bool) error {
	if s.index == nil {
		return nil
	}
	if deleted {
		return s.index.Delete(ctx, noteID)
	}
	doc, err := s.document(ctx, noteID)
	if err != nil {
		return err
	}
	return s.index.Upsert(ctx, doc)
}

func stripMarkdown(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	var b strings.Builder
	inFence := false
	for _, line := range strings.Split(s, "\n") {
		trim := strings.TrimSpace(line)
		if strings.HasPrefix(trim, "```") {
			inFence = !inFence
			continue
		}
		if inFence {
			b.WriteString(trim)
			b.WriteByte('\n')
			continue
		}
		line = strings.TrimLeft(line, "#>* \t")
		line = strings.ReplaceAll(line, "**", "")
		line = strings.ReplaceAll(line, "__", "")
		line = strings.ReplaceAll(line, "*", "")
		line = strings.ReplaceAll(line, "_", "")
		line = strings.ReplaceAll(line, "`", "")
		b.WriteString(line)
		b.WriteByte('\n')
	}
	return strings.TrimSpace(b.String())
}

func (s *Store) reindexSpaceNotes(ctx context.Context, spaceID string) error {
	if s.index == nil {
		return nil
	}
	ids, err := s.spaceNoteIDs(ctx, spaceID)
	if err != nil {
		return err
	}
	for _, id := range ids {
		if err := s.syncIndex(ctx, id, false); err != nil {
			return fmt.Errorf("reindex %s: %w", id, err)
		}
	}
	return nil
}

func (s *Store) spaceNoteIDs(ctx context.Context, spaceID string) ([]string, error) {
	rows, err := s.q(ctx, false).QueryContext(ctx, `
		WITH RECURSIVE tree AS (
			SELECT id FROM spaces WHERE id = ?
			UNION ALL
			SELECT m.id FROM spaces m JOIN tree t ON m.parent_id = t.id
		)
		SELECT id FROM notes WHERE space_id IN (SELECT id FROM tree)`, spaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
