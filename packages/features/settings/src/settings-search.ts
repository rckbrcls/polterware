import { SHORTCUT_GROUP_LABELS, shortcutsInGroup } from "@polterware/frontend-state";
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
    id: "oracle",
    tab: "agents-oracle",
    section: "Oracle",
    label: "Oracle",
    description: "The exact text an agent receives for one node, card, or title.",
  },
  {
    id: "compile-context",
    tab: "agents-compile",
    section: "Compile context",
    label: "Compile context",
    description: "The ranked context package an agent gets within a token budget.",
    keywords: "tokens budget",
  },
  {
    id: "drift-check",
    tab: "agents-drift",
    section: "Drift check",
    label: "Drift check",
    description: "The narrow drift checker over the project model.",
    keywords: "findings advisory",
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

/** Shortcut commands, which depend on the live shortcut catalog. */
export function dynamicSettingsEntries(): SettingsSearchEntry[] {
  return (["shell", "architecture"] as const).flatMap((group) =>
    shortcutsInGroup(group).map<SettingsSearchEntry>((command) => ({
      id: `shortcut-${command.id}`,
      tab: "shortcuts",
      section: "Shortcuts",
      label: command.label,
      keywords: `${SHORTCUT_GROUP_LABELS[group]} keyboard chord`,
    })),
  );
}
