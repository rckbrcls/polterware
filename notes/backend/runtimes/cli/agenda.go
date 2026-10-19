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

func runAgenda(ctx context.Context, dbPath string, args []string, out, stderr io.Writer) error {
	fs := flag.NewFlagSet("agenda", flag.ContinueOnError)
	fs.SetOutput(stderr)
	jsonOutput := fs.Bool("json", false, "print JSON")
	fromRaw := fs.String("from", "", "range start (RFC 3339, YYYY-MM-DD, today, +2h)")
	toRaw := fs.String("to", "", "range end (inclusive for date-only)")
	pos, err := parseCommand(fs, args)
	if err != nil {
		return mapRPC(err)
	}
	if len(pos) != 0 {
		return usagef("unexpected agenda arguments")
	}
	loc := cliLocation()
	now := time.Now()
	from, to := weekRange(now, loc)
	if *fromRaw != "" {
		p, err := parseWhen(*fromRaw, now, loc)
		if err != nil {
			return err
		}
		from = p.At
	}
	if *toRaw != "" {
		end, err := parseRangeEnd(*toRaw, now, loc, true)
		if err != nil {
			return err
		}
		to = end
	}
	if !from.Before(to) {
		return usagef("--from must precede --to")
	}
	return listOccurrences(ctx, dbPath, from, to, *jsonOutput, out)
}

func listOccurrences(ctx context.Context, dbPath string, from, to time.Time, jsonOutput bool, out io.Writer) error {
	clients, err := ensureClients(ctx, dbPath)
	if err != nil {
		return err
	}
	res, err := clients.Schedule.ListOccurrences(ctx, connect.NewRequest(&v1.ListOccurrencesRequest{
		From: timestamppb.New(from.UTC()),
		To:   timestamppb.New(to.UTC()),
	}))
	if err != nil {
		return mapRPC(err)
	}
	if jsonOutput {
		return writeJSON(out, res.Msg)
	}
	if len(res.Msg.Occurrences) == 0 {
		fmt.Fprintln(out, "0 occurrences")
		return nil
	}
	for _, o := range res.Msg.Occurrences {
		state := "open"
		if o.Completed {
			state = "done"
		} else if o.Overdue {
			state = "overdue"
		}
		fmt.Fprintf(out, "%s\t%s\t%s\t%s\n", formatStamp(o.OccurrenceAt), state, o.NoteId, o.Title)
	}
	return nil
}
