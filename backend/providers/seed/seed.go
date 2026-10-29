// Package seed gives an empty database the Polterware project itself, so
// Polterware is managed with its own build, plus one empty project that shows
// every empty state.
package seed

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/polter"
	"github.com/polterware/polterware/backend/domains/projects"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

const (
	ProjectID   = "proj-polterware"
	ProjectName = "Polterware"

	// EmptyProjectID is a project with no content, to show every empty state.
	EmptyProjectID = "proj-empty"

	seedLabel = "seed"
)

// checkouts are the sibling repositories of the Polterware project, by the
// name they get in project_repos.
var checkouts = []struct{ name, dir string }{
	{"web", "polterware-web"},
	{"cloud", "polterware-cloud"},
}

// Defaults seeds an empty database. The Polterware project is added only when
// the app can find its own checkout (from the working directory or the
// binary's location); otherwise only the empty project is created.
func Defaults(store *storepkg.Store) error {
	var count int
	if err := store.DB.QueryRow(`SELECT COUNT(*) FROM projects`).Scan(&count); err != nil {
		return err
	}
	if count != 0 {
		return nil
	}
	if root := DetectRoot(); root != "" {
		if err := Polterware(store, root); err != nil {
			return err
		}
	}
	return seedEmptyProject(store)
}

// Polterware registers the project at root, its sibling checkouts, and the
// real Polterware content: Verdicts, Structure nodes and uses edges, Work cards, docs, facts, and the
// evidence a scan finds in the checkout.
func Polterware(store *storepkg.Store, root string) error {
	if _, err := wedge.InitProject(store, wedge.InitInput{ID: ProjectID, Name: ProjectName, RootPath: root}); err != nil {
		return err
	}
	if err := seedSettings(store); err != nil {
		return err
	}
	registered := map[string]bool{}
	for _, checkout := range checkouts {
		dir := filepath.Join(filepath.Dir(root), checkout.dir)
		if _, err := os.Stat(filepath.Join(dir, ".git")); err != nil {
			continue
		}
		if _, err := wedge.AddProjectRepo(store, ProjectID, checkout.name, dir); err != nil {
			return err
		}
		registered[checkout.name] = true
	}
	for _, text := range []string{verdictsPolter, verdictStatusPolter, structureText(registered["web"], registered["cloud"])} {
		if err := apply(store, text); err != nil {
			return err
		}
	}
	if err := seedKnowledge(store); err != nil {
		return err
	}
	if _, err := store.SyncProjectModel(ProjectID); err != nil {
		return err
	}
	if err := seedFacts(store); err != nil {
		return err
	}
	_, err := wedge.ScanProject(store, ProjectID)
	return err
}

// apply writes one Polter text and reports the first error diagnostic, which
// only happens when the seed text and the Polter grammar drift apart.
func apply(store *storepkg.Store, text string) error {
	result, err := wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: ProjectID, Text: text, AutoStartLabel: seedLabel, Agent: seedLabel})
	for _, diag := range result.Diagnostics {
		if diag.Severity == polter.SeverityError {
			return fmt.Errorf("seed text line %d: %s: %w", diag.Line, diag.Message, err)
		}
	}
	return err
}

// DetectRoot finds the Polterware checkout the app runs from, or "".
func DetectRoot() string {
	var starts []string
	if cwd, err := os.Getwd(); err == nil {
		starts = append(starts, cwd)
	}
	if exe, err := os.Executable(); err == nil {
		starts = append(starts, filepath.Dir(exe))
	}
	for _, start := range starts {
		if root := findRoot(start); root != "" {
			return root
		}
	}
	return ""
}

// findRoot walks up from dir to the directory that holds the Polterware Go
// module (backend/go.mod) and is a Git work tree.
func findRoot(dir string) string {
	for {
		mod, err := os.ReadFile(filepath.Join(dir, "backend", "go.mod"))
		if err == nil && bytes.HasPrefix(bytes.TrimSpace(mod), []byte("module github.com/polterware/polterware/backend")) {
			if root := gitTopLevel(dir); root == dir {
				return dir
			}
			return ""
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

func gitTopLevel(dir string) string {
	out, err := exec.Command("git", "-C", dir, "rev-parse", "--show-toplevel").Output()
	if err != nil {
		return ""
	}
	top, err := filepath.EvalSymlinks(strings.TrimSpace(string(out)))
	if err != nil {
		return ""
	}
	resolved, err := filepath.EvalSymlinks(dir)
	if err != nil || resolved != top {
		return ""
	}
	return dir
}

// seedEmptyProject creates a project the way a user-registered one starts:
// empty layout, default settings, and one local environment.
func seedEmptyProject(store *storepkg.Store) error {
	_, err := wedge.InitProject(store, wedge.InitInput{ID: EmptyProjectID, Name: "Empty project", RootPath: "~/projects/empty"})
	return err
}

func seedSettings(store *storepkg.Store) error {
	envs, err := store.ListEnvironments(ProjectID)
	if err != nil {
		return err
	}
	settings := projects.Settings{
		ProjectID:   ProjectID,
		Description: "Project Context and Change Intelligence for AI Coding",
		Repository:  "polterware/polterware",
	}
	if len(envs) > 0 {
		settings.DefaultEnvironmentID = envs[0].ID
	}
	return store.SaveProjectSettings(settings)
}
