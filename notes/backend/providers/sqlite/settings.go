package sqlite

import (
	"context"
	"database/sql"
)

func (r Settings) Get(ctx context.Context, key string) (string, bool, error) {
	var value string
	err := r.q(ctx, false).QueryRowContext(ctx, `SELECT value_json FROM settings WHERE key=?`, key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return value, true, nil
}

func (r Settings) Set(ctx context.Context, key, valueJSON string) error {
	return r.Within(ctx, func(ctx context.Context) error {
		_, err := r.q(ctx, true).ExecContext(ctx, `
			INSERT INTO settings(key, value_json) VALUES (?,?)
			ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json`, key, valueJSON)
		return err
	})
}

func (r Settings) List(ctx context.Context) (map[string]string, error) {
	rows, err := r.q(ctx, false).QueryContext(ctx, `SELECT key, value_json FROM settings ORDER BY key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		out[k] = v
	}
	return out, rows.Err()
}
