import { SHORTCUT_GROUPS, SHORTCUT_GROUP_LABELS, shortcutsInGroup } from "@polterware/frontend-state";
import { CLI_COMMANDS } from "@polterware/feature-shell";
import type { SettingsTabId } from "./types";

export type SettingsSearchEntry = {
  id: string;
  tab: SettingsTabId;
  /** Section title shown in the result path; also the scroll target slug. */
  section: string;
  label: string;
  description?: string;
  keywords?: string;
};

export { searchSettings, settingsSectionId } from "@polterware/frontend-design-system";

export const SETTINGS_SEARCH_ENTRIES: SettingsSearchEntry[] = [
  {
    id: "project-general",
    tab: "general",
    section: "Project",
    label: "Project",
    keywords: "name description primary repository default environment project id",
  },
  {
    id: "project-repositories",
    tab: "repositories",
    section: "Local repositories",
    label: "Local repositories",
    keywords: "git checkout path browse add repository",
  },
  {
    id: "project-agents-sync",
    tab: "repositories",
    section: "AGENTS.md",
    label: "AGENTS.md sync",
    keywords: "agents md sync generated block principles rules structure decisions export",
  },
  {
    id: "project-environments",
    tab: "environments",
    section: "Environments",
    label: "Environments",
    keywords: "add environment default delete",
  },
  {
    id: "archive-project",
    tab: "project-danger",
    section: "Danger zone",
    label: "Archive project",
    description: "Hide this project from the switcher. Local data stays in SQLite.",
    keywords: "project archive",
  },
  {
    id: "privacy",
    tab: "privacy",
    section: "Privacy",
    label: "Privacy",
    description: "Local-first data and credential handling.",
    keywords: "credentials tokens account",
  },
  {
    id: "mcp-helper",
    tab: "agents-mcp",
    section: "MCP server",
    label: "MCP helper",
    description: "Start or stop the local MCP server agents connect to.",
    keywords: "agents server cursor claude",
  },
  {
    id: "agent-setup",
    tab: "agents-setup",
    section: "Agent setup",
    label: "Agent setup",
    description: "Check Claude Code and Codex setup and copy repair commands.",
    keywords: "claude codex plugin install doctor path",
  },
  {
    id: "agent-hooks",
    tab: "agents-hooks",
    section: "Hooks",
    label: "Agent hooks",
    description: "Switch the Polterware plugin hooks on or off.",
    keywords: "claude codex plugin setup",
  },
  {
    id: "ai-skill",
    tab: "agents-skill",
    section: "AI skill",
    label: "AI skill",
    description: "Copy or download the Polterware instructions for coding agents.",
    keywords: "markdown download copy instructions",
  },
  {
    id: "platforms-connected",
    tab: "platforms-connected",
    section: "Connected",
    label: "Connected platforms",
    description: "Platform CLIs connected to this project.",
    keywords: "integrations providers vercel github aws sync refresh",
  },
  {
    id: "platforms-catalog",
    tab: "platforms-catalog",
    section: "Catalog",
    label: "Platform catalog",
    description: "Platform CLIs Polterware can detect and sign in to.",
    keywords: "integrations providers connect install login",
  },
  {
    id: "cli-reference",
    tab: "cli-reference",
    section: "CLI reference",
    label: "CLI reference",
    description: "Every polterware command, its options, and the interactive keys.",
    keywords: "command line terminal flags markdown",
  },
  {
    id: "reduce-transparency",
    tab: "appearance",
    section: "Appearance",
    label: "Reduce transparency",
    description: "Use a solid fill instead of the macOS frosted title bar and sidebar.",
    keywords: "appearance glass vibrancy",
  },
  {
    id: "core-status",
    tab: "local-core",
    section: "Local core",
    label: "Local core",
    description: "Status, start on open, and quit behavior.",
    keywords: "server serve process quit start",
  },
  {
    id: "reset-store",
    tab: "app-danger",
    section: "Danger zone",
    label: "Reset local store",
    description: "Delete local data and reseed the demonstration project.",
    keywords: "database sqlite",
  },
];

/** Shortcut commands, which depend on the live shortcut catalog, and every CLI command. */
export function dynamicSettingsEntries(): SettingsSearchEntry[] {
  const commands = CLI_COMMANDS.map<SettingsSearchEntry>((command) => ({
    id: `cli-${command.id}`,
    tab: "cli-reference",
    section: "Commands",
    label: command.name,
    description: command.summary,
    keywords: "cli command",
  }));
  const shortcuts = SHORTCUT_GROUPS.flatMap((group) =>
    shortcutsInGroup(group).map<SettingsSearchEntry>((command) => ({
      id: `shortcut-${command.id}`,
      tab: "shortcuts",
      section: "Shortcuts",
      label: command.label,
      keywords: `${SHORTCUT_GROUP_LABELS[group]} keyboard chord`,
    })),
  );
  return [...shortcuts, ...commands];
}
