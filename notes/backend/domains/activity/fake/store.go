// Package fake provides a transactional in-memory store shared by domain fakes.
package fake

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/polterware/polterware/notes/backend/domains/tx"
	"sort"
	"sync"
)

type Store struct {
	mu   sync.Mutex
	rows map[string]map[string][]byte
}

var _ tx.Manager = (*Store)(nil)

type transaction struct {
	mu    sync.Mutex
	store *Store
	rows  map[string]map[string][]byte
}
type key struct{}

func NewStore() *Store { return &Store{rows: make(map[string]map[string][]byte)} }
func (s *Store) access(ctx context.Context, fn func(map[string]map[string][]byte) error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if t, ok := ctx.Value(key{}).(*transaction); ok && t.store == s {
		t.mu.Lock()
		defer t.mu.Unlock()
		return fn(t.rows)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.rows == nil {
		s.rows = make(map[string]map[string][]byte)
	}
	return fn(s.rows)
}
func (s *Store) Within(ctx context.Context, fn func(context.Context) error) error {
	if t, ok := ctx.Value(key{}).(*transaction); ok && t.store == s {
		return fn(ctx)
	}
	return s.access(ctx, func(rows map[string]map[string][]byte) error {
		copy := make(map[string]map[string][]byte)
		for table, values := range rows {
			copy[table] = make(map[string][]byte)
			for id, b := range values {
				copy[table][id] = append([]byte(nil), b...)
			}
		}
		err := fn(context.WithValue(ctx, key{}, &transaction{store: s, rows: copy}))
		if err != nil {
			return err
		}
		if err = ctx.Err(); err != nil {
			return err
		}
		s.rows = copy
		return nil
	})
}
func (s *Store) Put(ctx context.Context, table, id string, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("encode fake row: %w", err)
	}
	return s.access(ctx, func(rows map[string]map[string][]byte) error {
		if rows[table] == nil {
			rows[table] = make(map[string][]byte)
		}
		rows[table][id] = b
		return nil
	})
}
func (s *Store) Remove(ctx context.Context, table, id string) error {
	return s.access(ctx, func(rows map[string]map[string][]byte) error { delete(rows[table], id); return nil })
}
func Read[T any](ctx context.Context, s *Store, table, id string) (v T, ok bool, err error) {
	err = s.access(ctx, func(rows map[string]map[string][]byte) error {
		b, found := rows[table][id]
		ok = found
		if !found {
			return nil
		}
		return json.Unmarshal(b, &v)
	})
	return
}
func All[T any](ctx context.Context, s *Store, table string) (out []T, err error) {
	err = s.access(ctx, func(rows map[string]map[string][]byte) error {
		keys := make([]string, 0, len(rows[table]))
		for id := range rows[table] {
			keys = append(keys, id)
		}
		sort.Strings(keys)
		for _, id := range keys {
			var v T
			if err := json.Unmarshal(rows[table][id], &v); err != nil {
				return err
			}
			out = append(out, v)
		}
		return nil
	})
	return
}
func Map[T any](ctx context.Context, s *Store, table string) (out map[string]T, err error) {
	out = make(map[string]T)
	err = s.access(ctx, func(rows map[string]map[string][]byte) error {
		for id, b := range rows[table] {
			var v T
			if err := json.Unmarshal(b, &v); err != nil {
				return err
			}
			out[id] = v
		}
		return nil
	})
	return
}
