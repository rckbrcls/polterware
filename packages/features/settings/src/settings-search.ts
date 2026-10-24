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
    id: "privacy",
    tab: "advanced",
    section: "Privacy",
    label: "Privacy",
    description: "Local-first data and credential handling.",
    keywords: "credentials tokens account",
  },
  {
    id: "mcp-helper",
    tab: "agents-access",
    section: "MCP helper",
    label: "MCP helper",
    description: "Start or stop the local MCP server agents connect to.",
    keywords: "agents server cursor claude",
  },
  {
    id: "agent-hooks",
    tab: "agents-access",
    section: "Agent setup",
    label: "Agent hooks",
    description: "Switch the Polterware plugin hooks on or off.",
    keywords: "claude codex plugin setup",
  },
  {
    id: "agent-sessions",
    tab: "agents-sessions",
    section: "Live sessions",
    label: "Live sessions",
    description: "Agents working on this project now and their handoffs.",
    keywords: "claimed tasks handoff",
  },
  {
    id: "oracle",
    tab: "agents-context",
    section: "Oracle",
    label: "Oracle",
    description: "The exact text an agent receives for one node, card, or title.",
  },
  {
    id: "compile-context",
    tab: "agents-context",
    section: "Compile context",
    label: "Compile context",
    description: "The ranked context package an agent gets within a token budget.",
    keywords: "tokens budget",
  },
  {
    id: "drift-check",
    tab: "agents-context",
    section: "Drift check",
    label: "Drift check",
    description: "The narrow drift checker over the project model.",
    keywords: "findings advisory",
  },
  {
    id: "connected-integrations",
    tab: "integrations-connected",
    section: "Connected",
    label: "Connected integrations",
    description: "Providers already authenticated through their CLI.",
    keywords: "github gitlab aws vercel supabase refresh metadata",
  },
  {
    id: "integration-catalog",
    tab: "integrations-catalog",
    section: "Catalog",
    label: "Integration catalog",
    description: "Connect GitHub, GitLab, AWS, Google Cloud, Azure, Vercel, Supabase, Terraform, or Docker.",
    keywords: "provider cli auth login",
  },
  {
    id: "reduce-transparency",
    tab: "advanced",
    section: "Appearance",
    label: "Reduce transparency",
    description: "Use a solid fill instead of the macOS frosted title bar and sidebar.",
    keywords: "appearance glass vibrancy",
  },
  {
    id: "core-status",
    tab: "advanced",
    section: "Local core",
    label: "Local core",
    description: "Status, start on open, and quit behavior.",
    keywords: "server serve process quit start",
  },
  {
    id: "reset-store",
    tab: "advanced",
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
      section: SHORTCUT_GROUP_LABELS[group],
      label: command.label,
      keywords: "keyboard chord",
    })),
  );
}
