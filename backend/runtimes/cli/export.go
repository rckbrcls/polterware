package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"connectrpc.com/connect"

	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

// runExport writes Verdict files and the generated AGENTS.md block into every
// checkout. The core writes the files; this command only reports them.
func runExport(dbPath string, args []string) error {
	fs := flag.NewFlagSet("export", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	projectID := fs.String("project", "", "project id (default: project containing the cwd)")
	dryRun := fs.Bool("dry-run", false, "print what would change without writing")
	asJSON := fs.Bool("json", false, "print JSON")
	if err := fs.Parse(args); err != nil {
		return err
	}
	c, err := dial(dbPath)
	if err != nil {
		return err
	}
	project, err := resolveProject(c, *projectID)
	if err != nil {
		return err
	}
	res, err := c.Work.ExportProjections(context.Background(), connect.NewRequest(&localv1.ExportProjectionsRequest{
		ProjectId: project.Id, DryRun: *dryRun,
	}))
	if err != nil {
		return err
	}
	if *asJSON {
		return writeProtoJSON(res.Msg)
	}
	for _, file := range res.Msg.Files {
		repo := file.Repo
		if repo == "" {
			repo = "(root)"
		}
		line := fmt.Sprintf("%-9s %s  %s", file.Action, repo, file.Path)
		if file.Reason != "" {
			line += "  (" + file.Reason + ")"
		}
		fmt.Println(line)
	}
	if *dryRun {
		fmt.Println("dry run: nothing written")
	}
	return nil
}
