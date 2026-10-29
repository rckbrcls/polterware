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

// ExportProjections writes Decision files into docs/decision/ of each governing
// checkout and the generated AGENTS.md block of every checkout. The store is
// the source of truth: files are replaced, never read back into SQLite. A
// file under docs/decision/ that Polterware did not write is never overwritten.
func ExportProjections(store *storepkg.Store, projectID string, dryRun bool) ([]ProjectionFile, error) {
	project, err := store.GetProject(projectID)
	if err != nil {
		return nil, fmt.Errorf("unknown project %q", projectID)
	}
	snapshot, err := store.LoadWorkSnapshot(projectID)
	if err != nil {
		return nil, err
	}
	items, err := store.ListKnowledge(projectID, "decision")
	if err != nil {
		return nil, err
	}
	// Every Decision is projected as a file (history stays readable); superseded
	// ones are left out of the AGENTS.md block, which agents follow.
	decisions := make([]projection.Decision, 0, len(items))
	binding := make([]projection.Decision, 0, len(items))
	for _, item := range items {
		record := projection.Decision{ID: item.ID, Title: item.Title, Body: item.Body, Status: decision.Normalize(item.Status)}
		decisions = append(decisions, record)
		if record.Status != decision.StateSuperseded {
			binding = append(binding, record)
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

	governed := projection.Govern(snapshot.Nodes, decisions)
	governedBinding := projection.Govern(snapshot.Nodes, binding)
	var out []ProjectionFile
	for _, co := range checkouts {
		if info, err := os.Stat(co.dir); err != nil || !info.IsDir() {
			out = append(out, ProjectionFile{Repo: co.name, Path: ".", Action: ProjectionSkip, Reason: "checkout directory not found"})
			continue
		}
		files, err := exportDecisions(co, governed[co.name], dryRun)
		if err != nil {
			return out, err
		}
		out = append(out, files...)
		legacy, err := removeLegacyProjections(co, dryRun)
		if err != nil {
			return out, err
		}
		out = append(out, legacy...)
		block := projection.Block(co.name, snapshot.Nodes, governedBinding[co.name], binding)
		file, err := exportAgentsBlock(co, block, dryRun)
		if err != nil {
			return out, err
		}
		out = append(out, file)
	}
	return out, nil
}

func exportDecisions(co checkout, decisions []projection.Decision, dryRun bool) ([]ProjectionFile, error) {
	dir := filepath.Join(co.dir, filepath.FromSlash(projection.DecisionDir))
	// Existing files: ours by Decision id, hand-written ones by number.
	ours := map[string]string{}
	handWritten := map[string]string{}
	entries, err := os.ReadDir(dir)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	for _, entry := range entries {
		number, ok := projection.DecisionFileNumber(entry.Name())
		if entry.IsDir() || !ok {
			continue
		}
		body, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			return nil, err
		}
		if id, ok := projection.DecisionMarker(string(body)); ok {
			ours[id] = entry.Name()
			continue
		}
		handWritten[number] = entry.Name()
	}

	rel := func(name string) string { return projection.DecisionDir + "/" + name }
	var out []ProjectionFile
	exported := map[string]bool{}
	for _, decision := range decisions {
		name, content, ok := projection.DecisionFile(decision)
		if !ok {
			out = append(out, ProjectionFile{Repo: co.name, Path: projection.DecisionDir, Action: ProjectionSkip,
				Reason: fmt.Sprintf("%q has no Decision number in its title", decision.Title)})
			continue
		}
		number, _ := projection.DecisionFileNumber(name)
		if existing, ok := handWritten[number]; ok {
			out = append(out, ProjectionFile{Repo: co.name, Path: rel(existing), Action: ProjectionSkip,
				Reason: "not written by polterware export; left as is"})
			continue
		}
		exported[decision.ID] = true
		if previous, ok := ours[decision.ID]; ok && previous != name {
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

	// A projection whose Decision no longer governs this checkout is removed.
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

// removeLegacyProjections deletes the files export wrote under the legacy
// directory before projections moved to docs/decision/, and the directory when
// nothing else is left in it. Hand-written files there stay.
func removeLegacyProjections(co checkout, dryRun bool) ([]ProjectionFile, error) {
	dir := filepath.Join(co.dir, filepath.FromSlash(projection.LegacyDecisionDir))
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var out []ProjectionFile
	kept := 0
	for _, entry := range entries {
		if entry.IsDir() {
			kept++
			continue
		}
		body, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			return nil, err
		}
		if !projection.LegacyDecisionMarker(string(body)) {
			kept++
			continue
		}
		if !dryRun {
			if err := os.Remove(filepath.Join(dir, entry.Name())); err != nil {
				return out, err
			}
		}
		out = append(out, ProjectionFile{Repo: co.name, Path: projection.LegacyDecisionDir + "/" + entry.Name(), Action: ProjectionRemove, Reason: "moved to " + projection.DecisionDir})
	}
	if kept == 0 && !dryRun {
		if err := os.Remove(dir); err != nil && !errors.Is(err, os.ErrNotExist) {
			return out, err
		}
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
