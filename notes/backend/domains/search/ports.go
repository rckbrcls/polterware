package search

import "context"

// Index maintains note_fts inside the same transaction as the note write.
type Index interface {
	Upsert(ctx context.Context, doc Document) error
	Delete(ctx context.Context, noteID string) error
	Search(ctx context.Context, query string, filter Filter) ([]Hit, error)
	Rebuild(ctx context.Context, docs []Document) error
	Count(ctx context.Context) (int, error)
}

// DocumentSource provides the current searchable projection for a full rebuild.
type DocumentSource interface {
	ListSearchDocuments(ctx context.Context) ([]Document, error)
}

// Service is the search use-case port.
type Service interface {
	Search(ctx context.Context, query string, filter Filter) (Result, error)
	Status(ctx context.Context) (Status, error)
	Reindex(ctx context.Context) (int, error)
}
