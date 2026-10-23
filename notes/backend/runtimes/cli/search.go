package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"strings"

	"connectrpc.com/connect"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
)

func runSearch(ctx context.Context, dbPath string, args []string, out, stderr io.Writer) error {
	fs := flag.NewFlagSet("search", flag.ContinueOnError)
	fs.SetOutput(stderr)
	jsonOutput := fs.Bool("json", false, "print JSON")
	spaceRef := fs.String("space", "", "Space name or id")
	limit := fs.Int("limit", 0, "max hits")
	pos, err := parseCommand(fs, args)
	if err != nil {
		return mapRPC(err)
	}
	query := strings.TrimSpace(strings.Join(pos, " "))
	if query == "" {
		return usagef("usage: pwnotes search <query> [--json]")
	}
	clients, err := ensureClients(ctx, dbPath)
	if err != nil {
		return err
	}
	req := &v1.SearchNotesRequest{Query: query, Limit: int32(*limit)}
	if *spaceRef != "" {
		id, err := lookupSpaceID(ctx, clients, *spaceRef)
		if err != nil {
			return err
		}
		req.SpaceId = id
	}
	res, err := clients.Search.Search(ctx, connect.NewRequest(req))
	if err != nil {
		return mapRPC(err)
	}
	if *jsonOutput {
		return writeJSON(out, res.Msg)
	}
	if len(res.Msg.Hits) == 0 {
		fmt.Fprintln(out, "0 hits")
		return nil
	}
	for _, h := range res.Msg.Hits {
		fmt.Fprintf(out, "%.4f\t%s\t%s\t%s\n", h.Score, h.NoteId, h.Title, strings.ReplaceAll(h.Snippet, "\n", " "))
	}
	return nil
}
