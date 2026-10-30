package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/platform/coreclient"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

// runRepo lists the project's repositories. A component links one with a
// `dir:` or `repo:` line; a repository no component uses is removed.
func runRepo(dbPath string, args []string) error {
	if len(args) == 0 || args[0] != "list" {
		return fmt.Errorf("usage: polterware repo list [--project <id>] [--json]\n(a Structure component links a repository with dir: <folder> in polterware apply)")
	}
	fs := flag.NewFlagSet("repo list", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	projectID := fs.String("project", "", "project id (default: project containing the cwd)")
	asJSON := fs.Bool("json", false, "print JSON")
	if err := fs.Parse(args[1:]); err != nil {
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
	res, err := c.Projects.ListProjectRepos(context.Background(), connect.NewRequest(&localv1.ListProjectReposRequest{ProjectId: project.Id}))
	if err != nil {
		return err
	}
	if *asJSON {
		return writeProtoJSON(res.Msg)
	}
	if len(res.Msg.Repos) == 0 {
		fmt.Println("no repositories: link a component to a clone with dir: <folder>")
		return nil
	}
	for _, repo := range res.Msg.Repos {
		fmt.Printf("%s  %s  %s\n", repo.Name, orDash(repo.Remote), orDash(repo.LocalPath))
	}
	return nil
}

func orDash(value string) string {
	if value == "" {
		return "-"
	}
	return value
}

// cwdRepository is the project's clone that holds the working directory, else
// its only clone; empty when there is neither.
func cwdRepository(c coreclient.Clients, projectID string) string {
	res, err := c.Projects.ListProjectRepos(context.Background(), connect.NewRequest(&localv1.ListProjectReposRequest{ProjectId: projectID}))
	if err != nil {
		return ""
	}
	cwd, _ := os.Getwd()
	var clones []string
	best := ""
	for _, repo := range res.Msg.Repos {
		root := expandHome(repo.LocalPath)
		if root == "" {
			continue
		}
		clones = append(clones, root)
		if rel, err := filepath.Rel(root, cwd); err == nil && rel != ".." && !strings.HasPrefix(rel, "../") && len(root) > len(best) {
			best = root
		}
	}
	if best == "" && len(clones) == 1 {
		best = clones[0]
	}
	return best
}
