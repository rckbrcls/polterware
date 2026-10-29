package agentsetup

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWriteMarketplaceMatchesEmbeddedPlugin(t *testing.T) {
	dir := t.TempDir()
	if err := WriteMarketplace(dir); err != nil {
		t.Fatal(err)
	}
	for _, rel := range []string{
		".claude-plugin/marketplace.json",
		"plugins/polterware/.claude-plugin/plugin.json",
		"plugins/polterware/hooks/hooks.json",
		"plugins/polterware/skills/polter/SKILL.md",
	} {
		if _, err := os.Stat(filepath.Join(dir, rel)); err != nil {
			t.Fatalf("%s: %v", rel, err)
		}
	}
	if EmbeddedVersion() == "" {
		t.Fatal("embedded plugin has no version")
	}
	// A stale file from an older plugin must not survive a rewrite.
	stale := filepath.Join(dir, "plugins", "polterware", "old.txt")
	if err := os.WriteFile(stale, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := WriteMarketplace(dir); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(stale); !os.IsNotExist(err) {
		t.Fatalf("stale file kept: %v", err)
	}
}

func TestHooksJSONCallsOnlyKnownSwitches(t *testing.T) {
	body, err := pluginFS.ReadFile(pluginRoot + "/hooks/hooks.json")
	if err != nil {
		t.Fatal(err)
	}
	for _, sub := range []string{"session-start", "session-end", "status", "stop", "lint", "context"} {
		if !strings.Contains(string(body), "polterware hook "+sub) {
			t.Fatalf("hooks.json does not call %s", sub)
		}
		if !ValidHook(SwitchFor(sub)) {
			t.Fatalf("%s has no switch", sub)
		}
	}
}

func TestContextHookRunsAfterReadsAndEdits(t *testing.T) {
	body, err := pluginFS.ReadFile(pluginRoot + "/hooks/hooks.json")
	if err != nil {
		t.Fatal(err)
	}
	var config struct {
		Hooks map[string][]struct {
			Matcher string `json:"matcher"`
			Hooks   []struct {
				Command string `json:"command"`
			} `json:"hooks"`
		} `json:"hooks"`
	}
	if err := json.Unmarshal(body, &config); err != nil {
		t.Fatal(err)
	}
	for _, group := range config.Hooks["PostToolUse"] {
		for _, hook := range group.Hooks {
			if strings.HasSuffix(hook.Command, "polterware hook context") {
				if group.Matcher != "Read|Edit|Write|MultiEdit" {
					t.Fatalf("context hook matcher = %q", group.Matcher)
				}
				return
			}
		}
	}
	t.Fatal("hooks.json has no PostToolUse context hook")
}

func TestStaleNoticesNameOldInstallsOnly(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	dbDir := t.TempDir()
	if got := StaleNotices(dbDir); len(got) != 0 {
		t.Fatalf("nothing installed, yet %v", got)
	}
	if err := WriteMarketplace(MarketplaceDir(dbDir)); err != nil {
		t.Fatal(err)
	}
	if err := InstallAgents(""); err != nil {
		t.Fatal(err)
	}
	if got := StaleNotices(dbDir); len(got) != 0 {
		t.Fatalf("current installs, yet %v", got)
	}
	manifest := filepath.Join(MarketplaceDir(dbDir), "plugins", PluginName, ".claude-plugin", "plugin.json")
	if err := os.WriteFile(manifest, []byte(`{"name":"polterware","version":"0.0.1"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	dir, _ := SkillDir()
	if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte("old skill"), 0o644); err != nil {
		t.Fatal(err)
	}
	got := StaleNotices(dbDir)
	if len(got) != 2 || !strings.Contains(got[0], "plugin is 0.0.1 and this binary has "+EmbeddedVersion()+"; run polterware setup claude") ||
		!strings.Contains(got[1], "run polterware setup codex") {
		t.Fatalf("notices = %v", got)
	}
}

func TestAgentsLineRoundTrip(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	root := t.TempDir()
	path := filepath.Join(root, "AGENTS.md")
	if err := os.WriteFile(path, []byte("# Rules\n\nBe kind.\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := InstallAgents(root); err != nil {
		t.Fatal(err)
	}
	if err := InstallAgents(root); err != nil {
		t.Fatal(err)
	}
	body, _ := os.ReadFile(path)
	if strings.Count(string(body), agentsLineBegin) != 1 {
		t.Fatalf("line not idempotent:\n%s", body)
	}
	state := InspectAgents(root)
	if !state.SkillReady || !state.LineReady {
		t.Fatalf("state = %+v", state)
	}
	if err := UninstallAgents(root); err != nil {
		t.Fatal(err)
	}
	body, _ = os.ReadFile(path)
	if strings.TrimSpace(string(body)) != "# Rules\n\nBe kind." {
		t.Fatalf("user text changed:\n%q", body)
	}
	if InspectAgents(root).SkillReady {
		t.Fatal("skill file kept")
	}
}
