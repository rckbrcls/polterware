package main

import (
	"context"
	"flag"
	"fmt"
	"io"

	"connectrpc.com/connect"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
)

func runTag(ctx context.Context, dbPath string, args []string, out, stderr io.Writer) error {
	if len(args) == 0 {
		return usagef("usage: pwnotes tag ls [--json]")
	}
	switch args[0] {
	case "ls":
		return runTagLS(ctx, dbPath, args[1:], out, stderr)
	default:
		return usagef("usage: pwnotes tag ls [--json]")
	}
}

func runTagLS(ctx context.Context, dbPath string, args []string, out, stderr io.Writer) error {
	fs := flag.NewFlagSet("tag ls", flag.ContinueOnError)
	fs.SetOutput(stderr)
	jsonOutput := fs.Bool("json", false, "print JSON")
	pos, err := parseCommand(fs, args)
	if err != nil {
		return mapRPC(err)
	}
	if len(pos) != 0 {
		return usagef("unexpected tag ls arguments")
	}
	clients, err := ensureClients(ctx, dbPath)
	if err != nil {
		return err
	}
	page, err := clients.Tag.List(ctx, connect.NewRequest(&v1.ListTagsRequest{}))
	if err != nil {
		return mapRPC(err)
	}
	if *jsonOutput {
		return writeJSON(out, page.Msg)
	}
	if len(page.Msg.Tags) == 0 {
		fmt.Fprintln(out, "0 tags")
		return nil
	}
	for _, t := range page.Msg.Tags {
		fmt.Fprintf(out, "%s\t%s\t%d\n", t.Id, t.Name, t.UsageCount)
	}
	return nil
}
