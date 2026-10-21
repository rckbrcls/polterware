package wedge_test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/canon"
	"github.com/polterware/polterware/backend/domains/projects"
	"github.com/polterware/polterware/backend/domains/work"
	gitpkg "github.com/polterware/polterware/backend/providers/git"
	"github.com/polterware/polterware/backend/providers/importer"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestScanSkipsGitOutsideWorkTree(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "go.mod"), []byte("module github.com/acme/demo\n\ngo 1.23\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	store, project := openScanProject(t, root)
	defer store.Close()

	scan, err := wedge.ScanProject(store, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(scan.Message, "Git metadata skipped.") {
		t.Fatalf("message: %s", scan.Message)
	}
	evidence, err := store.ListCanonEvidence(project.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range evidence {
		if item.Kind == canon.EvidenceKindCommit {
			t.Fatalf("commit evidence outside a work tree: %+v", item)
		}
	}
}

func TestScanStampsHeadOnObservedFacts(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "go.mod"), []byte("module github.com/acme/demo\n\ngo 1.23\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitScanCmd(t, root, "init", "-b", "main")
	gitScanCmd(t, root, "add", "go.mod")
	gitScanCmd(t, root, "commit", "-m", "first subject")

	store, project := openScanProject(t, root)
	defer store.Close()

	first, err := wedge.ScanProject(store, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if first.FactCount == 0 || !strings.Contains(first.Message, "Git branch main.") {
		t.Fatalf("first scan: %+v", first)
	}
	meta := gitpkg.ReadMetadata(context.Background(), root)
	headID := importer.StableGitHeadEvidenceID(project.ID)
	assertHeadStamp(t, store, project.ID, headID, meta.SHA, "main", "first subject")

	gitScanCmd(t, root, "commit", "--allow-empty", "-m", "second subject")
	second, err := wedge.ScanProject(store, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if second.FactCount != first.FactCount {
		t.Fatalf("fact count changed: %d -> %d", first.FactCount, second.FactCount)
	}
	if second.EvidenceCount != first.EvidenceCount+1 {
		t.Fatalf("expected one new commit row: first=%d second=%d", first.EvidenceCount, second.EvidenceCount)
	}
	next := gitpkg.ReadMetadata(context.Background(), root)
	if next.SHA == meta.SHA {
		t.Fatal("second commit did not move HEAD")
	}
	assertHeadStamp(t, store, project.ID, headID, next.SHA, "main", "second subject")

	old, err := store.GetCanonEvidence(importer.StableGitCommitEvidenceID(project.ID, meta.SHA))
	if err != nil {
		t.Fatal(err)
	}
	if old.Path != meta.SHA || old.Summary != "first subject" || old.Source != "git:commit" {
		t.Fatalf("previous commit was not kept: %+v", old)
	}
}

func TestScanRecordsNamedRepository(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "go.mod"), []byte("module github.com/acme/demo\n\ngo 1.23\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitScanCmd(t, root, "init", "-b", "main")
	gitScanCmd(t, root, "add", "go.mod")
	gitScanCmd(t, root, "commit", "-m", "root subject")

	extra := t.TempDir()
	if err := os.WriteFile(filepath.Join(extra, "README.md"), []byte("# api\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitScanCmd(t, extra, "init", "-b", "feature")
	gitScanCmd(t, extra, "add", "README.md")
	gitScanCmd(t, extra, "commit", "-m", "api subject")

	store, project := openScanProject(t, root)
	defer store.Close()
	if _, err := wedge.AddProjectRepo(store, project.ID, "api", extra); err != nil {
		t.Fatal(err)
	}

	scan, err := wedge.ScanProject(store, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(scan.Message, "Git branch main.") || !strings.Contains(scan.Message, "Git api branch feature.") {
		t.Fatalf("message: %s", scan.Message)
	}
	rootMeta := gitpkg.ReadMetadata(context.Background(), root)
	extraMeta := gitpkg.ReadMetadata(context.Background(), extra)
	rootHead := importer.StableGitHeadEvidenceID(project.ID)
	apiHead := importer.StableGitRepoHeadEvidenceID(project.ID, "api")
	assertHeadStamp(t, store, project.ID, rootHead, rootMeta.SHA, "main", "root subject")

	head, err := store.GetCanonEvidence(apiHead)
	if err != nil {
		t.Fatal(err)
	}
	if head.Source != "git:api:HEAD" || head.Path != extraMeta.SHA || head.Summary != "feature" {
		t.Fatalf("api head: %+v", head)
	}
	commit, err := store.GetCanonEvidence(importer.StableGitRepoCommitEvidenceID(project.ID, "api", extraMeta.SHA))
	if err != nil {
		t.Fatal(err)
	}
	if commit.Source != "git:api:commit" || commit.Summary != "api subject" {
		t.Fatalf("api commit: %+v", commit)
	}
	facts, err := store.ListCanonFacts(project.ID, "")
	if err != nil {
		t.Fatal(err)
	}
	for _, fact := range facts {
		linked, err := store.ListCanonEvidenceForFact(fact.ID)
		if err != nil {
			t.Fatal(err)
		}
		for _, item := range linked {
			if item.ID == apiHead {
				t.Fatalf("root fact %s was stamped with the api checkout", fact.ID)
			}
		}
	}
}

func TestScanLinksCommitToTask(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "go.mod"), []byte("module github.com/acme/demo\n\ngo 1.23\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitScanCmd(t, root, "init", "-b", "main")
	gitScanCmd(t, root, "add", "go.mod")
	gitScanCmd(t, root, "commit", "-m", "polter: git-metadata-import#T2")
	gitScanCmd(t, root, "commit", "--allow-empty", "-m", "stamp revision on observed facts")
	gitScanCmd(t, root, "commit", "--allow-empty", "-m", "zzzz-unrelated-token")

	extra := t.TempDir()
	if err := os.WriteFile(filepath.Join(extra, "README.md"), []byte("# api\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitScanCmd(t, extra, "init", "-b", "main")
	gitScanCmd(t, extra, "add", "README.md")
	gitScanCmd(t, extra, "commit", "-m", "polter: git-metadata-import#T1")

	store, project := openScanProject(t, root)
	defer store.Close()
	if _, err := wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, Text: scanLinkRoadmap, AutoStartLabel: "cli"}); err != nil {
		t.Fatal(err)
	}
	if _, err := wedge.AddProjectRepo(store, project.ID, "api", extra); err != nil {
		t.Fatal(err)
	}
	snapshot, err := store.LoadWorkSnapshot(project.ID)
	if err != nil {
		t.Fatal(err)
	}
	taskID := map[int]string{}
	for _, card := range snapshot.Cards {
		for _, task := range card.Tasks {
			taskID[task.Number] = task.ID
		}
	}
	if taskID[1] == "" || taskID[2] == "" {
		t.Fatalf("tasks: %+v", snapshot.Cards)
	}
	now := time.Now().UTC()
	kept := canon.Evidence{
		ID: "ev-git-kept", ProjectID: project.ID, Kind: canon.EvidenceKindCommit,
		Summary: "old subject", Source: "git:commit", Path: "deadbeef", Actor: "system",
		ObservedAt: now, CreatedAt: now, UpdatedAt: now,
	}
	if err := store.UpsertCanonEvidence(kept); err != nil {
		t.Fatal(err)
	}
	if err := store.ReplaceCommitLinks(project.ID, kept.ID, []work.CommitLink{{
		ProjectID: project.ID, EvidenceID: kept.ID, TaskID: taskID[1], Method: work.LinkExplicit,
	}}, now); err != nil {
		t.Fatal(err)
	}

	if _, err := wedge.ScanProject(store, project.ID); err != nil {
		t.Fatal(err)
	}
	links := commitLinksByEvidence(t, store, project.ID)
	explicit := links[commitEvidenceBySubject(t, store, project.ID, "git:commit", "polter: git-metadata-import#T2")]
	if len(explicit) != 1 || explicit[0].Method != work.LinkExplicit || explicit[0].TaskID != taskID[2] {
		t.Fatalf("explicit: %+v", explicit)
	}
	suggested := links[commitEvidenceBySubject(t, store, project.ID, "git:commit", "stamp revision on observed facts")]
	if len(suggested) != 1 || suggested[0].Method != work.LinkSuggested || suggested[0].TaskID != taskID[2] {
		t.Fatalf("suggested: %+v", suggested)
	}
	if bare := links[commitEvidenceBySubject(t, store, project.ID, "git:commit", "zzzz-unrelated-token")]; len(bare) != 0 {
		t.Fatalf("unrelated commit linked: %+v", bare)
	}
	api := links[commitEvidenceBySubject(t, store, project.ID, "git:api:commit", "polter: git-metadata-import#T1")]
	if len(api) != 1 || api[0].Method != work.LinkExplicit || api[0].TaskID != taskID[1] {
		t.Fatalf("api explicit: %+v", api)
	}
	if keptLinks := links[kept.ID]; len(keptLinks) != 1 || keptLinks[0].TaskID != taskID[1] {
		t.Fatalf("commit outside the window lost its link: %+v", keptLinks)
	}

	if _, err := wedge.ScanProject(store, project.ID); err != nil {
		t.Fatal(err)
	}
	again := commitLinksByEvidence(t, store, project.ID)
	if len(again[explicit[0].EvidenceID]) != 1 || len(again[kept.ID]) != 1 {
		t.Fatalf("rescan duplicated links: %+v", again)
	}
}

const scanLinkRoadmap = `---
polter: 1
summary: Add git import card
rationale: Link commits to tasks
---

## git-metadata-import: Git metadata import
stage: build

Import HEAD, branch and recent commits as evidence.

- [ ] Commit evidence upsert
- [ ] Stamp revision on observed facts
`

func commitEvidenceBySubject(t *testing.T, store *storepkg.Store, projectID, source, subject string) string {
	t.Helper()
	evidence, err := store.ListCanonEvidence(projectID)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range evidence {
		if item.Source == source && item.Summary == subject {
			return item.ID
		}
	}
	t.Fatalf("no %s evidence with subject %q", source, subject)
	return ""
}

func commitLinksByEvidence(t *testing.T, store *storepkg.Store, projectID string) map[string][]work.CommitLink {
	t.Helper()
	links, err := store.ListCommitLinks(projectID)
	if err != nil {
		t.Fatal(err)
	}
	out := map[string][]work.CommitLink{}
	for _, link := range links {
		out[link.EvidenceID] = append(out[link.EvidenceID], link)
	}
	return out
}

func assertHeadStamp(t *testing.T, store *storepkg.Store, projectID, headID, sha, branch, subject string) {
	t.Helper()
	head, err := store.GetCanonEvidence(headID)
	if err != nil {
		t.Fatal(err)
	}
	if head.Kind != canon.EvidenceKindCommit || head.Source != "git:HEAD" || head.Path != sha || head.Summary != branch {
		t.Fatalf("head evidence: %+v", head)
	}
	commit, err := store.GetCanonEvidence(importer.StableGitCommitEvidenceID(projectID, sha))
	if err != nil {
		t.Fatal(err)
	}
	if commit.Kind != canon.EvidenceKindCommit || commit.Source != "git:commit" || commit.Summary != subject || commit.Path != sha {
		t.Fatalf("commit evidence: %+v", commit)
	}
	facts, err := store.ListCanonFacts(projectID, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(facts) == 0 {
		t.Fatal("expected observed facts")
	}
	for _, fact := range facts {
		linked, err := store.ListCanonEvidenceForFact(fact.ID)
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for _, item := range linked {
			if item.ID == headID {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("fact %s is not stamped with HEAD", fact.ID)
		}
	}
}

func openScanProject(t *testing.T, root string) (*storepkg.Store, projects.Project) {
	t.Helper()
	store, err := storepkg.New(filepath.Join(t.TempDir(), "scan.db"))
	if err != nil {
		t.Fatal(err)
	}
	project, err := wedge.InitProject(store, wedge.InitInput{Name: "Demo", RootPath: root})
	if err != nil {
		store.Close()
		t.Fatal(err)
	}
	return store, project
}

func gitScanCmd(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Test",
		"GIT_AUTHOR_EMAIL=test@example.com",
		"GIT_COMMITTER_NAME=Test",
		"GIT_COMMITTER_EMAIL=test@example.com",
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
}
