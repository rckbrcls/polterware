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

func runSpace(ctx context.Context, dbPath string, args []string, out, stderr io.Writer) error {
	if len(args) == 0 {
		return usagef("usage: pwnotes space add|ls|rm")
	}
	switch args[0] {
	case "add":
		return runSpaceAdd(ctx, dbPath, args[1:], out, stderr)
	case "ls":
		return runSpaceLS(ctx, dbPath, args[1:], out, stderr)
	case "rm":
		return runSpaceRm(ctx, dbPath, args[1:], out, stderr)
	default:
		return usagef("usage: pwnotes space add|ls|rm")
	}
}

func runSpaceAdd(ctx context.Context, dbPath string, args []string, out, stderr io.Writer) error {
	fs := flag.NewFlagSet("space add", flag.ContinueOnError)
	fs.SetOutput(stderr)
	parent := fs.String("parent", "", "parent Space name or id")
	pos, err := parseCommand(fs, args)
	if err != nil {
		return mapRPC(err)
	}
	name := strings.TrimSpace(strings.Join(pos, " "))
	if name == "" {
		return usagef("usage: pwnotes space add \"name\" [--parent X]")
	}
	clients, err := ensureClients(ctx, dbPath)
	if err != nil {
		return err
	}
	req := &v1.CreateSpaceRequest{Name: name}
	if *parent != "" {
		id, err := lookupSpaceID(ctx, clients, *parent)
		if err != nil {
			return err
		}
		req.ParentId = id
	}
	created, err := clients.Space.Create(ctx, connect.NewRequest(req))
	if err != nil {
		return mapRPC(err)
	}
	fmt.Fprintf(out, "created\t%s\t%s\n", created.Msg.Space.Id, created.Msg.Space.Name)
	return nil
}

func runSpaceLS(ctx context.Context, dbPath string, args []string, out, stderr io.Writer) error {
	fs := flag.NewFlagSet("space ls", flag.ContinueOnError)
	fs.SetOutput(stderr)
	jsonOutput := fs.Bool("json", false, "print JSON")
	pos, err := parseCommand(fs, args)
	if err != nil {
		return mapRPC(err)
	}
	if len(pos) != 0 {
		return usagef("unexpected space ls arguments")
	}
	clients, err := ensureClients(ctx, dbPath)
	if err != nil {
		return err
	}
	page, err := clients.Space.List(ctx, connect.NewRequest(&v1.ListSpacesRequest{}))
	if err != nil {
		return mapRPC(err)
	}
	if *jsonOutput {
		return writeJSON(out, page.Msg)
	}
	if len(page.Msg.Spaces) == 0 {
		fmt.Fprintln(out, "0 spaces")
		return nil
	}
	for _, m := range page.Msg.Spaces {
		fmt.Fprintf(out, "%s\t%s\t%s\n", m.Id, m.Name, dash(m.ParentId))
	}
	return nil
}

func runSpaceRm(ctx context.Context, dbPath string, args []string, out, stderr io.Writer) error {
	fs := flag.NewFlagSet("space rm", flag.ContinueOnError)
	fs.SetOutput(stderr)
	yes := fs.Bool("yes", false, "confirm deletion")
	pos, err := parseCommand(fs, args)
	if err != nil {
		return mapRPC(err)
	}
	if len(pos) != 1 {
		return usagef("usage: pwnotes space rm <id|name> --yes")
	}
	ref := pos[0]
	if !*yes {
		return refuseYes("delete space " + ref)
	}
	clients, err := ensureClients(ctx, dbPath)
	if err != nil {
		return err
	}
	space, err := getSpace(ctx, clients, ref)
	if err != nil {
		return err
	}
	res, err := clients.Space.Delete(ctx, connect.NewRequest(&v1.DeleteSpaceRequest{Id: space.Id, ExpectedRev: int64ptr(space.Rev)}))
	if err != nil {
		return mapRPC(err)
	}
	fmt.Fprintf(out, "deleted\t%s\t%s\tdeletedSpaces=%d\tmovedNotes=%d\n", space.Id, space.Name, len(res.Msg.DeletedSpaceIds), res.Msg.MovedNoteCount)
	return nil
}
