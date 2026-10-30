package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/compositions/wedge"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

// runInit registers a project. By default the current folder is a local clone
// its first component links; --no-dir starts a project with no repository.
func runInit(dbPath string, args []string) error {
	fs := flag.NewFlagSet("init", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	name := fs.String("name", "", "project name (default: the folder's name)")
	dirFlag := fs.String("dir", "", "local clone the first component links (default: cwd)")
	fs.StringVar(dirFlag, "path", "", "alias of --dir")
	noDir := fs.Bool("no-dir", false, "start with no repository")
	id := fs.String("id", "", "optional project id")
	asJSON := fs.Bool("json", false, "print JSON")
	if err := fs.Parse(args); err != nil {
		return err
	}
	dir := ""
	if !*noDir {
		dir = *dirFlag
		if dir == "" {
			cwd, err := os.Getwd()
			if err != nil {
				return err
			}
			dir = cwd
		}
		// The core resolves paths against its own cwd, so send an absolute folder.
		abs, err := filepath.Abs(wedge.ExpandPath(dir))
		if err != nil {
			return err
		}
		dir = abs
	}
	projectName := *name
	if projectName == "" && dir != "" {
		projectName = filepath.Base(dir)
	}
	c, err := dial(dbPath)
	if err != nil {
		return err
	}
	res, err := c.Projects.InitProject(context.Background(), connect.NewRequest(&localv1.InitProjectRequest{Id: *id, Name: projectName, Dir: dir}))
	if err != nil {
		return err
	}
	project := res.Msg.Project
	if *asJSON {
		return writeJSON(map[string]any{"id": project.Id, "name": project.Name, "dir": dir, "status": project.Status})
	}
	if dir == "" {
		fmt.Printf("Initialized project %s (%s)\n", project.Name, project.Id)
		return nil
	}
	fmt.Printf("Initialized project %s (%s); its first component links %s\n", project.Name, project.Id, dir)
	return nil
}
