import {
  capabilityEnabled,
  type PlatformCapability,
  type PlatformContext,
} from "@polterware/frontend-platform";

/** Project surfaces: Inbox, Work, Atlas, Truth, Activity. Settings (with Agents and Integrations) is a dialog, not a section. */
export type NavSectionId =
  | "inbox"
  | "atlas"
  | "work"
  | "truth"
  | "activity";

/** Full pages reachable outside the sidebar (e.g. from the Help menu). */
export type PageSectionId = "cli";

export type SectionId = NavSectionId | PageSectionId;
export type ProjectSettingsTabId =
  | "agents-access"
  | "agents-sessions"
  | "agents-context"
  | "integrations-connected"
  | "integrations-catalog"
  | "shortcuts"
  | "advanced";
export type WorkTabId = "board" | "specs";
export type TruthTabId = "decisions" | "facts" | "evidence";

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
  id: NavSectionId;
  label: string;
  group?: string;
  icon?: string;
  requiredCapability?: PlatformCapability;
};

/** Landing surface for a fresh session, a project switch, and an unknown route. */
const DEFAULT_SECTION = "inbox" as const satisfies NavSectionId;

export const DEFAULT_TABS = {
  inbox: "all",
  atlas: "map",
  work: "board",
  truth: "decisions",
  activity: "all",
  cli: "reference",
} satisfies Record<SectionId, string>;

export const SECTION_TABS = {
  // Route id only — Inbox is a flat page (no tab rail).
  inbox: [{ id: "all", label: "All" }],
  atlas: [
    { id: "map", label: "Map" },
    { id: "components", label: "Components" },
    { id: "relations", label: "Relations" },
  ],
  work: [
    { id: "board", label: "Board" },
    { id: "specs", label: "List" },
  ],
  // Intent (Decisions) and observed state (Facts) with the material that backs them.
  truth: [
    { id: "decisions", label: "Decisions" },
    { id: "facts", label: "Facts" },
    { id: "evidence", label: "Evidence" },
  ],
  // Route id only — Activity is a flat page (no tab rail).
  activity: [{ id: "all", label: "All" }],
} satisfies Partial<Record<SectionId, { id: string; label: string }[]>>;

const NAV_SECTIONS = {
  inbox: true,
  atlas: true,
  work: true,
  truth: true,
  activity: true,
} satisfies Record<string, boolean>;

const ROUTE_CAPABILITIES: Partial<Record<SectionId, PlatformCapability>> = {};

export function isNavSectionId(value: string): value is NavSectionId {
  return Object.prototype.hasOwnProperty.call(NAV_SECTIONS, value);
}

export function isSectionId(value: string): value is SectionId {
  return isNavSectionId(value) || value === "cli";
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

  // Removed surfaces (Ops / Terminal / Nodes) redirect to Atlas.
  if (
    section === "ops" ||
    section === "operations" ||
    section === "terminal" ||
    section === "search" ||
    section === "logs"
  ) {
    section = "atlas";
    tab = "map";
  }
  // Pre-Atlas sections map onto their new homes.
  if (section === "architecture") {
    section = "atlas";
  }
  if (
    section === "resources" ||
    section === "inventory" ||
    section === "nodes" ||
    section === "processes"
  ) {
    // Resources are Atlas components now.
    section = "atlas";
    tab = "components";
  }
  if (section === "knowledge") {
    if (tab === "sources" || tab === "docs" || tab === "runbooks") {
      section = "truth";
      tab = "evidence";
    } else if (tab === "library" || tab === "verdicts") {
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
    if (tab === "sources" || tab === "docs") tab = "evidence";
  }
  // Agents and Integrations moved into the Settings dialog; their facts live in Truth and their history in Activity.
  if (section === "agents" && tab === "facts") {
    section = "truth";
  } else if (section === "agents" && tab === "history") {
    section = "activity";
  } else if (section === "agents" || section === "integrations") {
    section = DEFAULT_SECTION;
    tab = undefined;
  }

  if (isSectionId(section) && sectionAvailable(section, platform)) {
    return { section, tab: normalizeTab(section, tab) };
  }
  return { section: DEFAULT_SECTION, tab: DEFAULT_TABS[DEFAULT_SECTION] };
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
    projectId: "proj-polter",
    environmentId: "env-polter-prod",
    dialog: null,
  };
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
