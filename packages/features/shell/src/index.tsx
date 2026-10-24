import type { JSX } from "solid-js";
import { createMemo, createSignal } from "solid-js";
import { ResizableSidebar, ToastRegion } from "@polterware/frontend-design-system";
import type { PlatformContext } from "@polterware/frontend-platform";
import { MainFrame, ShellRoot } from "@polterware/frontend-shell";
import type { ClientRoute, NavItem, ShellStatus } from "./route";
import { isNavSectionId } from "./route";
import { SidebarNav, SidebarSettingsItem, type SidebarCount } from "./sidebar";
import { MainSurface } from "./main-surface";
import { TitleBar } from "./title-bar";
import { SidebarProjectHeader, type WorkspaceContext } from "./context-switchers";
import type { EnvironmentItem, ProjectSwitcherItem, ScopeNodeItem, WorkspaceScope } from "./types";
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
  goSection,
  enterProject,
  setTab,
  openDialog,
  closeDialog,
  setSearch,
  setFilters,
  setEnvironment,
  setSelectedNode,
  setExpandedDetail,
  setWizardStep,
  routesEqual,
  historySnapshot,
  resolveSection,
  resolveRoute,
  defaultTabFor,
  DEFAULT_TABS,
  SECTION_TABS,
  isSectionId,
  isNavSectionId,
  ensureRouteAvailable,
  requiredCapabilityForSection,
  sectionAvailable,
} from "./route";
export { MainSurface, PageHeader, PageContent } from "./main-surface";
export { EntityDetailHost, type EntityDetailHostProps } from "./entity-detail-host";
export { expandedDetail, openDetail, requestDetailExpanded, setDetailExpandHandler, setExpandedDetailTarget } from "./detail-expansion";
export { SidebarNav, SidebarSettingsItem } from "./sidebar";
export type { SidebarCount } from "./sidebar";
export { TitleBar } from "./title-bar";
export { CliReferencePage } from "./cli-reference-page";
export { InboxPage } from "./inbox-page";
export { TerminalEmulator } from "./terminal-emulator";
export { TerminalTranscript } from "./terminal-transcript";
export { CreateProjectDialog } from "./create-project-dialog";
export { ProjectSwitcher } from "./project-switcher";
export { SidebarProjectHeader, WorkspaceContextBar } from "./context-switchers";
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

export const DEFAULT_NAV: NavItem[] = [
  { id: "inbox", label: "Inbox", group: "PROJECT" },
  { id: "work", label: "Work", group: "PROJECT" },
  { id: "atlas", label: "Atlas", group: "PROJECT" },
  { id: "truth", label: "Truth", group: "PROJECT" },
  { id: "activity", label: "Activity", group: "PROJECT" },
];

function workspaceFromRoute(
  route: ClientRoute | undefined,
  environments: readonly EnvironmentItem[],
): WorkspaceContext {
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
  onNavigate?: (section: string) => void;
  onProjectSelect?: (projectId: string) => void;
  onCreateProject?: () => void;
  onOpenProjectSettings?: () => void;
  onSelectEnvironment?: (environmentId: string) => void;
  onOpenCommander?: () => void;
  onOpenSettings?: () => void;
  /** True while the Settings dialog is open. */
  settingsOpen?: boolean;
  onOpenCliReference?: () => void;
  workspace?: WorkspaceContext;
  projects?: ProjectSwitcherItem[];
  environments?: EnvironmentItem[];
  /** Atlas nodes offered by the global scope filter. */
  scopeNodes?: ScopeNodeItem[];
  scope?: WorkspaceScope;
  onSelectScope?: (scope: WorkspaceScope) => void;
  status?: ShellStatus;
  navItems?: NavItem[];
  navCounts?: Partial<Record<string, SidebarCount>>;
  platform?: PlatformContext;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onBack?: () => void;
  onForward?: () => void;
  children: JSX.Element;
}) {
  const [localWorkspace, setLocalWorkspace] = createSignal<WorkspaceContext | null>(null);

  const currentSection = () => props.route?.().section ?? props.panel?.() ?? "inbox";
  const items = () => props.navItems ?? DEFAULT_NAV;
  const workspace = createMemo(
    () => props.workspace ?? localWorkspace() ?? workspaceFromRoute(props.route?.(), props.environments ?? ENVIRONMENT_FIXTURES),
  );
  const activeId = () => (isNavSectionId(currentSection()) ? currentSection() : "");

  function select(section: string) {
    props.onNavigate?.(section);
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
        workspace={workspace()}
        environments={props.environments}
        onSelectEnvironment={selectEnvironment}
        scopeNodes={props.scopeNodes}
        scope={props.scope}
        onSelectScope={props.onSelectScope}
        onOpenCommander={() => props.onOpenCommander?.()}
      />

      <div class="flex min-h-0 flex-1">
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
              <SidebarProjectHeader
                context={workspace()}
                projects={props.projects}
                onSelectProject={selectProject}
                onCreateProject={() => props.onCreateProject?.()}
                onOpenProjectSettings={() => props.onOpenProjectSettings?.()}
              />
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
                  onOpenCliReference={props.onOpenCliReference}
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
      </div>

      <ToastRegion />
    </ShellRoot>
  );
}
