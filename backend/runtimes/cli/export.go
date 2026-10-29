package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"connectrpc.com/connect"

	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

// runExport writes Decision files and the generated AGENTS.md block into every
// checkout. The core writes the files; this command only reports them. With
// --sync on|off it instead switches keeping the AGENTS.md blocks current.
func runExport(dbPath string, args []string) error {
	fs := flag.NewFlagSet("export", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	projectID := fs.String("project", "", "project id (default: project containing the cwd)")
	dryRun := fs.Bool("dry-run", false, "print what would change without writing")
	asJSON := fs.Bool("json", false, "print JSON")
	sync := fs.String("sync", "", "on or off: rewrite the AGENTS.md blocks after every change")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *sync != "" && *sync != "on" && *sync != "off" {
		return fmt.Errorf("--sync takes on or off, not %q", *sync)
	}
	c, err := dial(dbPath)
	if err != nil {
		return err
	}
	project, err := resolveProject(c, *projectID)
	if err != nil {
		return err
	}
	if *sync != "" {
		res, err := c.Work.SetAgentsSync(context.Background(), connect.NewRequest(&localv1.SetAgentsSyncRequest{
			ProjectId: project.Id, Enabled: *sync == "on",
		}))
		if err != nil {
			return err
		}
		if *asJSON {
			return writeProtoJSON(res.Msg)
		}
		fmt.Printf("AGENTS.md sync %s for %s\n", *sync, project.Name)
		printProjectionFiles(res.Msg.Files)
		return nil
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
	printProjectionFiles(res.Msg.Files)
	if *dryRun {
		fmt.Println("dry run: nothing written")
	}
	return nil
}

func printProjectionFiles(files []*localv1.ProjectionFile) {
	for _, file := range files {
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
}
