package wedge_test

import (
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/agentrun"
	"github.com/polterware/polterware/backend/domains/drift"
	"github.com/polterware/polterware/backend/domains/inbox"
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

// Drift reads the commits from Git: a subject that cites a task links it, and
// the Inbox links the rest or opens a done task again.
func TestCommitDriftLinksAndReopensFromTheInbox(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not installed")
	}
	root := t.TempDir()
	git(t, root, "init", "-q", "-b", "main")
	git(t, root, "commit", "-q", "--allow-empty", "-m", "Add the session table (login T1)")
	git(t, root, "commit", "-q", "--allow-empty", "-m", "Tidy the readme")
	bare := git(t, root, "rev-parse", "HEAD")

	store, err := storepkg.New(filepath.Join(t.TempDir(), "drift.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	project, err := wedge.InitProject(store, wedge.InitInput{Name: "Demo", RootPath: root})
	if err != nil {
		t.Fatal(err)
	}
	card := "---\npolter: 1\nsummary: Add login\nrationale: test\n---\n\n## login: Login\nstage: build\n- [x] T1 Session table\n- [x] T2 Login route\n"
	if _, err := wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, Text: card, AutoStartLabel: "cli"}); err != nil {
		t.Fatal(err)
	}

	listed, err := wedge.ListInbox(store, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	var task, commit inbox.Item
	for _, item := range listed.Items {
		switch item.Detail {
		case drift.TypeTaskDoneUnmatched:
			task = item
		case drift.TypeCommitWithoutTask:
			commit = item
		}
	}
	if task.Where != "login T2" || commit.Details["sha"] != bare || len(listed.Items) != 2 {
		t.Fatalf("items = %+v", listed.Items)
	}
	if strings.Join(task.Actions, ",") != "link,reopen,defer,ignore" || strings.Join(commit.Actions, ",") != "link,defer,ignore" {
		t.Fatalf("actions: task %v commit %v", task.Actions, commit.Actions)
	}

	resolve := func(item inbox.Item, action, answer string) error {
		_, err := wedge.ResolveInbox(store, wedge.ResolveInboxInput{
			ProjectID: project.ID, ItemID: item.ID, Action: action, Answer: answer, Actor: "desktop",
			Apply: wedge.ApplyInput{ActorKind: agentrun.ActorKindHuman, Tool: "desktop.inbox.resolve"},
		})
		return err
	}
	if err := resolve(commit, inbox.ActionReopen, ""); err == nil {
		t.Fatal("a commit cannot be reopened")
	}
	if err := resolve(commit, inbox.ActionLink, "login#T9"); err == nil {
		t.Fatal("an unknown task cannot be linked")
	}
	// Linking the bare commit to T2 clears both items.
	if err := resolve(commit, inbox.ActionLink, "login#T2"); err != nil {
		t.Fatal(err)
	}
	if after, _ := wedge.ListInbox(store, project.ID); len(after.Items) != 0 {
		t.Fatalf("after link = %+v", after.Items)
	}

	// A new done task with no commit opens again from the Inbox.
	more := "---\npolter: 1\nsummary: Add logout\nrationale: test\n---\n\n## login\n- [x] Logout route\n"
	if _, err := wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, Text: more, AutoStartLabel: "cli"}); err != nil {
		t.Fatal(err)
	}
	pending, _ := wedge.ListInbox(store, project.ID)
	if len(pending.Items) != 1 || pending.Items[0].Where != "login T3" {
		t.Fatalf("pending = %+v", pending.Items)
	}
	if err := resolve(pending.Items[0], inbox.ActionLink, "nope"); err == nil {
		t.Fatal("an unknown commit cannot be linked")
	}
	reopened, err := wedge.ResolveInbox(store, wedge.ResolveInboxInput{
		ProjectID: project.ID, ItemID: pending.Items[0].ID, Action: inbox.ActionReopen, Actor: "desktop",
		Apply: wedge.ApplyInput{ActorKind: agentrun.ActorKindHuman, Tool: "desktop.inbox.resolve"},
	})
	if err != nil || reopened.Apply == nil || !reopened.Apply.Applied {
		t.Fatalf("reopen: %v %+v", err, reopened.Apply)
	}
	cardText, err := wedge.QueryPolter(store, project.ID, "card login")
	if err != nil || !strings.Contains(cardText, "- [ ] T3 Logout route") {
		t.Fatalf("reopen: %v\n%s", err, cardText)
	}
	if final, _ := wedge.ListInbox(store, project.ID); len(final.Items) != 0 {
		t.Fatalf("final = %+v", final.Items)
	}
}
