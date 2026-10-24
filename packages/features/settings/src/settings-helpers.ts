import {
  Bot,
  Hammer,
  Layers,
  LibraryBig,
  Plug,
  ShieldCheck,
  Zap,
  type TabItem,
} from "@polterware/frontend-design-system";
import type { ProjectEnvironment, SettingsTabId } from "./types";

/** A settings rail entry; `group` is the small label shown above its run of entries. */
export type SettingsTab = TabItem & { id: SettingsTabId; group: string };

export const SETTINGS_TABS: SettingsTab[] = [
  {
    id: "agents-access",
    group: "Agents",
    label: "Access",
    tooltip: {
      title: "Agent access",
      description:
        "Start or stop the MCP helper, install agent hooks, and copy the Polterware skill so agents read the same project state.",
      icon: Bot,
    },
  },
  {
    id: "agents-sessions",
    group: "Agents",
    label: "Sessions",
    tooltip: {
      title: "Live sessions",
      description:
        "Agents working on this project now, the tasks they claimed, and the most recent handoffs.",
      icon: Plug,
    },
  },
  {
    id: "agents-context",
    group: "Agents",
    label: "Context",
    tooltip: {
      title: "Context and drift",
      description:
        "Preview the Oracle text an agent would receive, CompileContext, and the Narrow Drift Checker. Findings are advisory.",
      icon: Layers,
    },
  },
  {
    id: "integrations-connected",
    group: "Integrations",
    label: "Connected",
    tooltip: {
      title: "Connected providers",
      description:
        "Providers already authenticated via their CLI. Credentials stay in the OS/CLI store, not SQLite.",
      icon: ShieldCheck,
    },
  },
  {
    id: "integrations-catalog",
    group: "Integrations",
    label: "Catalog",
    tooltip: {
      title: "Provider catalog",
      description:
        "Fixed list: GitHub, GitLab, AWS, Google Cloud, Azure, Vercel, Supabase, Terraform, and Docker. Detect CLI, run auth in a core PTY, probe connection.",
      icon: LibraryBig,
    },
  },
  {
    id: "shortcuts",
    group: "App",
    label: "Shortcuts",
    tooltip: {
      title: "Keyboard shortcuts",
      description:
        "Remap Shell and Architecture chords for this computer. Architecture shortcuts work when the canvas is focused and you are not typing in a field.",
      icon: Zap,
    },
  },
  {
    id: "advanced",
    group: "App",
    label: "Advanced",
    tooltip: {
      title: "Danger zone",
      description:
        "Archive the project or reset the local demonstration store. Destructive and local-only — use when you intentionally want a clean slate.",
      icon: Hammer,
    },
  },
];

/** Normalize route tab ids to the retained Settings IA. */
export function normalizeSettingsTab(raw?: string): SettingsTabId {
  return SETTINGS_TABS.find((item) => item.id === raw)?.id ?? "agents-access";
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
