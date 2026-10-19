package attachments

import "context"

type importLimitKey struct{}

// WithImportLimit narrows a caller's copy budget without changing the wire contract.
func WithImportLimit(ctx context.Context, maxBytes int64) context.Context {
	if maxBytes <= 0 || maxBytes > ImportLimit(ctx) {
		maxBytes = ImportLimit(ctx)
	}
	return context.WithValue(ctx, importLimitKey{}, maxBytes)
}
func ImportLimit(ctx context.Context) int64 {
	if limit, ok := ctx.Value(importLimitKey{}).(int64); ok && limit > 0 && limit < HardMaxBytes {
		return limit
	}
	return HardMaxBytes
}
