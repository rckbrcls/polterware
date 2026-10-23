package main

import (
	"connectrpc.com/connect"
	"context"
	"flag"
	"fmt"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
	"github.com/polterware/polterware/notes/backend/platform/runstate"
	"google.golang.org/protobuf/encoding/protojson"
	"io"
	"os"
)

func runDoctor(ctx context.Context, dbPath string, args []string, out, stderr io.Writer) error {
	fs := flag.NewFlagSet("doctor", flag.ContinueOnError)
	fs.SetOutput(stderr)
	jsonOutput := fs.Bool("json", false, "print JSON")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 0 {
		return fmt.Errorf("unexpected doctor arguments")
	}
	clients, err := attachedCore(ctx, dbPath)
	if err != nil {
		return err
	}
	health, err := clients.Health.Check(ctx, connect.NewRequest(&v1.CheckRequest{}))
	if err != nil {
		return err
	}
	report, err := clients.Maintenance.Doctor(ctx, connect.NewRequest(&v1.DoctorRequest{}))
	if err != nil {
		return err
	}
	report.Msg.Checks = append(report.Msg.Checks, &v1.DoctorCheck{Name: "core", Ok: true, Detail: "build=" + health.Msg.Build})
	for _, path := range []string{dbPath, dbPath + "-wal"} {
		info, err := os.Stat(path)
		detail := "absent"
		if err == nil {
			detail = fmt.Sprintf("%d bytes", info.Size())
		}
		ok := err == nil || path != dbPath && os.IsNotExist(err)
		report.Msg.Checks = append(report.Msg.Checks, &v1.DoctorCheck{Name: path, Ok: ok, Detail: detail})
		if !ok {
			report.Msg.Ok = false
		}
	}
	_, tokenErr := os.Stat(runstate.TokenPath(dbPath))
	report.Msg.Checks = append(report.Msg.Checks, &v1.DoctorCheck{Name: "mcp-token", Ok: tokenErr == nil, Detail: "token presence (value omitted)"})
	if tokenErr != nil {
		report.Msg.Ok = false
	}
	if *jsonOutput {
		raw, err := protojson.Marshal(report.Msg)
		if err != nil {
			return err
		}
		if err := writeJSONBytes(out, raw); err != nil {
			return err
		}
	} else {
		for _, check := range report.Msg.Checks {
			fmt.Fprintf(out, "%s: ok=%t %s\n", check.Name, check.Ok, check.Detail)
		}
		page, err := clients.Activity.List(ctx, connect.NewRequest(&v1.ListActivityRequest{Limit: 20}))
		if err != nil {
			fmt.Fprintf(out, "Activity: unavailable (%v)\n", err)
		} else {
			for _, e := range page.Msg.Events {
				fmt.Fprintf(out, "Activity: %s %s %s %s\n", e.At.AsTime().Format("2006-01-02T15:04:05.000Z"), e.Actor, e.Op, e.Summary)
			}
		}
	}
	if !report.Msg.Ok {
		return fmt.Errorf("doctor found unavailable or failed checks")
	}
	return nil
}
