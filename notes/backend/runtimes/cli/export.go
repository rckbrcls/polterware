package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"path/filepath"

	"connectrpc.com/connect"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
)

func runExport(ctx context.Context, dbPath string, args []string, out, stderr io.Writer) error {
	fs := flag.NewFlagSet("export", flag.ContinueOnError)
	fs.SetOutput(stderr)
	jsonOutput := fs.Bool("json", false, "print JSON")
	dest := fs.String("out", "", "zip path")
	pos, err := parseCommand(fs, args)
	if err != nil {
		return mapRPC(err)
	}
	if len(pos) != 0 {
		return usagef("unexpected export arguments")
	}
	if *dest == "" {
		return usagef("usage: pwnotes export --out <zip>")
	}
	path, err := filepath.Abs(*dest)
	if err != nil {
		return err
	}
	clients, err := ensureClients(ctx, dbPath)
	if err != nil {
		return err
	}
	res, err := clients.Maintenance.Export(ctx, connect.NewRequest(&v1.ExportRequest{ZipPath: path}))
	if err != nil {
		return mapRPC(err)
	}
	if *jsonOutput {
		return writeJSON(out, res.Msg)
	}
	fmt.Fprintf(out, "exported\t%s\t%d\n", res.Msg.ZipPath, res.Msg.Bytes)
	return nil
}

func runBackup(ctx context.Context, dbPath string, args []string, out, stderr io.Writer) error {
	fs := flag.NewFlagSet("backup", flag.ContinueOnError)
	fs.SetOutput(stderr)
	jsonOutput := fs.Bool("json", false, "print JSON")
	dest := fs.String("out", "", "destination database path")
	pos, err := parseCommand(fs, args)
	if err != nil {
		return mapRPC(err)
	}
	if len(pos) != 0 {
		return usagef("unexpected backup arguments")
	}
	if *dest == "" {
		return usagef("usage: pwnotes backup --out <path>")
	}
	path, err := filepath.Abs(*dest)
	if err != nil {
		return err
	}
	clients, err := ensureClients(ctx, dbPath)
	if err != nil {
		return err
	}
	res, err := clients.Maintenance.Backup(ctx, connect.NewRequest(&v1.BackupRequest{DestPath: path}))
	if err != nil {
		return mapRPC(err)
	}
	if *jsonOutput {
		return writeJSON(out, res.Msg)
	}
	fmt.Fprintf(out, "backup\t%s\t%d\n", res.Msg.Path, res.Msg.Bytes)
	return nil
}
