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

func runReview(ctx context.Context, dbPath string, args []string, out, stderr io.Writer) error {
	fs := flag.NewFlagSet("review", flag.ContinueOnError)
	fs.SetOutput(stderr)
	jsonOutput := fs.Bool("json", false, "print JSON")
	fromRaw := fs.String("from", "", "range start")
	toRaw := fs.String("to", "", "range end")
	tz := fs.String("tz", zoneName(cliLocation()), "IANA time zone")
	pos, err := parseCommand(fs, args)
	if err != nil {
		return mapRPC(err)
	}
	if len(pos) != 0 {
		return usagef("unexpected review arguments")
	}
	loc, err := time.LoadLocation(*tz)
	if err != nil {
		return usagef("unknown IANA zone %q", *tz)
	}
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
	clients, err := ensureClients(ctx, dbPath)
	if err != nil {
		return err
	}
	res, err := clients.Review.Get(ctx, connect.NewRequest(&v1.GetReviewRequest{
		From: timestamppb.New(from.UTC()),
		To:   timestamppb.New(to.UTC()),
		Tz:   *tz,
	}))
	if err != nil {
		return mapRPC(err)
	}
	if *jsonOutput {
		return writeJSON(out, res.Msg)
	}
	r := res.Msg
	fmt.Fprintf(out, "streak\t%d\t%s\n", r.Streak, r.StreakMood)
	fmt.Fprintf(out, "completed\t%d\t%s\n", r.CompletedTotal, r.CompletedMood)
	fmt.Fprintf(out, "focusMinutes\t%d\n", r.FocusMinutes)
	fmt.Fprintf(out, "tz\t%s\n", r.Tz)
	return nil
}
