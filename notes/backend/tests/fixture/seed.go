// Package fixture seeds synthetic performance data through domain use cases.
package fixture

import (
	"context"
	"fmt"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/note"
)

func Seed(ctx context.Context, service note.Service, count int) error {
	for i := 0; i < count; i++ {
		_, err := service.Create(ctx, actor.UI(), note.Create{Title: fmt.Sprintf("Performance note %05d", i), Content: fmt.Sprintf("Benchmark group %d", i%100)})
		if err != nil {
			return fmt.Errorf("seed note %d: %w", i, err)
		}
	}
	return nil
}
