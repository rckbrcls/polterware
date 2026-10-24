import {
  Folder,
  GitBranch,
  Globe,
  Archive,
  Plug,
  Bot,
  Webhook,
  BookOpen,
  Eye,
  Layers,
  GitCompare,
  Zap,
  Sun,
  Cpu,
  Shield,
  Database,
  type TabItem,
} from "@polterware/frontend-design-system";
import type { ProjectEnvironment, SettingsTabId } from "./types";

/** A settings rail entry; every page has a group and a distinct icon. */
export type SettingsTab = TabItem & {
  id: SettingsTabId;
  group: "Project" | "Agents" | "App";
  tooltip: NonNullable<TabItem["tooltip"]> & { icon: typeof Folder };
};

export const SETTINGS_TABS: SettingsTab[] = [
  {
    id: "general",
    group: "Project",
    label: "General",
    tooltip: {
      title: "Project settings",
      description: "Name, description, primary repository, and default environment.",
      icon: Folder,
    },
  },
  {
    id: "repositories",
    group: "Project",
    label: "Repositories",
    tooltip: {
      title: "Local repositories",
      description: "Manage extra local Git checkouts and their paths.",
      icon: GitBranch,
    },
  },
  {
    id: "environments",
    group: "Project",
    label: "Environments",
    tooltip: {
      title: "Project environments",
      description: "Manage local environments and their default.",
      icon: Globe,
    },
  },
  {
    id: "project-danger",
    group: "Project",
    label: "Danger zone",
    tooltip: {
      title: "Project danger zone",
      description: "Archive the current project without deleting its local data.",
      icon: Archive,
    },
  },
  {
    id: "agents-mcp",
    group: "Agents",
    label: "MCP server",
    tooltip: {
      title: "MCP server",
      description: "Start or stop the local MCP helper and copy client configuration.",
      icon: Plug,
    },
  },
  {
    id: "agents-setup",
    group: "Agents",
    label: "Agent setup",
    tooltip: {
      title: "Agent setup",
      description: "Check Claude Code and Codex setup and copy repair commands.",
      icon: Bot,
    },
  },
  {
    id: "agents-hooks",
    group: "Agents",
    label: "Hooks",
    tooltip: {
      title: "Agent hooks",
      description: "Switch the Polterware plugin hooks on or off.",
      icon: Webhook,
    },
  },
  {
    id: "agents-skill",
    group: "Agents",
    label: "AI skill",
    tooltip: {
      title: "AI skill",
      description: "Copy or download the Polterware instructions for coding agents.",
      icon: BookOpen,
    },
  },
  {
    id: "agents-oracle",
    group: "Agents",
    label: "Oracle",
    tooltip: {
      title: "Oracle",
      description: "Preview the exact text an agent receives for one node, card, or title.",
      icon: Eye,
    },
  },
  {
    id: "agents-compile",
    group: "Agents",
    label: "Compile context",
    tooltip: {
      title: "Compile context",
      description: "Preview the ranked context package within a token budget.",
      icon: Layers,
    },
  },
  {
    id: "agents-drift",
    group: "Agents",
    label: "Drift check",
    tooltip: {
      title: "Drift check",
      description: "Run the narrow drift checker over the project model.",
      icon: GitCompare,
    },
  },
  {
    id: "shortcuts",
    group: "App",
    label: "Shortcuts",
    tooltip: {
      title: "Keyboard shortcuts",
      description: "Remap Shell and Architecture chords for this computer.",
      icon: Zap,
    },
  },
  {
    id: "appearance",
    group: "App",
    label: "Appearance",
    tooltip: {
      title: "Appearance",
      description: "Choose frosted or opaque macOS window chrome.",
      icon: Sun,
    },
  },
  {
    id: "local-core",
    group: "App",
    label: "Local core",
    tooltip: {
      title: "Local core",
      description: "Manage core status, lifecycle, idle timeout, and quit behavior.",
      icon: Cpu,
    },
  },
  {
    id: "privacy",
    group: "App",
    label: "Privacy",
    tooltip: {
      title: "Privacy",
      description: "Local-first project data and provider credential handling.",
      icon: Shield,
    },
  },
  {
    id: "app-danger",
    group: "App",
    label: "Danger zone",
    tooltip: {
      title: "App danger zone",
      description: "Reset the local demonstration store.",
      icon: Database,
    },
  },
];

/** Preserve links to the former pages by opening their first focused concern. */
export function normalizeSettingsTab(raw?: string): SettingsTabId {
  const current = SETTINGS_TABS.find((item) => item.id === raw);
  if (current) return current.id;
  switch (raw) {
    case "agents-access": return "agents-mcp";
    case "agents-context": return "agents-oracle";
    case "advanced": return "appearance";
    default: return "agents-mcp";
  }
}

export function environmentSelectOptions(
  environments: readonly ProjectEnvironment[],
): Array<{ value: string; label: string }> {
  return environments.map((environment) => ({
    value: environment.id,
    label: environment.name,
  }));
}

export function environmentsDetailScope(): string {
  return "settings:environments";
}

export function environmentDetailTarget(entityId: string) {
  return {
    scopeId: environmentsDetailScope(),
    entityId,
    entityKind: "environment" as const,
  };
}
