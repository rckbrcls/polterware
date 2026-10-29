import {
  capabilityEnabled,
  type PlatformCapability,
  type PlatformContext,
} from "@polterware/frontend-platform";

/**
 * Project surfaces. Dispatch is three routes (Runs, Routing, Usage), with tabs on Runs and Routing.
 * Settings is a dialog, not a section: Platforms live in Project settings, the CLI reference in App settings.
 */
export type NavSectionId =
  | "inbox"
  | "structure"
  | "work"
  | "canvas"
  | "truth"
  | "dispatch"
  | "dispatch-routing"
  | "dispatch-usage"
  | "activity";

export type SectionId = NavSectionId;
export type ProjectSettingsTabId =
  | "general"
  | "repositories"
  | "environments"
  | "project-danger"
  | "agents-mcp"
  | "agents-setup"
  | "agents-hooks"
  | "agents-skill"
  | "platforms-connected"
  | "platforms-catalog"
  | "cli-reference"
  | "shortcuts"
  | "appearance"
  | "local-core"
  | "privacy"
  | "app-danger";
export type WorkTabId = "board" | "specs";
export type TruthTabId = "decisions" | "facts" | "docs";
export type DispatchTabId =
  | "runs"
  | "agents"
  | "tiers"
  | "learning"
  | "stats";

export type DialogState =
  | { type: "arch-node-create" }
  | { type: "create-view" }
  | { type: "settings"; tab: ProjectSettingsTabId }
  | { type: "project-settings" }
  | { type: "confirm"; message: string }
  | null;

export type ClientRoute = {
  section: string;
  tab: string;
  /** Projects screen. No project is entered, so the section switch stays hidden. */
  home?: boolean;
  projectId?: string;
  environmentId?: string;
  search?: string;
  filters?: Readonly<Record<string, readonly string[]>>;
  dialog?: DialogState;
  selectedNodeId?: string | null;
  wizardStep?: number;
  /** The entity whose detail fills the page; a history entry of its own, like opening a note. */
  expandedDetail?: { scopeId: string; entityId: string; entityKind: string } | null;
};

export type ShellStatus = {
  dataMode?: "fixture" | "offline" | "local";
};

export type NavItem = {
  id: string;
  section: NavSectionId;
  tab?: string;
  label: string;
  group?: string;
  icon?: string;
  requiredCapability?: PlatformCapability;
};

/** Landing surface for a fresh session, a project switch, and an unknown route. */
const DEFAULT_SECTION = "inbox" as const satisfies NavSectionId;

export const DEFAULT_TABS = {
  inbox: "all",
  structure: "all",
  work: "board",
  canvas: "all",
  truth: "decisions",
  dispatch: "runs",
  "dispatch-routing": "tiers",
  "dispatch-usage": "agents",
  activity: "all",
} satisfies Record<SectionId, string>;

export const SECTION_TABS = {
  // Route id only — Inbox is a flat page (no tab rail).
  inbox: [{ id: "all", label: "All" }],
  canvas: [{ id: "all", label: "All" }],
  structure: [{ id: "all", label: "All" }],
  work: [
    { id: "board", label: "Board" },
    { id: "specs", label: "List" },
  ],
  // Intent (Decisions) and observed state (Facts) with the docs that back them.
  truth: [
    { id: "decisions", label: "Decisions" },
    { id: "facts", label: "Facts" },
    { id: "docs", label: "Docs" },
  ],
  // Route id only — Runs is a flat page (no tab rail). Worktree info lives on the run card.
  dispatch: [{ id: "runs", label: "Runs" }],
  // Tier order, and what the classifier learned.
  "dispatch-routing": [
    { id: "tiers", label: "Tiers" },
    { id: "learning", label: "Learning" },
  ],
  // Quota and pace per agent, and what the runs cost.
  "dispatch-usage": [
    { id: "agents", label: "Agents" },
    { id: "stats", label: "Stats" },
  ],
  // Route id only — Activity is a flat page (no tab rail).
  activity: [{ id: "all", label: "All" }],
} satisfies Partial<Record<SectionId, { id: string; label: string }[]>>;

const NAV_SECTIONS = {
  inbox: true,
  structure: true,
  work: true,
  canvas: true,
  truth: true,
  dispatch: true,
  "dispatch-routing": true,
  "dispatch-usage": true,
  activity: true,
} satisfies Record<string, boolean>;

const ROUTE_CAPABILITIES: Partial<Record<SectionId, PlatformCapability>> = {};

export function isNavSectionId(value: string): value is NavSectionId {
  return Object.prototype.hasOwnProperty.call(NAV_SECTIONS, value);
}

export function isSectionId(value: string): value is SectionId {
  return isNavSectionId(value);
}

export type ResolvedRoute = { section: SectionId; tab: string };

export function requiredCapabilityForSection(
  section: string,
): PlatformCapability | undefined {
  return isSectionId(section) ? ROUTE_CAPABILITIES[section] : undefined;
}

export function sectionAvailable(
  section: string,
  platform?: PlatformContext,
): boolean {
  return (
    isSectionId(section) &&
    capabilityEnabled(platform, requiredCapabilityForSection(section))
  );
}

function normalizeTab(section: SectionId, tab?: string): string {
  const allowed = Object.entries(SECTION_TABS).find(([key]) => key === section)?.[1];
  if (!allowed) return DEFAULT_TABS[section];
  return allowed.some((item) => item.id === tab) ? tab! : DEFAULT_TABS[section];
}

export function resolveRoute(
  rawSection: string,
  rawTab?: string,
  platform?: PlatformContext,
): ResolvedRoute {
  let section = rawSection.toLowerCase();
  let tab = rawTab;

  // Removed surfaces (Ops / Terminal / Nodes) redirect to Structure.
  if (
    section === "ops" ||
    section === "operations" ||
    section === "terminal" ||
    section === "search" ||
    section === "logs"
  ) {
    section = "structure";
    tab = "all";
  }
  // Pre-Structure sections map onto their new homes.
  if (section === "architecture") {
    section = "structure";
  }
  if (
    section === "resources" ||
    section === "inventory" ||
    section === "nodes" ||
    section === "processes"
  ) {
    // Resources are Structure components now.
    section = "structure";
    tab = "all";
  }
  if (section === "knowledge") {
    if (tab === "sources" || tab === "docs" || tab === "runbooks") {
      section = "truth";
      tab = "docs";
    } else if (tab === "library" || tab === "decisions") {
      section = "truth";
      tab = "decisions";
    } else {
      section = "work";
      tab = "specs";
    }
  }
  // Settings is a dialog; the legacy Sync section lands on the default surface.
  if (section === "sync" || section === "settings") {
    section = DEFAULT_SECTION;
    tab = undefined;
  }
  // Decisions and Reality merged into Truth; the change history became Activity.
  if (section === "decisions") {
    section = "truth";
    tab = "decisions";
  }
  if (section === "reality") {
    section = tab === "history" ? "activity" : "truth";
    if (tab === "sources" || tab === "docs") tab = "docs";
  }
  // Evidence was the earlier name of Docs.
  if (section === "truth" && tab === "evidence") tab = "docs";
  // Agents moved into the Settings dialog; their facts live in Truth and their history in Activity.
  if (section === "agents" && tab === "facts") {
    section = "truth";
  } else if (section === "agents" && tab === "history") {
    section = "activity";
  } else if (legacySettingsTab(section, tab)) {
    // Core, the CLI reference, and Platforms moved into the Settings dialog.
    section = DEFAULT_SECTION;
    tab = undefined;
  }
  // Legacy Dispatch routes. Worktrees folded into the run card.
  if (section === "dispatch-agents") {
    if (tab === "tiers" || tab === "learning") {
      section = "dispatch-routing";
    } else {
      section = "dispatch-usage";
      tab = "agents";
    }
  } else if (section === "dispatch") {
    if (tab === "worktrees") tab = "runs";
    else if (tab === "tiers" || tab === "learning") section = "dispatch-routing";
    else if (tab === "agents" || tab === "stats") section = "dispatch-usage";
  }

  if (isSectionId(section) && sectionAvailable(section, platform)) {
    return { section, tab: normalizeTab(section, tab) };
  }
  return { section: DEFAULT_SECTION, tab: DEFAULT_TABS[DEFAULT_SECTION] };
}

/**
 * The Settings page that replaced a former route: Core and the CLI reference (App settings)
 * and Platforms (Project settings). Undefined for any other route.
 */
export function legacySettingsTab(rawSection: string, rawTab?: string): ProjectSettingsTabId | undefined {
  const section = rawSection.toLowerCase();
  if (section === "cli" || (section === "agents" && rawTab === "cli")) return "cli-reference";
  if (section === "agents") return rawTab === "server" ? "agents-mcp" : "agents-setup";
  if (section === "integrations-catalog" || (section === "integrations" && rawTab === "catalog")) return "platforms-catalog";
  if (section === "integrations" || section === "integrations-connected") return "platforms-connected";
  return undefined;
}

export function resolveSection(raw: string, platform?: PlatformContext): NavSectionId {
  const route = resolveRoute(raw, undefined, platform);
  return isNavSectionId(route.section) ? route.section : DEFAULT_SECTION;
}

export function defaultTabFor(section: string, platform?: PlatformContext): string {
  return resolveRoute(section, undefined, platform).tab;
}

export function createDefaultRoute(
  section: NavSectionId = DEFAULT_SECTION,
  platform?: PlatformContext,
): ClientRoute {
  const resolved = resolveRoute(section, undefined, platform);
  return {
    ...resolved,
    home: false,
    projectId: "proj-polter",
    environmentId: "env-polter-prod",
    dialog: null,
  };
}

/** Launch route: the Projects screen, before any project is entered. */
export function createHomeRoute(): ClientRoute {
  return {
    section: DEFAULT_SECTION,
    tab: DEFAULT_TABS[DEFAULT_SECTION],
    home: true,
    dialog: null,
  };
}

export function isHomeRoute(route: Pick<ClientRoute, "home">): boolean {
  return route.home === true;
}

/** Leave the open project and return to the Projects screen. */
export function goHome(_route: ClientRoute): ClientRoute {
  return createHomeRoute();
}

export function enterProject(
  route: ClientRoute,
  projectId: string,
  options?: { environmentId?: string; section?: NavSectionId; tab?: string },
): ClientRoute {
  const resolved = resolveRoute(options?.section ?? DEFAULT_SECTION, options?.tab);
  return {
    ...route,
    ...resolved,
    home: false,
    projectId,
    environmentId: options?.environmentId ?? route.environmentId,
    dialog: null,
    selectedNodeId: null,
    expandedDetail: null,
  };
}

export function goSection(
  route: ClientRoute,
  section: string,
  platform?: PlatformContext,
): ClientRoute {
  const resolved = resolveRoute(section, undefined, platform);
  return {
    ...route,
    ...resolved,
    home: false,
    dialog: null,
    selectedNodeId: null,
    search: undefined,
    filters: undefined,
    expandedDetail: null,
  };
}

export function setTab(
  route: ClientRoute,
  tab: string,
  platform?: PlatformContext,
): ClientRoute {
  return {
    ...route,
    ...resolveRoute(route.section, tab, platform),
    home: false,
    dialog: null,
    selectedNodeId: null,
    expandedDetail: null,
  };
}

export function ensureRouteAvailable(
  route: ClientRoute,
  platform?: PlatformContext,
): ClientRoute {
  return {
    ...route,
    ...resolveRoute(route.section, route.tab, platform),
  };
}

export function openDialog(route: ClientRoute, dialog: NonNullable<DialogState>): ClientRoute {
  return { ...route, dialog };
}

export function closeDialog(route: ClientRoute): ClientRoute {
  return { ...route, dialog: null };
}

export function setSearch(route: ClientRoute, search: string): ClientRoute {
  return { ...route, search };
}

export function setFilters(
  route: ClientRoute,
  filters: Readonly<Record<string, readonly string[]>>,
): ClientRoute {
  return { ...route, filters };
}

export function setEnvironment(route: ClientRoute, environmentId: string): ClientRoute {
  return { ...route, environmentId };
}

export function setSelectedNode(route: ClientRoute, selectedNodeId: string | null): ClientRoute {
  return { ...route, selectedNodeId };
}

export function setExpandedDetail(route: ClientRoute, expandedDetail: ClientRoute["expandedDetail"]): ClientRoute {
  return { ...route, expandedDetail };
}

export function setWizardStep(route: ClientRoute, wizardStep: number): ClientRoute {
  return { ...route, wizardStep };
}

export function historySnapshot(route: ClientRoute): ClientRoute {
  return { ...route, dialog: null };
}

export function routesEqual(a: ClientRoute, b: ClientRoute): boolean {
  return JSON.stringify(historySnapshot(a)) === JSON.stringify(historySnapshot(b));
}

/** What a section remembers about where the user was, so returning to it restores that place. */
export type SectionMemory = Pick<ClientRoute, "tab" | "search" | "filters" | "selectedNodeId" | "expandedDetail">;

export function sectionMemory(route: ClientRoute): SectionMemory {
  return {
    tab: route.tab,
    search: route.search,
    filters: route.filters,
    selectedNodeId: route.selectedNodeId ?? null,
    expandedDetail: route.expandedDetail ?? null,
  };
}

export function withSectionMemory(
  route: ClientRoute,
  memory: SectionMemory | undefined,
  platform?: PlatformContext,
): ClientRoute {
  if (!memory) return route;
  return {
    ...route,
    search: memory.search,
    filters: memory.filters,
    selectedNodeId: memory.selectedNodeId ?? null,
    expandedDetail: memory.expandedDetail ?? null,
    ...resolveRoute(route.section, memory.tab, platform),
  };
}
