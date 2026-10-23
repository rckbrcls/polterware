package fake

import (
	"context"

	"github.com/polterware/polterware/notes/backend/domains/search"
)

// Index is a repository-port skeleton. Methods panic until W1 replaces them.
type Index struct{}

var _ search.Index = (*Index)(nil)

func (*Index) Upsert(context.Context, search.Document) error {
	panic("search/fake: not implemented")
}

func (*Index) Delete(context.Context, string) error {
	panic("search/fake: not implemented")
}

func (*Index) Search(context.Context, string, search.Filter) ([]search.Hit, error) {
	panic("search/fake: not implemented")
}

func (*Index) Rebuild(context.Context, []search.Document) error {
	panic("search/fake: not implemented")
}

func (*Index) Count(context.Context) (int, error) {
	panic("search/fake: not implemented")
}
