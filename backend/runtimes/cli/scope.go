package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"

	"connectrpc.com/connect"

	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

const scopeUsage = `usage: polterware scope <decision|fact|evidence|item> <id> [<node path>...] [--project <id>]
       (the nodes replace its contexts, separated by spaces or commas; none clears
       them (the whole project); item is a derived Drift or Inbox item key)`

// scopeList accepts repeated --scope flags and comma-separated nodes.
type scopeList []string

func (s *scopeList) String() string { return strings.Join(*s, ",") }

func (s *scopeList) Set(value string) error {
	for _, part := range strings.Split(value, ",") {
		part = strings.TrimSpace(part)
		if part != "" {
			*s = append(*s, part)
		}
	}
	return nil
}

// scopeFlags are the flags that narrow a read to one or more Structure nodes.
type scopeFlags struct {
	raw   *scopeList
	exact *bool
}

// nodes returns the parsed nodes. Empty means the whole project.
func (s scopeFlags) nodes() []string {
	if s.raw == nil || len(*s.raw) == 0 {
		return nil
	}
	return append([]string(nil), (*s.raw)...)
}

// addScopeFlags registers repeatable --scope and --exact on flags.
func addScopeFlags(flags *flag.FlagSet) scopeFlags {
	raw := &scopeList{}
	flags.Var(raw, "scope", "Structure node path, slug, or id; repeat or separate with commas (default: whole project)")
	return scopeFlags{
		raw:   raw,
		exact: flags.Bool("exact", false, "with --scope, leave out each node's ancestors"),
	}
}

// runScope sets an entity's contexts to the given Structure nodes, or clears them.
func runScope(dbPath string, args []string) error {
	flags := flag.NewFlagSet("scope", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	projectID := flags.String("project", "", "project id (default: project containing the cwd)")
	positional, err := parseInterspersed(flags, args)
	if err != nil {
		return err
	}
	if len(positional) < 2 {
		return errors.New(scopeUsage)
	}
	var nodes scopeList
	for _, value := range positional[2:] {
		_ = nodes.Set(value)
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
		ProjectId: project.Id, Kind: positional[0], Id: positional[1], Nodes: nodes,
	})); err != nil {
		return err
	}
	if len(nodes) == 0 {
		fmt.Printf("%s %s: scope cleared (whole project)\n", positional[0], positional[1])
		return nil
	}
	fmt.Printf("%s %s: scope %s\n", positional[0], positional[1], strings.Join(nodes, ", "))
	return nil
}
