package wedge

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/polterware/polterware/backend/domains/decision"
	"github.com/polterware/polterware/backend/domains/projection"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// Projection file actions.
const (
	ProjectionWrite     = "write"
	ProjectionUnchanged = "unchanged"
	ProjectionRemove    = "remove"
	ProjectionSkip      = "skip"
)

// ProjectionFile is one file export wrote, kept, removed, or skipped. Path is
// relative to the checkout; Repo is empty for the project root.
type ProjectionFile struct {
	Repo   string
	Path   string
	Action string
	Reason string
}

type checkout struct {
	name string
	dir  string
}

// ExportProjections writes Verdict files into docs/verdict/ of each governing
// checkout and the generated AGENTS.md block of every checkout. The store is
// the source of truth: files are replaced, never read back into SQLite. A
// file under docs/verdict/ that Polterware did not write is never overwritten.
func ExportProjections(store *storepkg.Store, projectID string, dryRun bool) ([]ProjectionFile, error) {
	project, err := store.GetProject(projectID)
	if err != nil {
		return nil, fmt.Errorf("unknown project %q", projectID)
	}
	snapshot, err := store.LoadWorkSnapshot(projectID)
	if err != nil {
		return nil, err
	}
	items, err := store.ListKnowledge(projectID, "verdict")
	if err != nil {
		return nil, err
	}
	// Every Verdict is projected as a file (history stays readable); superseded
	// ones are left out of the AGENTS.md block, which agents follow.
	verdicts := make([]projection.Verdict, 0, len(items))
	binding := make([]projection.Verdict, 0, len(items))
	for _, item := range items {
		verdict := projection.Verdict{ID: item.ID, Title: item.Title, Body: item.Body, Status: decision.Normalize(item.Status)}
		verdicts = append(verdicts, verdict)
		if verdict.Status != decision.StateSuperseded {
			binding = append(binding, verdict)
		}
	}
	repos, err := store.ListProjectRepos(projectID)
	if err != nil {
		return nil, err
	}
	checkouts := []checkout{{name: "", dir: ExpandRootPath(project.RootPath)}}
	for _, repo := range repos {
		checkouts = append(checkouts, checkout{name: repo.Name, dir: ExpandRootPath(repo.Path)})
	}

	governed := projection.Govern(snapshot.Nodes, verdicts)
	governedBinding := projection.Govern(snapshot.Nodes, binding)
	var out []ProjectionFile
	for _, co := range checkouts {
		if info, err := os.Stat(co.dir); err != nil || !info.IsDir() {
			out = append(out, ProjectionFile{Repo: co.name, Path: ".", Action: ProjectionSkip, Reason: "checkout directory not found"})
			continue
		}
		files, err := exportVerdicts(co, governed[co.name], dryRun)
		if err != nil {
			return out, err
		}
		out = append(out, files...)
		block := projection.Block(co.name, snapshot.Nodes, governedBinding[co.name], binding)
		file, err := exportAgentsBlock(co, block, dryRun)
		if err != nil {
			return out, err
		}
		out = append(out, file)
	}
	return out, nil
}

func exportVerdicts(co checkout, verdicts []projection.Verdict, dryRun bool) ([]ProjectionFile, error) {
	dir := filepath.Join(co.dir, filepath.FromSlash(projection.VerdictDir))
	// Existing files: ours by Verdict id, hand-written ones by number.
	ours := map[string]string{}
	handWritten := map[string]string{}
	entries, err := os.ReadDir(dir)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	for _, entry := range entries {
		number, ok := projection.VerdictFileNumber(entry.Name())
		if entry.IsDir() || !ok {
			continue
		}
		body, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			return nil, err
		}
		if id, ok := projection.VerdictMarker(string(body)); ok {
			ours[id] = entry.Name()
			continue
		}
		handWritten[number] = entry.Name()
	}

	rel := func(name string) string { return projection.VerdictDir + "/" + name }
	var out []ProjectionFile
	exported := map[string]bool{}
	for _, verdict := range verdicts {
		name, content, ok := projection.VerdictFile(verdict)
		if !ok {
			out = append(out, ProjectionFile{Repo: co.name, Path: projection.VerdictDir, Action: ProjectionSkip,
				Reason: fmt.Sprintf("%q has no Verdict number in its title", verdict.Title)})
			continue
		}
		number, _ := projection.VerdictFileNumber(name)
		if existing, ok := handWritten[number]; ok {
			out = append(out, ProjectionFile{Repo: co.name, Path: rel(existing), Action: ProjectionSkip,
				Reason: "not written by polterware export; left as is"})
			continue
		}
		exported[verdict.ID] = true
		if previous, ok := ours[verdict.ID]; ok && previous != name {
			if !dryRun {
				if err := os.Remove(filepath.Join(dir, previous)); err != nil {
					return out, err
				}
			}
			out = append(out, ProjectionFile{Repo: co.name, Path: rel(previous), Action: ProjectionRemove, Reason: "renamed to " + name})
		}
		file, err := writeProjection(co.name, filepath.Join(dir, name), rel(name), content, dryRun)
		if err != nil {
			return out, err
		}
		out = append(out, file)
	}

	// A projection whose Verdict no longer governs this checkout is removed.
	stale := make([]string, 0, len(ours))
	for id := range ours {
		if !exported[id] {
			stale = append(stale, id)
		}
	}
	sort.Strings(stale)
	for _, id := range stale {
		if !dryRun {
			if err := os.Remove(filepath.Join(dir, ours[id])); err != nil {
				return out, err
			}
		}
		out = append(out, ProjectionFile{Repo: co.name, Path: rel(ours[id]), Action: ProjectionRemove, Reason: "no longer governs this checkout"})
	}
	return out, nil
}

func exportAgentsBlock(co checkout, block string, dryRun bool) (ProjectionFile, error) {
	target := filepath.Join(co.dir, projection.AgentsFile)
	existing, err := os.ReadFile(target)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return ProjectionFile{}, err
	}
	content, err := projection.ReplaceBlock(string(existing), block)
	if err != nil {
		return ProjectionFile{Repo: co.name, Path: projection.AgentsFile, Action: ProjectionSkip, Reason: err.Error()}, nil
	}
	return writeProjection(co.name, target, projection.AgentsFile, content, dryRun)
}

func writeProjection(repo, target, rel, content string, dryRun bool) (ProjectionFile, error) {
	file := ProjectionFile{Repo: repo, Path: rel, Action: ProjectionWrite}
	if current, err := os.ReadFile(target); err == nil && string(current) == content {
		file.Action = ProjectionUnchanged
		return file, nil
	}
	if dryRun {
		return file, nil
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return file, err
	}
	if err := os.WriteFile(target, []byte(content), 0o644); err != nil {
		return file, err
	}
	return file, nil
}
