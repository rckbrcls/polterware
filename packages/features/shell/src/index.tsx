import type { JSX } from "solid-js";
import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { ConfirmRegion, ResizableSidebar, ToastRegion } from "@polterware/frontend-design-system";
import type { PlatformContext } from "@polterware/frontend-platform";
import { MainFrame, ShellRoot } from "@polterware/frontend-shell";
import type { ClientRoute, NavItem, ShellStatus } from "./route";
import { DEFAULT_TABS, SECTION_TABS, isHomeRoute, isNavSectionId } from "./route";
import { DEFAULT_NAV } from "./navigation";
import { SidebarNav, SidebarSettingsItem, type SidebarCount } from "./sidebar";
import { MainSurface } from "./main-surface";
import { TitleBar, type TitleBarCrumb } from "./title-bar";
import { type WorkspaceContext } from "./context-switchers";
import type { EnvironmentItem, ProjectSwitcherItem } from "./types";
import { ENVIRONMENT_FIXTURES } from "./fixtures";

export type {
  ClientRoute,
  DialogState,
  ShellStatus,
  NavItem,
  SectionId,
  NavSectionId,
  ProjectSettingsTabId,
  WorkTabId,
  TruthTabId,
  DispatchTabId,
} from "./route";
export type {
  ProjectSwitcherItem,
  ScopeNodeItem,
  WorkspaceScope,
  EnvironmentItem,
  EnvironmentKind,
  DataSource,
  DeploymentMode,
  PlatformCapability,
  PlatformCapabilities,
  PlatformContext,
} from "./types";
export type { WorkspaceContext } from "./context-switchers";
export {
  createDefaultRoute,
  createHomeRoute,
  goHome,
  goSection,
  enterProject,
  isHomeRoute,
  setTab,
  openDialog,
  closeDialog,
  setSearch,
  setFilters,
  setEnvironment,
  setSelectedNode,
  setExpandedDetail,
  setMilestoneView,
  setWizardStep,
  routesEqual,
  historySnapshot,
  resolveSection,
  resolveRoute,
  legacySettingsTab,
  defaultTabFor,
  DEFAULT_TABS,
  SECTION_TABS,
  isSectionId,
  isNavSectionId,
  ensureRouteAvailable,
  requiredCapabilityForSection,
  sectionAvailable,
  sectionMemory,
  withSectionMemory,
} from "./route";
export { ActorIcon } from "./actor-icon";
export { MainSurface, PageHeader, PageContent } from "./main-surface";
export { EntityDetailHost, type EntityDetailHostProps } from "./entity-detail-host";
export { EntityDocumentCanvas } from "./entity-document";
export {
  expandedDetail,
  openDetail,
  requestDetailExpanded,
  requestPageBack,
  requestSectionNavigate,
  setDetailExpandHandler,
  setExpandedDetailTarget,
  setPageBackHandler,
  setSectionNavigateHandler,
} from "./detail-expansion";
export { ShortcutsPanel } from "./shortcuts-panel";
export { SidebarNav, SidebarSettingsItem } from "./sidebar";
export type { SidebarCount } from "./sidebar";
export { TitleBar } from "./title-bar";
export { CliReferenceSettings } from "./cli-reference-page";
export { CLI_COMMANDS } from "./cli-reference";
export { InboxPage } from "./inbox-page";
export { ProjectsScreen } from "./projects-screen";
export { TerminalEmulator } from "./terminal-emulator";
export { TerminalTranscript } from "./terminal-transcript";
export { CreateProjectDialog } from "./create-project-dialog";
export { ProjectSwitcher } from "./project-switcher";
export { WorkspaceContextBar } from "./context-switchers";
export { clausesToScopeTokens, isScopeFieldId, scopeContextOptions, scopeFilterFields, scopeTokensToClauses } from "./scope-filter-menu";
export { createPageFilters, polterwareSavedFiltersApi } from "./page-filters";
export type { PageFilterScope, PageFilters, PageFiltersOptions } from "./page-filters";
export {
  SCOPE_FILTER_KEYS,
  dedupeParsedScopeTokens,
  dedupeScopeTokens,
  environmentIds,
  isScopeFilterKey,
  matchesEnvironment,
  parseScopeFilter,
  resolveScopeToken,
  scopeFilterAllowsEnv,
  scopeNodeIds,
  serializeScopeFilter,
  splitScopeFilterInput,
  suggestScopeFilter,
} from "./scope-filter";
export type {
  ParsedScopeToken,
  ScopeFilterCatalog,
  ScopeFilterEnvironment,
  ScopeFilterKey,
  ScopeFilterNode,
  ScopeFilterSuggestion,
  ScopeFilterToken,
} from "./scope-filter";
export {
  PROJECT_SWITCHER_FIXTURES,
  ENVIRONMENT_FIXTURES,
} from "./fixtures";
export type * from "./workspace-mocks";
export {
  INTEGRATION_MOCKS,
  INTEGRATION_RESOURCE_MOCKS,
  INTEGRATION_SYNC_RUN_MOCKS,
  CATALOG_PROVIDER_MOCKS,
} from "./workspace-mocks";

export { DEFAULT_NAV } from "./navigation";

function workspaceFromRoute(
  route: ClientRoute | undefined,
  environments: readonly EnvironmentItem[],
): WorkspaceContext {
  if (route && isHomeRoute(route)) {
    return { projectId: "", environmentId: route.environmentId ?? "" };
  }
  const projectId = route?.projectId ?? environments[0]?.projectId ?? "proj-polter";
  const environment =
    environments.find((item) => item.id === route?.environmentId) ??
    environments.find((item) => item.projectId === projectId) ??
    environments[0];
  return { projectId, environmentId: environment?.id ?? "" };
}

export function Shell(props: {
  panel?: () => string;
  setPanel?: (panel: string) => void;
  route?: () => ClientRoute;
  onNavigate?: (section: string, tab?: string) => void;
  onProjectSelect?: (projectId: string) => void;
  onCreateProject?: () => void;
  onOpenProjectSettings?: () => void;
  onSelectEnvironment?: (environmentId: string) => void;
  onOpenCommander?: () => void;
  /** Opens Project settings from the sidebar footer. */
  onOpenSettings?: () => void;
  /** True while Project settings is open. */
  settingsOpen?: boolean;
  /** Opens App settings from the title bar. */
  onOpenAppSettings?: () => void;
  /** True while App settings is open. */
  appSettingsOpen?: boolean;
  workspace?: WorkspaceContext;
  projects?: ProjectSwitcherItem[];
  environments?: EnvironmentItem[];
  status?: ShellStatus;
  navItems?: NavItem[];
  navCounts?: Partial<Record<string, SidebarCount>>;
  platform?: PlatformContext;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onBack?: () => void;
  onForward?: () => void;
  onGoHome?: () => void;
  children: JSX.Element;
}) {
  const [localWorkspace, setLocalWorkspace] = createSignal<WorkspaceContext | null>(null);
  const atHome = () => (props.route ? isHomeRoute(props.route()) : false);
  createEffect(() => {
    if (atHome()) setLocalWorkspace(null);
  });

  // The title bar's history group follows the sidebar's right edge as it resizes or collapses.
  const [sidebarWidth, setSidebarWidth] = createSignal(0);
  createEffect(() => {
    if (atHome()) { setSidebarWidth(0); return; }
    let observer: ResizeObserver | undefined;
    const frame = requestAnimationFrame(() => {
      const sidebar = document.querySelector<HTMLElement>(".pw-shell-sidebar");
      if (!sidebar || typeof ResizeObserver === "undefined") return;
      observer = new ResizeObserver(() => setSidebarWidth(sidebar.getBoundingClientRect().width));
      observer.observe(sidebar);
    });
    onCleanup(() => { cancelAnimationFrame(frame); observer?.disconnect(); });
  });

  const currentSection = () => props.route?.().section ?? props.panel?.() ?? "inbox";
  const items = () => props.navItems ?? DEFAULT_NAV;
  const workspace = createMemo(
    () => props.workspace ?? localWorkspace() ?? workspaceFromRoute(props.route?.(), props.environments ?? ENVIRONMENT_FIXTURES),
  );
  const activeId = createMemo(() => {
    const section = currentSection();
    if (!isNavSectionId(section)) return "";
    const tab = props.route?.().tab ?? DEFAULT_TABS[section];
    const matched = items().find(
      (item) => item.section === section && (!item.tab || item.tab === tab),
    );
    return matched?.id ?? "";
  });

  /** Project › section group › section › tab, for the title bar; at home, just Projects. */
  const crumbs = createMemo((): TitleBarCrumb[] => {
    if (atHome()) return [{ label: "Projects" }];
    const section = currentSection();
    const project = (props.projects ?? []).find((item) => item.projectId === workspace().projectId);
    const item = items().find((entry) => entry.section === section);
    const tabs = (SECTION_TABS as Partial<Record<string, readonly { id: string; label: string }[]>>)[section] ?? [];
    const tab = tabs.length > 1 ? tabs.find((entry) => entry.id === (props.route?.().tab ?? DEFAULT_TABS[section as keyof typeof DEFAULT_TABS])) : undefined;
    const out: TitleBarCrumb[] = [];
    if (project) out.push({ label: project.name, onClick: () => props.onGoHome?.() });
    if (item?.group === "Agents") out.push({ label: "Agents", onClick: () => select("dispatch") });
    if (item) out.push({ label: item.label, onClick: () => select(section) });
    if (tab) out.push({ label: tab.label });
    return out;
  });

  function select(section: string, tab?: string) {
    props.onNavigate?.(section, tab);
    props.setPanel?.(section);
  }

  function selectProject(projectId: string) {
    const environments = props.environments ?? ENVIRONMENT_FIXTURES;
    const firstEnvironment =
      environments.find((environment) => environment.projectId === projectId) ?? environments[0];
    if (firstEnvironment) {
      setLocalWorkspace({ projectId, environmentId: firstEnvironment.id });
      props.onSelectEnvironment?.(firstEnvironment.id);
    }
    props.onProjectSelect?.(projectId);
  }

  function selectEnvironment(environmentId: string) {
    setLocalWorkspace({ ...workspace(), environmentId });
    props.onSelectEnvironment?.(environmentId);
  }

  return (
    <ShellRoot>
      <TitleBar
        canGoBack={Boolean(props.canGoBack)}
        canGoForward={Boolean(props.canGoForward)}
        onBack={() => props.onBack?.()}
        onForward={() => props.onForward?.()}
        onGoHome={() => props.onGoHome?.()}
        onOpenCommander={() => props.onOpenCommander?.()}
        onOpenAppSettings={() => props.onOpenAppSettings?.()}
        appSettingsOpen={props.appSettingsOpen}
        sidebarWidth={sidebarWidth()}
        crumbs={crumbs()}
      />

      <div class="flex min-h-0 flex-1">
        <Show
          when={!atHome()}
          fallback={
            <MainFrame>
              <MainSurface>{props.children}</MainSurface>
            </MainFrame>
          }
        >
          <ResizableSidebar
            class="pw-shell-sidebar"
            defaultWidth={232}
            minWidth={184}
            maxWidth={320}
            collapseThreshold={112}
            storageKey="polterware.shell.sidebar.sizes"
            ariaLabel="Project navigation"
            sidebar={
              <div class="flex h-full min-h-0 flex-col pt-2">
                <div class="flex min-h-0 flex-1 flex-col">
                  <SidebarNav
                    items={items()}
                    activeId={activeId()}
                    onSelect={select}
                    platform={props.platform}
                    counts={props.navCounts}
                  />
                </div>
                <div class="mt-auto px-2 py-3">
                  <SidebarSettingsItem
                    active={props.settingsOpen}
                    onSelect={() => props.onOpenSettings?.()}
                  />
                </div>
              </div>
            }
          >
            <MainFrame>
              <MainSurface>{props.children}</MainSurface>
            </MainFrame>
          </ResizableSidebar>
        </Show>
      </div>

      <ToastRegion />
      <ConfirmRegion />
    </ShellRoot>
  );
}
