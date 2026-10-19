package sqlite

import (
	"context"

	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/fault"
)

func (r Activity) Append(ctx context.Context, e activity.Event) error {
	return r.Within(ctx, func(ctx context.Context) error {
		_, err := r.q(ctx, true).ExecContext(ctx, `
			INSERT INTO activity(id, at, actor, entity, entity_id, op, summary)
			VALUES (?,?,?,?,?,?,?)`,
			e.ID, formatTime(e.At), e.Actor, e.Entity, e.EntityID, e.Op, e.Summary)
		return mapSQL(err, "activity", e.ID)
	})
}

func (r Activity) List(ctx context.Context, cursor, actor string, limit int) (activity.Page, error) {
	limit = clampLimit(limit, 50, 500)
	where := "1=1"
	args := []any{}
	if actor != "" {
		where += " AND actor = ?"
		args = append(args, actor)
	}
	cur, err := decodeCursor(cursor)
	if err != nil {
		return activity.Page{}, fault.Invalid(fault.Violation{Field: "cursor", Reason: err.Error()})
	}
	if cur.ID != "" {
		where += " AND (at < ? OR (at = ? AND id < ?))"
		args = append(args, cur.Key, cur.Key, cur.ID)
	}
	rows, err := r.q(ctx, false).QueryContext(ctx, `
		SELECT id, at, actor, entity, entity_id, op, summary
		FROM activity WHERE `+where+` ORDER BY at DESC, id DESC LIMIT ?`, append(args, limit+1)...)
	if err != nil {
		return activity.Page{}, err
	}
	defer rows.Close()
	events := []activity.Event{}
	for rows.Next() {
		var e activity.Event
		var at string
		if err := rows.Scan(&e.ID, &at, &e.Actor, &e.Entity, &e.EntityID, &e.Op, &e.Summary); err != nil {
			return activity.Page{}, err
		}
		e.At = mustTime(at)
		events = append(events, e)
	}
	if err := rows.Err(); err != nil {
		return activity.Page{}, err
	}
	next := ""
	if len(events) > limit {
		last := events[limit-1]
		next = encodeCursor(listCursor{Key: formatTime(last.At), ID: last.ID})
		events = events[:limit]
	}
	return activity.Page{Events: events, NextCursor: next}, nil
}
