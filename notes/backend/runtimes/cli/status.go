package main

import (
	"connectrpc.com/connect"
	"context"
	"flag"
	"fmt"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
	"google.golang.org/protobuf/encoding/protojson"
	"io"
)

func runStatus(ctx context.Context, dbPath string, args []string, out, stderr io.Writer) error {
	fs := flag.NewFlagSet("status", flag.ContinueOnError)
	fs.SetOutput(stderr)
	jsonOutput := fs.Bool("json", false, "print JSON")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 0 {
		return fmt.Errorf("unexpected status arguments")
	}
	clients, err := attachedCore(ctx, dbPath)
	if err != nil {
		return err
	}
	health, err := clients.Health.Check(ctx, connect.NewRequest(&v1.CheckRequest{}))
	if err != nil {
		return err
	}
	if *jsonOutput {
		raw, err := protojson.Marshal(health.Msg)
		if err != nil {
			return err
		}
		return writeJSONBytes(out, raw)
	}
	fmt.Fprintf(out, "Core: running\nBuild: %s\nVersion: %s\nDatabase: %s\nMCP: enabled=%t port=%d\n", health.Msg.Build, health.Msg.Version, health.Msg.DbPath, health.Msg.GetMcp().GetEnabled(), health.Msg.GetMcp().GetPort())
	status, err := clients.Reminder.Status(ctx, connect.NewRequest(&v1.ReminderStatusRequest{}))
	if err != nil {
		fmt.Fprintf(out, "Reminders: unavailable (%v)\n", err)
		return nil
	}
	fmt.Fprintf(out, "Reminders: planned=%d armed=%d permission=%s\n", status.Msg.Planned, status.Msg.Armed, status.Msg.Permission)
	return nil
}
