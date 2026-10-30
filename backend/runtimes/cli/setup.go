package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"connectrpc.com/connect"

	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	"github.com/polterware/polterware/backend/providers/agentsetup"
)

const setupUsage = "usage: polterware setup [doctor] | claude [--uninstall | --enable | --disable | --skill-only] | codex [--uninstall] [--project <id>]"

func runSetup(dbPath string, args []string) error {
	if len(args) == 0 || args[0] == "doctor" {
		return setupDoctor(dbPath)
	}
	switch args[0] {
	case "claude":
		return setupClaude(dbPath, args[1:])
	case "codex":
		return setupCodex(dbPath, args[1:])
	}
	return errors.New(setupUsage)
}

func setupClaude(dbPath string, args []string) error {
	flags := flag.NewFlagSet("setup claude", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	uninstall := flags.Bool("uninstall", false, "remove the plugin and the local marketplace")
	enable := flags.Bool("enable", false, "enable the installed plugin")
	disable := flags.Bool("disable", false, "disable the installed plugin")
	skillOnly := flags.Bool("skill-only", false, "install the plugin with every hook switched off")
	if err := flags.Parse(args); err != nil {
		return err
	}
	chosen := 0
	for _, on := range []bool{*uninstall, *enable, *disable, *skillOnly} {
		if on {
			chosen++
		}
	}
	if chosen > 1 {
		return errors.New("choose one of --uninstall, --enable, --disable, --skill-only")
	}
	switch {
	case *uninstall:
		if err := agentsetup.UninstallClaude(); err != nil {
			return err
		}
		fmt.Println("polterware plugin removed from Claude Code")
		return nil
	case *enable, *disable:
		if err := agentsetup.SetClaudeEnabled(*enable); err != nil {
			return err
		}
		fmt.Printf("polterware plugin %s\n", map[bool]string{true: "enabled", false: "disabled"}[*enable])
		return nil
	}
	if *skillOnly {
		if err := setAllHooks(dbPath, false); err != nil {
			return err
		}
	}
	if err := agentsetup.InstallClaude(filepath.Dir(dbPath)); err != nil {
		return err
	}
	fmt.Printf("polterware plugin %s installed in Claude Code; restart Claude Code to load it\n", agentsetup.EmbeddedVersion())
	if *skillOnly {
		fmt.Println("all hooks are off: the skill only. Turn one on with: polterware hooks enable <name>")
	}
	return nil
}

func setupCodex(dbPath string, args []string) error {
	flags := flag.NewFlagSet("setup codex", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	uninstall := flags.Bool("uninstall", false, "remove the skill file and the AGENTS.md line")
	projectID := flags.String("project", "", "project id (defaults to the project of the current directory)")
	if err := flags.Parse(args); err != nil {
		return err
	}
	root := ""
	if c, err := dial(dbPath); err == nil {
		if project, err := resolveProject(c, *projectID); err == nil {
			root = cwdRepository(c, project.Id)
		}
	}
	if *uninstall {
		if err := agentsetup.UninstallAgents(root); err != nil {
			return err
		}
		fmt.Println("polterware skill and AGENTS.md line removed")
		return nil
	}
	if err := agentsetup.InstallAgents(root); err != nil {
		return err
	}
	fmt.Println("polter skill written for Codex and other agents")
	if root == "" {
		fmt.Println("no project found here: AGENTS.md line skipped")
	} else {
		fmt.Printf("AGENTS.md line added in %s\n", root)
	}
	return nil
}

func setupDoctor(dbPath string) error {
	report := agentsetup.Doctor(filepath.Dir(dbPath))
	line := func(ok bool, text string) {
		mark := "!!"
		if ok {
			mark = "ok"
		}
		fmt.Printf("%s  %s\n", mark, text)
	}
	line(report.PolterwarePath != "", "polterware on PATH"+suffix(report.PolterwarePath, "hooks skip themselves without it"))
	line(report.ClaudePath != "", "claude detected"+suffix(report.ClaudePath, "install Claude Code to use the plugin"))
	switch {
	case report.ClaudePath == "":
	case report.Problem != "":
		line(false, "plugin state unreadable: "+report.Problem)
	case !report.Plugin.Installed:
		line(false, "plugin not installed: polterware setup claude")
	case !report.Current():
		line(false, fmt.Sprintf("plugin %s is behind this binary (%s): polterware setup claude", report.Plugin.Version, report.EmbeddedVer))
	default:
		state := "enabled"
		if !report.Plugin.Enabled {
			state = "disabled"
		}
		line(report.Plugin.Enabled, fmt.Sprintf("plugin %s %s", report.Plugin.Version, state))
	}
	agents := agentsetup.InspectAgents("")
	line(agents.SkillReady, "Codex skill file"+suffix(agents.SkillPath, ""))
	return printHooks(dbPath)
}

func suffix(value, hint string) string {
	switch {
	case value != "":
		return " (" + value + ")"
	case hint != "":
		return ": " + hint
	}
	return ""
}

func runHooks(dbPath string, args []string) error {
	if len(args) == 0 || args[0] == "list" {
		return printHooks(dbPath)
	}
	if len(args) != 2 || (args[0] != "enable" && args[0] != "disable") {
		return errors.New("usage: polterware hooks [list] | enable|disable <name|dispatch|all>")
	}
	enabled := args[0] == "enable"
	if args[1] == "dispatch" {
		if enabled {
			return runDispatchOn(dbPath)
		}
		return runDispatchOff(dbPath)
	}
	if args[1] == "all" {
		return setAllHooks(dbPath, enabled)
	}
	if !agentsetup.ValidHook(args[1]) {
		return fmt.Errorf("unknown hook %q: use %s", args[1], strings.Join(hookNames(), ", "))
	}
	c, err := dial(dbPath)
	if err != nil {
		return err
	}
	if _, err := c.AgentRuns.SetHookSwitch(context.Background(), connect.NewRequest(&localv1.SetHookSwitchRequest{Name: args[1], Enabled: enabled})); err != nil {
		return err
	}
	fmt.Printf("hook %s %s\n", args[1], map[bool]string{true: "on", false: "off"}[enabled])
	return nil
}

func setAllHooks(dbPath string, enabled bool) error {
	c, err := dial(dbPath)
	if err != nil {
		return err
	}
	for _, name := range hookNames() {
		if _, err := c.AgentRuns.SetHookSwitch(context.Background(), connect.NewRequest(&localv1.SetHookSwitchRequest{Name: name, Enabled: enabled})); err != nil {
			return err
		}
	}
	return nil
}

func printHooks(dbPath string) error {
	c, err := dial(dbPath)
	if err != nil {
		return err
	}
	res, err := c.AgentRuns.ListHookSwitches(context.Background(), connect.NewRequest(&localv1.ListHookSwitchesRequest{}))
	if err != nil {
		return err
	}
	for _, hook := range res.Msg.Hooks {
		state := "off"
		if hook.Enabled {
			state = "on"
		}
		fmt.Printf("%-3s %-8s %s\n", state, hook.Name, hook.Label)
	}
	return nil
}

func hookNames() []string {
	names := make([]string, 0, len(agentsetup.Hooks))
	for _, hook := range agentsetup.Hooks {
		names = append(names, hook.Name)
	}
	return names
}

func expandHome(path string) string {
	if strings.HasPrefix(path, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, path[2:])
		}
	}
	return path
}

// hookEnabled asks the core whether a hook is on. It fails open: a core that
// cannot answer must not silence the hook the operator did not turn off.
func hookEnabled(dbPath, subcommand string) bool {
	name := agentsetup.SwitchFor(subcommand)
	if !agentsetup.ValidHook(name) {
		return true
	}
	c, err := dial(dbPath)
	if err != nil {
		return true
	}
	res, err := c.AgentRuns.ListHookSwitches(context.Background(), connect.NewRequest(&localv1.ListHookSwitchesRequest{}))
	if err != nil {
		return true
	}
	for _, hook := range res.Msg.Hooks {
		if hook.Name == name {
			return hook.Enabled
		}
	}
	return true
}
