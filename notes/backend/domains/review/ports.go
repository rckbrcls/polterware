package review

import (
	"context"
	"time"
)

// Reader loads the rows Review aggregates. from is inclusive and to is exclusive.
type Reader interface {
	Completions(ctx context.Context, from, to time.Time) ([]Completion, error)
	FocusSpans(ctx context.Context, from, to time.Time) ([]FocusSpan, error)
}

// Service is the review use-case port.
type Service interface {
	Get(ctx context.Context, from, to time.Time, tz string) (Report, error)
}
