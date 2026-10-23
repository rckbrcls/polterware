package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"time"

	"connectrpc.com/connect"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func runToday(ctx context.Context, dbPath string, args []string, out, stderr io.Writer) error {
	fs := flag.NewFlagSet("today", flag.ContinueOnError)
	fs.SetOutput(stderr)
	jsonOutput := fs.Bool("json", false, "print JSON")
	pos, err := parseCommand(fs, args)
	if err != nil {
		return mapRPC(err)
	}
	if len(pos) != 0 {
		return usagef("unexpected today arguments")
	}
	loc := cliLocation()
	from, to := dayRange(time.Now(), loc)
	if *jsonOutput {
		return listOccurrences(ctx, dbPath, from, to, true, out)
	}
	if err := listOccurrences(ctx, dbPath, from, to, false, out); err != nil {
		return err
	}
	clients, err := ensureClients(ctx, dbPath)
	if err != nil {
		return err
	}
	sessions, err := clients.Focus.ListSessions(ctx, connect.NewRequest(&v1.ListFocusSessionsRequest{
		From: timestamppb.New(from.UTC()),
		To:   timestamppb.New(to.UTC()),
	}))
	if err != nil {
		return mapRPC(err)
	}
	for _, s := range sessions.Msg.Sessions {
		fmt.Fprintf(out, "focus\t%s\t%s\t%ds\n", s.Phase, dash(s.NoteId), s.ElapsedS)
	}
	return nil
}
