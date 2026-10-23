package activity

import "context"

// Repository appends and lists the audit log. The table is capped at 50_000 rows by maintenance.
type Repository interface {
	Append(ctx context.Context, e Event) error
	List(ctx context.Context, cursor, actor string, limit int) (Page, error)
}

// Service is the activity use-case port.
type Service interface {
	List(ctx context.Context, cursor, actor string, limit int) (Page, error)
}
