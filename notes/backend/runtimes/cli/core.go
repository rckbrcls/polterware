package main

import (
	"context"
	"github.com/polterware/polterware/notes/backend/platform/coreclient"
)

// attachedCore performs a read-only handshake; status/doctor never silently start a daemon.
func attachedCore(ctx context.Context, dbPath string) (coreclient.Clients, error) {
	state, err := coreclient.Find(ctx, dbPath)
	if err != nil {
		return coreclient.Clients{}, err
	}
	return coreclient.New(state, "cli")
}
