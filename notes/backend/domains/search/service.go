package search

import "context"

// UseCase coordinates ranked search, index status, and full reindexing.
type UseCase struct {
	index  Index
	source DocumentSource
}

var _ Service = (*UseCase)(nil)

func NewService(index Index, source DocumentSource) *UseCase {
	return &UseCase{index: index, source: source}
}

func (s *UseCase) Search(ctx context.Context, query string, filter Filter) (Result, error) {
	hits, err := s.index.Search(ctx, query, filter)
	if err != nil {
		return Result{}, err
	}
	return Result{Hits: hits}, nil
}

func (s *UseCase) Status(ctx context.Context) (Status, error) {
	count, err := s.index.Count(ctx)
	if err != nil {
		return Status{}, err
	}
	return Status{FTSDocuments: count}, nil
}

func (s *UseCase) Reindex(ctx context.Context) (int, error) {
	docs, err := s.source.ListSearchDocuments(ctx)
	if err != nil {
		return 0, err
	}
	if err := s.index.Rebuild(ctx, docs); err != nil {
		return 0, err
	}
	return len(docs), nil
}
