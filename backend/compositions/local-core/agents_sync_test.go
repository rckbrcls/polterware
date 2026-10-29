package localcore

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/compositions/wedge"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestAgentsSyncRewritesTheBlockAfterChanges(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "agents-sync.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	root := t.TempDir()
	project, err := wedge.InitProject(store, wedge.InitInput{Name: "Shop", RootPath: root})
	if err != nil {
		t.Fatal(err)
	}
	core := NewCore(store, "token")
	agents := filepath.Join(root, "AGENTS.md")
	read := func() string {
		body, _ := os.ReadFile(agents)
		return string(body)
	}
	apply := func(text string) {
		t.Helper()
		result, err := wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, AutoStartLabel: "cli",
			Text: "---\npolter: 1\nsummary: Map the shop\nrationale: Agents read the block\n---\n\n" + text})
		if err != nil {
			t.Fatalf("%v %+v", err, result.Diagnostics)
		}
	}
	waitFor := func(want string) {
		t.Helper()
		for deadline := time.Now().Add(5 * time.Second); time.Now().Before(deadline); time.Sleep(20 * time.Millisecond) {
			if strings.Contains(read(), want) {
				return
			}
		}
		t.Fatalf("AGENTS.md never got %q:\n%s", want, read())
	}

	stop := make(chan struct{})
	defer close(stop)
	var errOut bytes.Buffer
	go core.RunAgentsSync(stop, 10*time.Millisecond, &errOut)
	for deadline := time.Now().Add(time.Second); core.Bus.Subscribers() == 0 && time.Now().Before(deadline); {
		time.Sleep(5 * time.Millisecond)
	}

	apply("# shop: Shop\nlevel: system\n\n! Money is integer cents\n")
	time.Sleep(300 * time.Millisecond)
	if read() != "" {
		t.Fatalf("sync is off by default, yet AGENTS.md was written:\n%s", read())
	}

	on, err := core.SetAgentsSync(context.Background(), connect.NewRequest(&localv1.SetAgentsSyncRequest{ProjectId: project.ID, Enabled: true}))
	if err != nil {
		t.Fatal(err)
	}
	if len(on.Msg.Files) != 1 || on.Msg.Files[0].Path != "AGENTS.md" || on.Msg.Files[0].Action != wedge.ProjectionWrite {
		t.Fatalf("turning sync on writes the block at once: %+v", on.Msg.Files)
	}
	if !strings.Contains(read(), "Money is integer cents (from shop)") {
		t.Fatalf("AGENTS.md:\n%s", read())
	}
	if _, err := core.SaveProjectSettings(context.Background(), connect.NewRequest(&localv1.SaveProjectSettingsRequest{
		Settings: &localv1.ProjectSettings{ProjectId: project.ID, Description: "Shop"},
	})); err != nil {
		t.Fatal(err)
	}
	settings, err := core.GetProjectSettings(context.Background(), connect.NewRequest(&localv1.GetProjectSettingsRequest{ProjectId: project.ID}))
	if err != nil || !settings.Msg.Settings.AgentsSync {
		t.Fatalf("a settings save must keep sync on: %+v %v", settings.Msg.GetSettings(), err)
	}

	apply("# shop: Shop\nlevel: system\n\n! Money is integer cents\n! Refunds keep the original currency\n")
	waitFor("Refunds keep the original currency (from shop)")
	if _, err := os.Stat(filepath.Join(root, "docs", "decision")); !os.IsNotExist(err) {
		t.Fatalf("sync writes only AGENTS.md: %v", err)
	}

	if _, err := core.SetAgentsSync(context.Background(), connect.NewRequest(&localv1.SetAgentsSyncRequest{ProjectId: project.ID, Enabled: false})); err != nil {
		t.Fatal(err)
	}
	apply("# shop: Shop\nlevel: system\n\n! Money is integer cents\n! Refunds keep the original currency\n! Prices include tax\n")
	time.Sleep(300 * time.Millisecond)
	if strings.Contains(read(), "Prices include tax") {
		t.Fatalf("sync off must leave AGENTS.md alone:\n%s", read())
	}
	if errOut.Len() > 0 {
		t.Fatalf("sync errors: %s", errOut.String())
	}
}
