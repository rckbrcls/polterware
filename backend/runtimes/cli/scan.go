package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"connectrpc.com/connect"

	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

func runScan(dbPath string, args []string) error {
	fs := flag.NewFlagSet("scan", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	projectID := fs.String("project", "", "project id")
	asJSON := fs.Bool("json", false, "print JSON")
	if err := fs.Parse(args); err != nil {
		return err
	}
	c, err := dial(dbPath)
	if err != nil {
		return err
	}
	res, err := c.Canon.ScanProject(context.Background(), connect.NewRequest(&localv1.ScanProjectRequest{ProjectId: *projectID}))
	if err != nil {
		return err
	}
	result := res.Msg
	if *asJSON {
		return writeProtoJSON(result)
	}
	fmt.Printf("%s\n", result.Message)
	fmt.Printf("facts=%d evidence=%d skipped=%d\n",
		result.FactCount, result.EvidenceCount, result.SkippedCount)
	return nil
}
