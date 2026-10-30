package wedge_test

import (
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/compositions/wedge"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func git(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"}, args...)...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

// A card shows the commits whose subject cites one of its tasks and the ones
// linked to a task, each with its GitHub URL when origin is on GitHub. The
// Inbox stays empty: commits are optional.
func TestCardCommitsCitedAndLinked(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not installed")
	}
	root := t.TempDir()
	git(t, root, "init", "-q", "-b", "main")
	git(t, root, "remote", "add", "origin", "git@github.com:acme/demo.git")
	git(t, root, "commit", "-q", "--allow-empty", "-m", "Add the session table (login#T1)")
	cited := git(t, root, "rev-parse", "HEAD")
	git(t, root, "commit", "-q", "--allow-empty", "-m", "Tidy the readme")
	bare := git(t, root, "rev-parse", "HEAD")

	store, err := storepkg.New(filepath.Join(t.TempDir(), "commits.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	project, err := initWithRepo(store, "Demo", root)
	if err != nil {
		t.Fatal(err)
	}
	card := "---\npolter: 1\nsummary: Add login\nrationale: test\n---\n\n## login: Login\nstage: build\n- [x] T1 Session table\n- [x] T2 Login route\n"
	if _, err := wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, Text: card, AutoStartLabel: "cli"}); err != nil {
		t.Fatal(err)
	}

	commits, err := wedge.CardCommits(store, project.ID, "login")
	if err != nil || len(commits) != 1 {
		t.Fatalf("cited: %v %+v", err, commits)
	}
	if got := commits[0]; got.TaskNumber != 1 || got.SHA != cited || !got.Cited || got.URL != "https://github.com/acme/demo/commit/"+cited {
		t.Fatalf("cited commit = %+v", got)
	}

	if _, err := wedge.LinkTaskCommit(store, project.ID, "login#T9", bare[:7]); err == nil {
		t.Fatal("an unknown task cannot take a commit")
	}
	if _, err := wedge.LinkTaskCommit(store, project.ID, "login#T2", "nope"); err == nil {
		t.Fatal("an unknown commit cannot be linked")
	}
	linked, err := wedge.LinkTaskCommit(store, project.ID, "login#T2", bare[:7])
	if err != nil || linked.SHA != bare || linked.Subject != "Tidy the readme" || linked.ShortSHA() != bare[:7] {
		t.Fatalf("link: %v %+v", err, linked)
	}
	commits, _ = wedge.CardCommits(store, project.ID, "login")
	if len(commits) != 2 {
		t.Fatalf("after link = %+v", commits)
	}
	text, err := wedge.QueryPolter(store, project.ID, "commits login")
	if err != nil || !strings.Contains(text, "T2 "+bare[:7]+" Tidy the readme https://github.com/acme/demo/commit/"+bare) {
		t.Fatalf("query: %v\n%s", err, text)
	}

	if inbox, _ := wedge.ListInbox(store, project.ID); len(inbox.Items) != 0 {
		t.Fatalf("commits raise no Inbox items: %+v", inbox.Items)
	}

	if err := wedge.UnlinkTaskCommit(store, project.ID, "login#T1", cited); err == nil {
		t.Fatal("a cited commit has no stored link to remove")
	}
	if err := wedge.UnlinkTaskCommit(store, project.ID, "login#T2", bare); err != nil {
		t.Fatal(err)
	}
	if commits, _ = wedge.CardCommits(store, project.ID, "login"); len(commits) != 1 {
		t.Fatalf("after unlink = %+v", commits)
	}
}
