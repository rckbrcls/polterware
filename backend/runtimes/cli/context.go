package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"

	"connectrpc.com/connect"

	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

func runOracle(dbPath string, args []string) error {
	fs := flag.NewFlagSet("oracle", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	projectID := fs.String("project", "", "project id (default: project containing the cwd)")
	zoom := fs.String("zoom", "task", "task, component, domain, or system")
	budget := fs.Int("budget", 1200, "token budget")
	scope := addScopeFlags(fs)
	if err := fs.Parse(args); err != nil {
		return err
	}
	question := strings.TrimSpace(strings.Join(fs.Args(), " "))
	if question == "" {
		return fmt.Errorf("usage: polterware oracle \"<question>\" [--zoom task|component|domain|system] [--budget N]")
	}
	c, err := dial(dbPath)
	if err != nil {
		return err
	}
	project, err := resolveProject(c, *projectID)
	if err != nil {
		return err
	}
	query := fmt.Sprintf("oracle %s zoom:%s budget:%d", question, *zoom, *budget)
	res, err := c.Work.QueryPolter(context.Background(), connect.NewRequest(&localv1.QueryPolterRequest{
		ProjectId: project.Id, Query: query, ScopeNode: *scope.node, ScopeExact: *scope.exact,
	}))
	if err != nil {
		return err
	}
	fmt.Print(res.Msg.Text)
	return nil
}

// runContext is polterware oracle. The Canon context.get compiler stays on its RPC.
func runContext(dbPath string, args []string) error {
	return runOracle(dbPath, args)
}
