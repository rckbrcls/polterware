package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"connectrpc.com/connect"

	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

// runBrief prints the brief of a card, a Structure node, or a file. A file
// that exists on disk is sent as an absolute path, so the core can find the
// checkout that holds it.
func runBrief(dbPath string, args []string) error {
	return runBudgetQuery(dbPath, "brief", args, func(words []string) string {
		target := strings.Join(words, " ")
		if strings.ContainsAny(target, "/.") {
			if _, err := os.Stat(target); err == nil {
				if abs, err := filepath.Abs(target); err == nil {
					return abs
				}
			}
		}
		return target
	})
}

// runSearch prints one line per node, card, decision, doc, or fact that
// holds every term. polterware context is the same command.
func runSearch(dbPath string, args []string) error {
	return runBudgetQuery(dbPath, "search", args, func(words []string) string { return strings.Join(words, " ") })
}

func runBudgetQuery(dbPath, kind string, args []string, target func([]string) string) error {
	fs := flag.NewFlagSet(kind, flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	projectID := fs.String("project", "", "project id (default: project containing the cwd)")
	budget := fs.Int("budget", 0, "token budget (default 1200)")
	scope := addScopeFlags(fs)
	if err := fs.Parse(args); err != nil {
		return err
	}
	if len(fs.Args()) == 0 {
		if kind == "search" {
			return fmt.Errorf(`usage: polterware search "<terms>" [--budget N] [--scope <node>] [--project <id>]`)
		}
		return fmt.Errorf("usage: polterware brief <card slug|Structure path|file> [--budget N] [--project <id>]")
	}
	c, err := dial(dbPath)
	if err != nil {
		return err
	}
	project, err := resolveProject(c, *projectID)
	if err != nil {
		return err
	}
	query := kind + " " + target(fs.Args())
	if *budget > 0 {
		query += fmt.Sprintf(" budget:%d", *budget)
	}
	res, err := c.Work.QueryPolter(context.Background(), connect.NewRequest(&localv1.QueryPolterRequest{
		ProjectId: project.Id, Query: query, ScopeNodes: scope.nodes(), ScopeExact: *scope.exact,
	}))
	if err != nil {
		return err
	}
	fmt.Print(res.Msg.Text)
	return nil
}
