package main

import (
	"context"
	"errors"
	"os"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/domains/polter"
	"github.com/polterware/polterware/backend/platform/coreclient"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

// dial returns clients for the core that owns dbPath, starting it when needed
// (Decision 0007: only the core opens the store).
func dial(dbPath string) (coreclient.Clients, error) {
	return coreclient.Connect(dbPath, "cli")
}

// resolveProject returns the project with id, or the one containing the cwd.
func resolveProject(c coreclient.Clients, id string) (*localv1.Project, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return nil, err
	}
	return resolveProjectIn(c, id, cwd)
}

func resolveProjectIn(c coreclient.Clients, id, dir string) (*localv1.Project, error) {
	res, err := c.Projects.ResolveProject(context.Background(), connect.NewRequest(&localv1.ResolveProjectRequest{Id: id, Dir: dir}))
	if err != nil {
		return nil, err
	}
	return res.Msg.Project, nil
}

func diagnosticsFrom(items []*localv1.PolterDiagnostic) []polter.Diagnostic {
	out := make([]polter.Diagnostic, 0, len(items))
	for _, d := range items {
		out = append(out, polter.Diagnostic{Line: int(d.Line), Severity: d.Severity, Message: d.Message})
	}
	return out
}

// polterDiagnostics extracts the line-numbered diagnostics the core attaches
// to an invalid ApplyPolter call.
func polterDiagnostics(err error) ([]polter.Diagnostic, bool) {
	var connectErr *connect.Error
	if !errors.As(err, &connectErr) {
		return nil, false
	}
	for _, detail := range connectErr.Details() {
		value, valueErr := detail.Value()
		if valueErr != nil {
			continue
		}
		if res, ok := value.(*localv1.ApplyPolterResponse); ok && len(res.Diagnostics) > 0 {
			return diagnosticsFrom(res.Diagnostics), true
		}
	}
	return nil, false
}
