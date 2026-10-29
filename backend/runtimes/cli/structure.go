package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"connectrpc.com/connect"

	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

func runStructure(dbPath string, args []string) error {
	fs := flag.NewFlagSet("structure", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	projectID := fs.String("project", "", "project id (default: project containing the cwd)")
	node := fs.String("node", "", "node id or path")
	at := fs.String("at", "", "point in time: a change batch id, an RFC3339 time, a YYYY-MM-DD day, or a commit sha")
	if err := fs.Parse(args); err != nil {
		return err
	}
	history := fs.NArg() == 1 && fs.Arg(0) == "history"
	if fs.NArg() > 0 && !history {
		return fmt.Errorf("unknown argument %q: use structure [--node <path>] [--at <point>] or structure history", fs.Arg(0))
	}
	if history && (*node != "" || *at != "") {
		return fmt.Errorf("structure history takes no --node or --at")
	}
	c, err := dial(dbPath)
	if err != nil {
		return err
	}
	project, err := resolveProject(c, *projectID)
	if err != nil {
		return err
	}
	query := "structure"
	switch {
	case history:
		query = "structure history"
	default:
		if *node != "" {
			query += " " + *node
		}
		if *at != "" {
			query += " at " + *at
		}
	}
	res, err := c.Work.QueryPolter(context.Background(), connect.NewRequest(&localv1.QueryPolterRequest{
		ProjectId: project.Id, Query: query,
	}))
	if err != nil {
		return err
	}
	fmt.Print(res.Msg.Text)
	return nil
}
