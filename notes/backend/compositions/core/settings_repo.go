package core

import (
	"context"
	"strings"

	"github.com/polterware/polterware/notes/backend/domains/settings"
)

// publicSettings hides store-internal keys from the typed settings document.
type publicSettings struct{ settings.Repository }

func (p publicSettings) List(ctx context.Context) (map[string]string, error) {
	rows, err := p.Repository.List(ctx)
	if err != nil {
		return nil, err
	}
	for key := range rows {
		if strings.HasPrefix(key, "_internal.") {
			delete(rows, key)
		}
	}
	return rows, nil
}
