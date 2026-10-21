package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"

	"connectrpc.com/connect"

	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

const scopeUsage = `usage: polterware scope <decision|fact|evidence|item> <id> [<node path>] [--project <id>]
       (an empty node clears the scope; item is a derived Drift or Inbox item key)`

// scopeFlags are the flags that narrow a read to one Atlas node.
type scopeFlags struct {
	node  *string
	exact *bool
}

// addScopeFlags registers --scope and --exact on flags.
func addScopeFlags(flags *flag.FlagSet) scopeFlags {
	return scopeFlags{
		node:  flags.String("scope", "", "Atlas node path, slug, or id to narrow the read (default: whole project)"),
		exact: flags.Bool("exact", false, "with --scope, leave out the node's ancestors"),
	}
}

// runScope assigns an entity to an Atlas node, or clears its scope.
func runScope(dbPath string, args []string) error {
	flags := flag.NewFlagSet("scope", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	projectID := flags.String("project", "", "project id (default: project containing the cwd)")
	positional, err := parseInterspersed(flags, args)
	if err != nil {
		return err
	}
	if len(positional) < 2 || len(positional) > 3 {
		return errors.New(scopeUsage)
	}
	node := ""
	if len(positional) == 3 {
		node = positional[2]
	}
	c, err := dial(dbPath)
	if err != nil {
		return err
	}
	project, err := resolveProject(c, *projectID)
	if err != nil {
		return err
	}
	if _, err := c.Work.SetScope(context.Background(), connect.NewRequest(&localv1.SetScopeRequest{
		ProjectId: project.Id, Kind: positional[0], Id: positional[1], Node: node,
	})); err != nil {
		return err
	}
	if node == "" {
		fmt.Printf("%s %s: scope cleared (whole project)\n", positional[0], positional[1])
		return nil
	}
	fmt.Printf("%s %s: scope %s\n", positional[0], positional[1], node)
	return nil
}
