// Package agentsetup installs Polterware into agents: the embedded Claude Code
// plugin (through the `claude` CLI, never by editing Claude Code's files) and
// the skill file for Codex and other agents. The plugin version is the binary's.
package agentsetup

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

// pluginFS holds the Claude Code plugin. The canonical copy lives here because
// go:embed cannot reach outside the Go module; plugins/polterware is a symlink
// to it for the repository marketplace.
//
//go:embed all:plugin
var pluginFS embed.FS

const (
	PluginName      = "polterware"
	MarketplaceName = "polterware-local"
	PluginID        = PluginName + "@" + MarketplaceName
	pluginRoot      = "plugin"
)

// EmbeddedVersion is the version of the plugin bundled in this binary.
func EmbeddedVersion() string {
	body, err := pluginFS.ReadFile(pluginRoot + "/.claude-plugin/plugin.json")
	if err != nil {
		return ""
	}
	var manifest struct {
		Version string `json:"version"`
	}
	if json.Unmarshal(body, &manifest) != nil {
		return ""
	}
	return manifest.Version
}

// MarketplaceDir is the local marketplace under the database directory.
func MarketplaceDir(dbDir string) string {
	return filepath.Join(dbDir, "agent-plugins", "claude")
}

// SkillFile returns the embedded polter skill.
func SkillFile() ([]byte, error) {
	return pluginFS.ReadFile(pluginRoot + "/skills/polter/SKILL.md")
}

// WriteMarketplace writes the local marketplace and the embedded plugin into dir,
// replacing the previous copy of the plugin so stale files never linger.
func WriteMarketplace(dir string) error {
	target := filepath.Join(dir, "plugins", PluginName)
	if err := os.RemoveAll(target); err != nil {
		return err
	}
	err := fs.WalkDir(pluginFS, pluginRoot, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(pluginRoot, path)
		dest := filepath.Join(target, rel)
		if entry.IsDir() {
			return os.MkdirAll(dest, 0o755)
		}
		body, err := pluginFS.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(dest, body, 0o644)
	})
	if err != nil {
		return err
	}
	manifest, err := json.MarshalIndent(map[string]any{
		"name":  MarketplaceName,
		"owner": map[string]string{"name": "Polterware"},
		"plugins": []map[string]string{{
			"name":        PluginName,
			"source":      "./plugins/" + PluginName,
			"description": "Write Polterware Work cards in Polter format, lint .pw.md files, and audit each session as one AgentRun.",
		}},
	}, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(dir, ".claude-plugin"), 0o755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, ".claude-plugin", "marketplace.json"), append(manifest, '\n'), 0o644)
}

// StaleNotices names the installed agent integrations older than this binary:
// the Claude Code plugin in the local marketplace and the shared skill file.
// It reads files only, so it is cheap enough for every status; an integration
// that was never installed says nothing.
func StaleNotices(dbDir string) []string {
	var out []string
	manifest := filepath.Join(MarketplaceDir(dbDir), "plugins", PluginName, ".claude-plugin", "plugin.json")
	if body, err := os.ReadFile(manifest); err == nil {
		var installed struct {
			Version string `json:"version"`
		}
		if json.Unmarshal(body, &installed) == nil && installed.Version != EmbeddedVersion() {
			out = append(out, fmt.Sprintf("setup: the Claude Code plugin is %s and this binary has %s; run polterware setup claude", installed.Version, EmbeddedVersion()))
		}
	}
	if dir, err := SkillDir(); err == nil {
		have, err := os.ReadFile(filepath.Join(dir, "SKILL.md"))
		want, _ := SkillFile()
		if err == nil && string(have) != string(want) {
			out = append(out, "setup: the agent skill in "+dir+" differs from this binary's; run polterware setup codex")
		}
	}
	return out
}
