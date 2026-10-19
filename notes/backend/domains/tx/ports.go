// Package tx runs domain work in one transaction.
package tx

import "context"

// Manager runs fn atomically. Nested Within joins the transaction already in ctx.
// Repository methods persist through the transaction stored in ctx.
type Manager interface {
	Within(ctx context.Context, fn func(ctx context.Context) error) error
}
