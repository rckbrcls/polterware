package sqlite

import (
	"database/sql"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/platform/db"
)

func formatTime(t time.Time) string { return db.FormatTime(t) }

func parseTime(s string) (time.Time, error) { return db.ParseTime(s) }

func nullTime(t *time.Time) any {
	if t == nil {
		return nil
	}
	return formatTime(*t)
}

func scanTime(ns sql.NullString) (*time.Time, error) {
	if !ns.Valid || ns.String == "" {
		return nil, nil
	}
	t, err := parseTime(ns.String)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func mustTime(s string) time.Time {
	t, err := parseTime(s)
	if err != nil {
		return time.Time{}
	}
	return t
}

func nullString(p *string) any {
	if p == nil {
		return nil
	}
	return *p
}

func scanString(ns sql.NullString) *string {
	if !ns.Valid {
		return nil
	}
	s := ns.String
	return &s
}

func nullInt(p *int) any {
	if p == nil {
		return nil
	}
	return *p
}

func scanInt(n sql.NullInt64) *int {
	if !n.Valid {
		return nil
	}
	v := int(n.Int64)
	return &v
}

func nullInt64(p *int64) any {
	if p == nil {
		return nil
	}
	return *p
}

func scanInt64(n sql.NullInt64) *int64 {
	if !n.Valid {
		return nil
	}
	v := n.Int64
	return &v
}

func boolInt(v bool) int {
	if v {
		return 1
	}
	return 0
}

func mapSQL(err error, entity, id string) error {
	if err == nil {
		return nil
	}
	if err == sql.ErrNoRows {
		return fault.NotFound(entity, id)
	}
	msg := err.Error()
	if strings.Contains(msg, "UNIQUE") || strings.Contains(msg, "unique") {
		return fault.Exists(entity, id)
	}
	return err
}

func updateConflict(entity, id string, expectedRev int64, current any) error {
	return fault.Conflict(entity, id, expectedRev, current)
}

type listCursor struct {
	Key string
	ID  string
}

func encodeCursor(c listCursor) string {
	raw := c.Key + "\x1f" + c.ID
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeCursor(s string) (listCursor, error) {
	if s == "" {
		return listCursor{}, nil
	}
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return listCursor{}, fmt.Errorf("cursor: %w", err)
	}
	key, id, ok := strings.Cut(string(b), "\x1f")
	if !ok {
		return listCursor{}, fmt.Errorf("cursor: malformed")
	}
	return listCursor{Key: key, ID: id}, nil
}

func clampLimit(limit, def, max int) int {
	if limit <= 0 {
		return def
	}
	if limit > max {
		return max
	}
	return limit
}
