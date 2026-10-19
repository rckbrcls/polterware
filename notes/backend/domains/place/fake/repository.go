package fake

import (
	"context"

	"github.com/polterware/polterware/notes/backend/domains/place"
)

// Repository is a repository-port skeleton. Methods panic until W1 replaces them.
type Repository struct{}

var _ place.Repository = (*Repository)(nil)

func (*Repository) Get(context.Context, string) (place.Place, error) {
	panic("place/fake: not implemented")
}

func (*Repository) Upsert(context.Context, place.Place) error {
	panic("place/fake: not implemented")
}

func (*Repository) Delete(context.Context, string) error {
	panic("place/fake: not implemented")
}

func (*Repository) ListInBounds(context.Context, place.Bounds) ([]place.Place, error) {
	panic("place/fake: not implemented")
}
