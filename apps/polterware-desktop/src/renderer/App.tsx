import { Match, Show, Switch, Suspense, createEffect, createMemo, createSignal, lazy, onCleanup, onMount } from "solid-js";
import {
  Shell,
  InboxPage,
  ProjectsScreen,
  CreateProjectDialog,
  createDefaultRoute,
  createHomeRoute,
  goHome,
  goSection,
  sectionMemory,
  withSectionMemory,
  enterProject,
  isHomeRoute,
  setTab,
  openDialog,
  closeDialog,
  setSearch,
  setFilters,
  setSelectedNode,
  setEnvironment,
  setExpandedDetail,
  setExpandedDetailTarget,
  setDetailExpandHandler,
  openDetail,
  historySnapshot,
  ensureRouteAvailable,
  routesEqual,
  SECTION_TABS,
  type ClientRoute,
  environmentIds,
  matchesEnvironment,
  scopeNodeIds,
  serializeScopeFilter,
  type ScopeFilterToken,
  type ScopeNodeItem,
  type EnvironmentItem,
  type FeatureFlowStep,
  type ProjectSettingsTabId,
  type WorkspaceFeatureReview,
  type WorkspaceInboxAction,
  type WorkspaceInboxItem,
} from "@polterware/feature-shell";
import { StructureView, STRUCTURE_SCOPE, filterStructureNodes } from "@polterware/feature-architecture";
import { CanvasWorkspace } from "./canvas-workspace";
import type { MilestoneAction } from "@polterware/feature-knowledge";
import type { ChangeEnvelope } from "@polterware/feature-knowledge/change-envelope";
import { hydrateAppearancePreferences, hydrateShortcutPreferences, settingsTabScope } from "@polterware/feature-settings/boot";
import type { ProjectSettingsPageId } from "@polterware/feature-settings";
import { CommandPalette } from "@polterware/feature-commander";
import { PageLoading, pushToast, requestConfirm, type ArchivedListItem, type TabItem } from "@polterware/frontend-design-system";
import { detailDisplayFor, detailPanelStore, matchesShortcut, readRemembered, setActiveProjectId, writeRemembered } from "@polterware/frontend-state";
import { hideBootSplash } from "./boot-splash";
import { bootstrapPlatform } from "./platform-bootstrap";

const KnowledgeView = lazy(() =>
  import("@polterware/feature-knowledge").then((m) => ({ default: m.KnowledgeView })),
);
const IntegrationsView = lazy(() =>
  import("@polterware/feature-integrations").then((m) => ({ default: m.IntegrationsView })),
);
const SettingsView = lazy(() =>
  import("@polterware/feature-settings").then((m) => ({ default: m.SettingsView })),
);
const ProjectSettingsDialog = lazy(() =>
  import("@polterware/feature-settings").then((m) => ({ default: m.ProjectSettingsDialog })),
);
const NewFeatureFlow = lazy(() =>
  import("@polterware/feature-knowledge").then((m) => ({ default: m.NewFeatureFlow })),
);
const TruthFactsPage = lazy(() =>
  import("@polterware/feature-knowledge").then((m) => ({ default: m.TruthFactsPage })),
);
const DispatchPage = lazy(() =>
  import("@polterware/feature-dispatch").then((m) => ({ default: m.DispatchPage })),
);
const ActivityPage = lazy(() =>
  import("@polterware/feature-settings").then((m) => ({ default: m.ActivityPage })),
);

import {
  emptyWorkspace,
  loadProjects,
  loadWorkCards,
  loadMilestones,
  loadStructure,
  loadCanonEvidence,
  loadChanges,
  loadFacts,
  loadInbox,
  loadWorkspaceExtensions,
  setActiveScope,
  loadWorkspaceShell,
  pickWorkspaceExtensions,
  type ProjectCatalog,
  type WorkspaceSnapshot,
} from "./workspace/load";
import { createChangeRefresher } from "./workspace/live-refresh";
import { gateErrorLines } from "./workspace/map-feature-review";
import { shouldOpenCreateProject } from "./workspace/first-project";
import {
  persistCreatedProject,
  persistDeleteEnvironment,
  persistArchiveProject,
  persistEnvironment,
  persistEnvironmentDefault,
  persistIntegrationConnection,
  persistIntegrationSync,
  persistImportProjectSources,
  persistKnowledgeBody,
  persistKnowledgeTags,
  persistKnowledgeTitle,
  persistKnowledgeCreate,
  persistKnowledgeDocType,
  persistKnowledgeScope,
  persistKnowledgeArchived,
  persistKnowledgeDeletePermanently,
  loadArchivedKnowledge,
  persistKnowledgeSourcePath,
  persistAddProjectRepo,
  persistProjectSettings,
  persistRemoveProjectRepo,
  persistAgentsSync,
  persistDecisionAction,
  persistWorkCreateCard,
  persistWorkRestoreCard,
  persistMilestoneCreate,
  persistMilestoneRename,
  persistMilestoneArchive,
  persistMilestonesReorder,
  persistFeatureAdvance,
  persistFeatureCreate,
  persistFeatureLine,
  loadFeatureReview,
  persistWorkRemoveCard,
  persistStructureCreateNode,
  persistStructureMoveNode,
  persistStructureUses,
  persistStructureUpdateDeploys,
  persistStructureKindTech,
  persistWorkSetStage,
  resetLocalStore,
} from "./workspace/persist";

const PLATFORM_CONTEXT = bootstrapPlatform();

/**
 * Desktop changes are made by a person, so nobody is asked to justify them: the envelope is
 * written from the action. The core still records every change; agents keep passing their own
 * summary and rationale.
 */
async function justifyChange(input: {
  title: string;
  description?: string;
  defaultSummary?: string;
}): Promise<ChangeEnvelope | null> {
  return { summary: input.defaultSummary ?? input.title, rationale: "Changed in Desktop" };
}

/** Archive dates read as a short local date; an unreadable stamp shows as is. */
function formatArchiveDate(stamp: string): string {
  if (!stamp) return "—";
  const date = new Date(stamp);
  return Number.isNaN(date.getTime()) ? stamp : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Local label so the lazily loaded Knowledge package stays out of the main bundle. */
function uniqueStructureSlug(nodes: readonly { path: string; slug: string }[], title: string): string {
  const base = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "node";
  const taken = new Set(nodes.flatMap((node) => [node.slug, node.path, node.path.split("/").pop() ?? ""]));
  if (!taken.has(base)) return base;
  let index = 2;
  while (taken.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function stageLabel(stage: string): string {
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

function isEnvironmentKind(kind: string): kind is EnvironmentItem["kind"] {
  return kind === "production"
    || kind === "staging"
    || kind === "development"
    || kind === "local";
}

function dispatchTabsFor(section: string): TabItem[] {
  if (section === "dispatch-routing") return [...SECTION_TABS["dispatch-routing"]];
  if (section === "dispatch-usage") return [...SECTION_TABS["dispatch-usage"]];
  return [...SECTION_TABS.dispatch];
}

function dispatchTabsLabel(section: string): string {
  if (section === "dispatch-routing") return "Routing";
  if (section === "dispatch-usage") return "Usage";
  return "Runs";
}

export function App() {
  const initialRoute = createHomeRoute();
  const [route, setRoute] = createSignal<ClientRoute>(initialRoute);
  const [history, setHistory] = createSignal<ClientRoute[]>([historySnapshot(initialRoute)]);
  const [historyIndex, setHistoryIndex] = createSignal(0);
  const [paletteOpen, setPaletteOpen] = createSignal(false);
  const [createProjectOpen, setCreateProjectOpen] = createSignal(false);
  const [importSourcesBusy, setImportSourcesBusy] = createSignal(false);
  const [workspace, setWorkspace] = createSignal<WorkspaceSnapshot>(emptyWorkspace());
  const [loading, setLoading] = createSignal(true);
  const [structureError, setStructureError] = createSignal("");

  async function refreshWorkspace(
    projectId = route().projectId ?? "",
    catalog?: ProjectCatalog,
  ) {
    if (!projectId) {
      setLoading(false);
      return;
    }
    try {
      setStructureError("");
      const shell = await loadWorkspaceShell(projectId, catalog);
      if (loadedProjectId && loadedProjectId !== projectId) return;
      // Same project: keep the loaded extensions until the fresh ones land, so the
      // Structure keeps the loaded registry visible during refresh.
      setWorkspace((current) =>
        current.extensionsReady && current.settings.projectId === projectId
          ? { ...shell, ...pickWorkspaceExtensions(current), extensionsReady: true }
          : shell,
      );
      if (shouldOpenCreateProject({
        coreAvailable: shell.available,
        projectCount: shell.projects.length,
      })) {
        loadedProjectId = "";
        setCreateProjectOpen(true);
        setLoading(false);
        return;
      }
      const current = route();
      if (!current.environmentId) {
        const environment = shell.environments.find((item) => item.projectId === shell.settings.projectId || item.projectId === current.projectId);
        if (environment) applyRoute(setEnvironment(current, environment.id), "silent");
      }
      setLoading(false);

      try {
        const extensions = await loadWorkspaceExtensions(projectId, {
          environments: shell.environments,
        });
        if (loadedProjectId && loadedProjectId !== projectId) return;
        setWorkspace((currentWorkspace) => ({
          ...currentWorkspace,
          ...extensions,
          extensionsReady: true,
        }));
      } catch (error) {
        setStructureError(error instanceof Error ? error.message : "Could not load Structure.");
        pushToast(
          error instanceof Error ? error.message : "Could not load workspace extensions.",
          "danger",
        );
      }
    } catch (error) {
      setWorkspace({
        ...emptyWorkspace(),
        healthMessage: error instanceof Error ? error.message : "Core unavailable",
      });
      setLoading(false);
    }
  }

  let loadedProjectId = "";
  const [bootstrapped, setBootstrapped] = createSignal(false);

  async function bootstrapProjects() {
    try {
      const listed = await loadProjects();
      if (shouldOpenCreateProject({
        coreAvailable: true,
        projectCount: listed.projects.length,
      })) {
        setCreateProjectOpen(true);
        setWorkspace({ ...emptyWorkspace(), available: true, projects: [] });
        setLoading(false);
        setBootstrapped(true);
        return;
      }
      const current = route();
      const linkedId = !isHomeRoute(current) && current.projectId && listed.projects.some((project) => project.projectId === current.projectId)
        ? current.projectId
        : undefined;
      if (!linkedId) {
        setWorkspace({
          ...emptyWorkspace(),
          available: true,
          projects: listed.projects,
          environments: listed.environments,
        });
        if (!isHomeRoute(current)) applyRoute(goHome(current), "replace");
        setLoading(false);
        setBootstrapped(true);
        return;
      }
      const environment = listed.environments.find((item) => item.projectId === linkedId);
      const entered = enterProject(current, linkedId, { environmentId: environment?.id });
      applyRoute(setTab(goSection(entered, current.section), current.tab), "replace");
      loadedProjectId = linkedId;
      await refreshWorkspace(linkedId, listed);
      setBootstrapped(true);
    } catch (error) {
      setWorkspace({
        ...emptyWorkspace(),
        healthMessage: error instanceof Error ? error.message : "Core unavailable",
      });
      setLoading(false);
      setBootstrapped(true);
    }
  }

  createEffect(() => {
    if (bootstrapped()) hideBootSplash();
  });

  createEffect(() => {
    if (!bootstrapped()) return;
    if (createProjectOpen() && workspace().projects.length === 0) return;
    const projectId = route().projectId;
    if (!projectId || projectId === loadedProjectId) return;
    // A switch away from a loaded project shows skeletons until the new shell lands.
    if (loadedProjectId) setLoading(true);
    loadedProjectId = projectId;
    void refreshWorkspace(projectId);
  });

  onMount(() => {
    void bootstrapProjects();
    void hydrateShortcutPreferences();
    void hydrateAppearancePreferences();
    const onKeyDown = (event: KeyboardEvent) => {
      if (matchesShortcut("shell.open_canvas", event) && !route().home) {
        event.preventDefault();
        handlePaletteCommand("nav.canvas");
        return;
      }
      if (route().section === "structure" && !route().dialog && !(event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) && matchesShortcut("structure.add_node", event)) {
        event.preventDefault(); handlePaletteCommand("action.create-node"); return;
      }
      if (!matchesShortcut("shell.toggle_commander", event)) return;
      event.preventDefault();
      setPaletteOpen((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown);
    const unsubscribeExecute = window.polterware.commander.onExecuteCommand((id: string) => {
      handlePaletteCommand(id);
    });
    // Live sync (Decision 0007): writes from the CLI, MCP agents, or the TUI refresh
    // only the affected slices of the current project.
    const refresher = createChangeRefresher({
      currentProjectId: () => currentProjectId(),
      refreshShell: async (projectId) => {
        const shell = await loadWorkspaceShell(projectId);
        if (currentProjectId() !== projectId) return;
        setWorkspace((current) => ({
          ...shell,
          ...pickWorkspaceExtensions(current),
          extensionsReady: current.extensionsReady,
        }));
      },
      refreshExtensions: async (projectId) => {
        const extensions = await loadWorkspaceExtensions(projectId, { environments: workspace().environments });
        if (currentProjectId() !== projectId) return;
        setWorkspace((current) => ({ ...current, ...extensions, extensionsReady: true }));
      },
      refreshWork: async (projectId) => {
        const [workCards, structure, inbox, milestones] = await Promise.all([
          loadWorkCards(projectId),
          loadStructure(projectId),
          loadInbox(projectId),
          loadMilestones(projectId),
        ]);
        if (currentProjectId() !== projectId) return;
        setWorkspace((current) => ({ ...current, workCards, structure, inbox, milestones }));
      },
      onError: (error) => {
        console.warn("Live refresh failed.", error);
      },
    });
    const unsubscribeChanges = window.polterware.core.onChange(refresher.push);
    onCleanup(() => {
      window.removeEventListener("keydown", onKeyDown);
      unsubscribeExecute();
      unsubscribeChanges();
      refresher.dispose();
    });
  });

  type NavigationMode = "push" | "replace" | "silent";

  const settingsDialogTab = () => {
    const dialog = route().dialog;
    return dialog?.type === "settings" ? dialog.tab : null;
  };
  /** The provider sign-in flow opened over Project settings › Platforms; it is not a route of its own. */
  const [connectIntegration, setConnectIntegration] = createSignal<{ providerId?: string } | null>(null);
  const settingsDialogScope = () => {
    const tab = settingsDialogTab();
    return tab ? settingsTabScope(tab) : null;
  };

  function applyRoute(next: ClientRoute, mode: NavigationMode = "push") {
    const availableRoute = ensureRouteAvailable(next, PLATFORM_CONTEXT);
    setRoute(availableRoute);
    if (mode === "silent") return;
    const snapshot = historySnapshot(availableRoute);
    if (mode === "replace") {
      setHistory((items) => {
        const copy = items.slice();
        copy[historyIndex()] = snapshot;
        return copy;
      });
      return;
    }
    setHistory((items) => {
      const base = items.slice(0, historyIndex() + 1);
      const lastBase = base[base.length - 1];
      if (lastBase && routesEqual(lastBase, snapshot)) return base;
      const nextItems = [...base, snapshot];
      setHistoryIndex(nextItems.length - 1);
      return nextItems;
    });
  }

  // Expanding a detail is a navigation: the route names the entity, so Back/Forward and the
  // titlebar arrows move between the list and that entity's full-page detail.
  createEffect(() => setExpandedDetailTarget(route().expandedDetail ?? null));
  setDetailExpandHandler((expanded) => {
    if (expanded) {
      const state = detailPanelStore.getState();
      const target = state.activeTarget ?? (state.lastTarget?.scopeId === state.activeScope ? state.lastTarget : null);
      if (target) applyRoute(setExpandedDetail(route(), target));
      return;
    }
    const collapsed = setExpandedDetail(route(), null);
    const previous = history()[historyIndex() - 1];
    if (previous && routesEqual(previous, collapsed)) goBack();
    else applyRoute(collapsed, "replace");
  });
  onCleanup(() => setDetailExpandHandler(undefined));

  /** Commander and other section jumps enter a project when the Projects screen is open. */
  function routeWithProject(current: ClientRoute): ClientRoute | undefined {
    if (!isHomeRoute(current) && current.projectId) return current;
    const projectId = workspace().projects.find((project) => project.status !== "archived")?.projectId
      ?? workspace().projects[0]?.projectId;
    if (!projectId) return undefined;
    const environment = workspace().environments.find((item) => item.projectId === projectId);
    return enterProject(current, projectId, { environmentId: environment?.id });
  }

  // Each section remembers where the user was (tab, search, filters, selection, open detail), per project;
  // returning through the sidebar or re-entering the project restores that place.
  const sectionMemoryKey = (projectId: string, section: string) => `route.${projectId}.${section}`;
  createEffect(() => {
    const current = route();
    if (isHomeRoute(current) || !current.projectId) return;
    writeRemembered(sectionMemoryKey(current.projectId, current.section), sectionMemory(current));
    writeRemembered(`section.${current.projectId}`, current.section);
  });
  function rememberedSection(next: ClientRoute): ClientRoute {
    if (!next.projectId) return next;
    return withSectionMemory(next, readRemembered(sectionMemoryKey(next.projectId, next.section), undefined), PLATFORM_CONTEXT);
  }

  function navigateSection(section: string, tab?: string) {
    const base = routeWithProject(route());
    if (!base) return;
    const next = goSection(base, section);
    applyRoute(tab ? setTab(next, tab) : rememberedSection(next));
  }

  function goProjectsHome() {
    if (isHomeRoute(route())) return;
    applyRoute(goHome(route()));
  }

  /** Docs open in the Docs list; Decisions open in the Decisions list. */
  const libraryScope = () =>
    route().section === "truth" && route().tab === "docs" ? "knowledge:docs" : "knowledge:library";

  function activateDetail(scopeId: string, entityId: string, entityKind: string) {
    openDetail({ scopeId, entityId, entityKind });
  }

  function navigateToDetail(
    nextRoute: ClientRoute,
    scopeId: string,
    entityId: string,
    entityKind: string,
  ) {
    const target = { scopeId, entityId, entityKind };
    detailPanelStore.getState().requestTarget(target);
    // Page-only kinds land on their full page; the others open the lateral panel.
    applyRoute(detailDisplayFor(entityKind) === "page" ? setExpandedDetail(nextRoute, target) : nextRoute);
  }

  function goBack() {
    if (historyIndex() <= 0) return;
    const nextIndex = historyIndex() - 1;
    const targetRoute = history()[nextIndex];
    if (!targetRoute) return;
    setHistoryIndex(nextIndex);
    setRoute({ ...targetRoute, dialog: null });
  }

  function goForward() {
    if (historyIndex() >= history().length - 1) return;
    const nextIndex = historyIndex() + 1;
    const targetRoute = history()[nextIndex];
    if (!targetRoute) return;
    setHistoryIndex(nextIndex);
    setRoute({ ...targetRoute, dialog: null });
  }

  function handlePaletteCommand(id: string) {
    if (id === "nav.settings") {
      applyRoute(openDialog(route(), { type: "settings", tab: "general" }), "silent");
      return;
    }
    if (id === "nav.app-settings") {
      applyRoute(openDialog(route(), { type: "settings", tab: "agents-mcp" }), "silent");
      return;
    }
    if (id === "nav.platforms") {
      applyRoute(openDialog(route(), { type: "settings", tab: "platforms-connected" }), "silent");
      return;
    }
    if (id === "nav.cli-reference") {
      applyRoute(openDialog(route(), { type: "settings", tab: "cli-reference" }), "silent");
      return;
    }
    if (id.startsWith("nav.")) {
      navigateSection(id.slice(4));
      return;
    }
    if (id === "action.open-sync") {
      applyRoute(openDialog(route(), { type: "settings", tab: "local-core" }), "silent");
      return;
    }
    if (id === "action.create-node") {
      const base = routeWithProject(route());
      if (!base) return;
      applyRoute(openDialog(goSection(base, "structure"), { type: "arch-node-create" }));
      return;
    }
    if (id === "action.connect-integration") {
      const base = routeWithProject(route());
      if (!base) return;
      applyRoute(openDialog(base, { type: "settings", tab: "platforms-catalog" }), "silent");
      setConnectIntegration({});
    }
  }

  /** Scope tokens. Node tokens become scope_nodes; env tokens narrow on the client. */
  const [scopeTokens, setScopeTokens] = createSignal<ScopeFilterToken[]>([]);
  const scopeNodes = createMemo<ScopeNodeItem[]>(() =>
    workspace().structure.nodes.map((node) => ({
      id: node.id,
      parentId: node.parentId,
      level: node.level,
      path: node.path,
      title: node.title,
    })),
  );
  const structureCounts = createMemo(() => Object.fromEntries(workspace().structure.nodes.map((node) => {
    const entityIds = new Set(workspace().canonEntities.filter((entity) => entity.refId === node.id || entity.refId === node.path).map((entity) => entity.id));
    return [node.id, {
      work: workspace().workCards.filter((card) => card.under === node.path).length,
      decisions: workspace().decisions.filter((decision) => decision.scopeNodeId === node.id || decision.governs.includes(node.path) || decision.entityLinks.some((link) => entityIds.has(link.entityId))).length,
      facts: workspace().structureFacts.filter((fact) => fact.scopeNodeId === node.id || entityIds.has(fact.entityId)).length,
    }];
  })));
  const scopeNodeIdList = createMemo(() => scopeNodeIds(scopeTokens(), scopeNodes()));
  const scopeEnvironments = createMemo(() => {
    const selected = new Set(environmentIds(scopeTokens()));
    if (selected.size === 0) return [];
    return workspace()
      .environments.filter((environment) => selected.has(environment.id))
      .map((environment) => ({ id: environment.id, name: environment.name }));
  });
  const scopeEnvironmentCatalog = createMemo(() => {
    const projectId = route().projectId ?? workspace().settings.projectId;
    return workspace().environments.filter((environment) => environment.projectId === projectId);
  });
  const activeScopePath = createMemo(() => {
    const selected = scopeTokens().filter((token) => token.key !== "env");
    if (selected.length !== 1) return "";
    return scopeNodes().find((node) => node.id === selected[0]?.id)?.path ?? "";
  });

  createEffect(() => {
    setActiveScope({ nodeIds: scopeNodeIdList() });
  });

  function selectProject(projectId: string) {
    if (scopeTokens().length > 0) {
      setActiveScope({ nodeIds: [] });
      setScopeTokens([]);
    }
    const environment =
      workspace().environments.find((item) => item.projectId === projectId) ?? workspace().environments[0];
    const section = readRemembered<string | undefined>(`section.${projectId}`, undefined);
    const entered = enterProject(route(), projectId, { environmentId: environment?.id });
    applyRoute(section ? rememberedSection(goSection(entered, section)) : entered);
  }

  const currentProjectId = () => route().projectId ?? workspace().settings.projectId;
  createEffect(() => setActiveProjectId(currentProjectId() ?? ""));

  async function reloadScoped(projectId: string, stamp: string) {
    try {
      const [workCards, inbox, extensions] = await Promise.all([
        loadWorkCards(projectId),
        loadInbox(projectId),
        loadWorkspaceExtensions(projectId, { environments: workspace().environments }),
      ]);
      if (currentProjectId() !== projectId || serializeScopeFilter(scopeTokens()) !== stamp) return;
      setWorkspace((current) => ({ ...current, ...extensions, workCards, inbox }));
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Could not apply the scope.", "danger");
    }
  }

  function applyScopeTokens(next: ScopeFilterToken[]) {
    setActiveScope({ nodeIds: scopeNodeIds(next, scopeNodes()) });
    setScopeTokens(next);
    void reloadScoped(currentProjectId(), serializeScopeFilter(next));
  }

  const dataMode = () => {
    if (!workspace().available) return "offline" as const;
    if (workspace().quarantined) return "offline" as const;
    return "local" as const;
  };

  /** One Inbox action from the Desktop; the core records it as "desktop". */
  async function resolveInboxItem(item: WorkspaceInboxItem, action: WorkspaceInboxAction, answer?: string) {
    const projectId = currentProjectId();
    try {
      await window.polterware.core.work.resolveInboxItem({ projectId, itemId: item.id, action, answer: answer ?? "" });
      const [workCards, structure, inbox] = await Promise.all([
        loadWorkCards(projectId),
        loadStructure(projectId),
        loadInbox(projectId),
      ]);
      if (currentProjectId() === projectId) setWorkspace((current) => ({ ...current, workCards, structure, inbox }));
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Could not update the Inbox item.", "danger");
      throw error;
    }
  }

  /** The Inbox derives Drift on read; a re-read picks up files changed outside Polterware. */
  async function checkDrift() {
    const projectId = currentProjectId();
    try {
      const inbox = await loadInbox(projectId);
      if (currentProjectId() !== projectId) return;
      setWorkspace((current) => ({ ...current, inbox }));
      const drift = inbox.items.filter((item) => item.kind === "drift" && item.state === "open").length;
      pushToast(drift === 0 ? "No drift found." : `${drift} drift ${drift === 1 ? "item" : "items"} in the Inbox.`, drift === 0 ? "success" : "default");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Could not check drift.", "danger");
    }
  }

  /** Cards open in the Board or Specs detail scope, matching the visible Work tab. */
  const cardScopeId = () =>
    route().section === "work" && route().tab === "board" ? "knowledge:board" : "knowledge:specs";

  function createWorkCard(title: string, stage?: "shape" | "plan" | "build" | "verify" | "delivered", milestone?: string) {
    void justifyChange({
      title: "Justify create card",
      defaultSummary: `Create card: ${title}`,
    }).then((change) => {
      if (!change) return;
      return persistWorkCreateCard({
        workspace: workspace(),
        projectId: currentProjectId(),
        title,
        milestone,
        change,
      }).then(async (slug) => {
        if (stage && stage !== "shape") await persistWorkSetStage(currentProjectId(), slug, stage, change);
        await refreshWorkspace(currentProjectId());
        activateDetail(cardScopeId(), slug, "card");
        pushToast("Card saved locally.", "success");
      });
    }).catch((error: unknown) => {
      pushToast(error instanceof Error ? error.message : "Could not create card.", "danger");
    });
  }

  const [flowOpen, setFlowOpen] = createSignal(false);
  const [flowStep, setFlowStep] = createSignal<FeatureFlowStep>("intent");
  const [flowReview, setFlowReview] = createSignal<WorkspaceFeatureReview | null>(null);
  const [flowBusy, setFlowBusy] = createSignal(false);
  const [flowErrors, setFlowErrors] = createSignal<string[]>([]);
  const flowComponents = () =>
    workspace().structure.nodes
      .filter((node) => node.level === "component")
      .map((node) => ({ path: node.path, title: node.title }));

  function openFeatureFlow() {
    setFlowReview(null);
    setFlowErrors([]);
    setFlowStep("intent");
    setFlowOpen(true);
  }

  function continueFeatureFlow(slug: string) {
    void loadFeatureReview(currentProjectId(), slug)
      .then((review) => {
        setFlowReview(review);
        setFlowErrors([]);
        setFlowStep(review.card.stage === "plan" ? "plan" : "shape");
        setFlowOpen(true);
      })
      .catch((error: unknown) => {
        pushToast(error instanceof Error ? error.message : "Could not load the feature.", "danger");
      });
  }

  function closeFeatureFlow() {
    const slug = flowReview()?.card.slug;
    setFlowOpen(false);
    if (slug) activateDetail(cardScopeId(), slug, "card");
  }

  /** One justified flow write; a refusal stays in the dialog as check lines. */
  async function runFlowWrite(
    justify: { title: string; defaultSummary: string },
    write: (change: ChangeEnvelope) => Promise<WorkspaceFeatureReview>,
  ): Promise<WorkspaceFeatureReview | null> {
    const change = await justifyChange(justify);
    if (!change) return null;
    setFlowBusy(true);
    setFlowErrors([]);
    try {
      const review = await write(change);
      setFlowReview(review);
      await refreshWorkspace(currentProjectId());
      return review;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "The feature write failed.";
      setFlowErrors(gateErrorLines(message));
      if (flowStep() === "intent") pushToast(message, "danger");
      return null;
    } finally {
      setFlowBusy(false);
    }
  }

  async function changeMilestone(action: MilestoneAction): Promise<string | null> {
    const projectId = currentProjectId();
    const milestone = action.kind === "create" ? undefined : workspace().milestones.find((item) => item.id === action.id);
    if (action.kind !== "create" && !milestone) throw new Error("This milestone is no longer available.");
    const summary = action.kind === "create" ? `Create milestone: ${action.name}`
      : action.kind === "rename" ? `Rename milestone: ${milestone?.name} to ${action.name}`
      : action.kind === "archive" ? `Archive milestone: ${milestone?.name}` : "Reorder milestones";
    const change = await justifyChange({ title: "Change milestone", defaultSummary: summary });
    if (!change) return null;
    let selectedId = action.kind === "create" ? "" : action.id;
    switch (action.kind) {
      case "create": selectedId = await persistMilestoneCreate(projectId, action.name, change); break;
      case "rename": await persistMilestoneRename(projectId, milestone!, action.name, change); break;
      case "archive": await persistMilestoneArchive(projectId, action.id, true, change); selectedId = ""; break;
      case "reorder": await persistMilestonesReorder(projectId, action.milestoneIds, change); break;
    }
    // Archiving moves the milestone's cards to the Backlog, so the cards reload too.
    const [milestones, workCards] = await Promise.all([
      loadMilestones(projectId),
      action.kind === "archive" ? loadWorkCards(projectId) : undefined,
    ]);
    if (currentProjectId() !== projectId) return null;
    setWorkspace((current) => ({ ...current, milestones, ...(workCards ? { workCards } : {}) }));
    pushToast(action.kind === "archive" ? `Archived ${milestone?.name}; its cards are in the Backlog.` : "Milestone saved locally.", "success");
    return selectedId;
  }

  /** Knowledge content hosted by Work and Truth with their own tab rails. */
  function KnowledgeSurface(surface: {
    tab: string;
    tabs: TabItem[];
    activeTab?: string;
    tabsLabel: string;
  }) {
    return (
      <KnowledgeView
        decisions={workspace().decisions}
        docs={workspace().docs}
        workCards={workspace().workCards}
        milestones={workspace().milestones}
        boardProjectId={currentProjectId()}
        onMilestoneAction={changeMilestone}
        entities={workspace().canonEntities}
        tab={surface.tab}
        tabs={surface.tabs}
        activeTab={surface.activeTab}
        tabsLabel={surface.tabsLabel}
        loading={loading() || !workspace().extensionsReady}
        onTabChange={(tab) => applyRoute(setTab(route(), tab))}
        onOpenDoc={(id) => activateDetail("knowledge:docs", id, "doc")}
        onOpenDecision={(id) => activateDetail(libraryScope(), id, "decision")}
        onDecisionAction={(decisionId, action) => {
          const decision = workspace().decisions.find((item) => item.id === decisionId);
          if (!decision) return;
          const successor = action.kind === "supersede"
            ? workspace().decisions.find((item) => item.id === action.byId)
            : undefined;
          const summaries = {
            activate: `Activate decision: ${decision.title}`,
            reactivate: `Keep decision active after review: ${decision.title}`,
            challenge: `Open review of decision: ${decision.title}`,
            supersede: `Supersede ${decision.title} with ${successor?.title ?? "another decision"}`,
            level: action.kind === "level" && action.level === "principle"
              ? `Make ${decision.title} a principle`
              : `Make ${decision.title} a decision`,
          } as const;
          void justifyChange({
            title: "Justify decision change",
            defaultSummary: summaries[action.kind],
          }).then((change) => {
            if (!change) return;
            return persistDecisionAction({ projectId: currentProjectId(), decision, action, change }).then(async () => {
              await refreshWorkspace(currentProjectId());
              pushToast("Decision updated.", "success");
            });
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not update the decision.", "danger");
          });
        }}
        onOpenCard={(slug) => activateDetail(cardScopeId(), slug, "card")}
        onOpenEntity={(_entityId, refId, kind) => {
          if (kind === "component") {
            applyRoute(goSection(route(), "structure"));
            activateDetail(STRUCTURE_SCOPE, refId, "arch-node");
          }
        }}
        onLinkEntity={(knowledgeId, entityId, kind) => {
          const predicate = kind === "resource" || kind === "component"
            ? (workspace().docs.some((item) => item.id === knowledgeId && item.docType === "runbook") ? "OPERATES" : "DOCUMENTS")
            : "RELATED_TO";
          void justifyChange({
            title: "Justify entity link",
            defaultSummary: `Link knowledge to ${kind}`,
          }).then((change) => {
            if (!change) return;
            return window.polterware.core.knowledge.saveLink({
              link: {
                projectId: currentProjectId(),
                knowledgeId,
                entityId,
                predicate,
                truthClass: "declared",
                source: "desktop",
                actor: "human",
              },
              change: {
                summary: change.summary,
                rationale: change.rationale,
                agentRunId: change.agentRunId ?? "",
              },
            }).then(async () => {
              await refreshWorkspace(currentProjectId());
              pushToast("Entity linked.", "success");
            });
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not link entity.", "danger");
          });
        }}
        onUnlinkEntity={(linkId) => {
          void justifyChange({
            title: "Justify unlink",
            defaultSummary: "Unlink knowledge entity",
          }).then((change) => {
            if (!change) return;
            return window.polterware.core.knowledge.deleteLink({
              id: linkId,
              change: {
                summary: change.summary,
                rationale: change.rationale,
                agentRunId: change.agentRunId ?? "",
              },
            }).then(async () => {
              await refreshWorkspace(currentProjectId());
              pushToast("Entity unlinked.", "success");
            });
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not unlink entity.", "danger");
          });
        }}
        onSaveBody={(id, body) => {
          // Persist without refreshWorkspace — full reload per keystroke freezes Knowledge + TipTap.
          void justifyChange({
            title: "Justify document edit",
            defaultSummary: "Update knowledge body",
          }).then((change) => {
            if (!change) return;
            return persistKnowledgeBody(workspace(), currentProjectId(), id, body, change);
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not save knowledge.", "danger");
          });
        }}
        onSaveTitle={(id, title) => {
          void justifyChange({
            title: "Justify doc rename",
            defaultSummary: "Rename doc",
          }).then((change) => {
            if (!change) return;
            return persistKnowledgeTitle(workspace(), currentProjectId(), id, title, change);
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not rename the doc.", "danger");
          });
        }}
        onSaveTags={(id, tags) => {
          void justifyChange({
            title: "Justify doc tags",
            defaultSummary: "Update doc tags",
          }).then((change) => {
            if (!change) return;
            return persistKnowledgeTags(workspace(), currentProjectId(), id, tags, change);
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not save tags.", "danger");
          });
        }}
        onSaveDocType={(id, docType) => {
          const title = workspace().docs.find((item) => item.id === id)?.title ?? "doc";
          void justifyChange({
            title: "Justify doc type",
            defaultSummary: `Mark ${title} as a ${docType}`,
          }).then((change) => {
            if (!change) return;
            return persistKnowledgeDocType(workspace(), currentProjectId(), id, docType, change)
              .then(() => refreshWorkspace(currentProjectId()));
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not change the doc type.", "danger");
          });
        }}
        scopeNodes={scopeNodes()}
        scopeTokens={scopeTokens()}
        scopeEnvironments={scopeEnvironmentCatalog()}
        onScopeTokensChange={applyScopeTokens}
        activeScopePath={activeScopePath()}
        onSetScope={(id, path) => {
          void persistKnowledgeScope(currentProjectId(), id, path)
            .then(() => refreshWorkspace(currentProjectId()))
            .catch((error: unknown) => {
              pushToast(error instanceof Error ? error.message : "Could not save scope.", "danger");
            });
        }}
        onSaveSourcePath={(id, path) => {
          void justifyChange({
            title: "Justify source path",
            defaultSummary: "Update source path",
          }).then((change) => {
            if (!change) return;
            return persistKnowledgeSourcePath(workspace(), currentProjectId(), id, path, change);
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not save source path.", "danger");
          });
        }}
        onCreate={(kind, title, level, scopePath) => {
          void justifyChange({
            title: "Justify create",
            defaultSummary: `Create ${kind}: ${title}`,
          }).then((change) => {
            if (!change) return;
            return persistKnowledgeCreate({
              projectId: currentProjectId(),
              kind,
              title,
              extraJson: level === "principle" ? JSON.stringify({ level: "principle" }) : undefined,
              change,
            }).then(async (id) => {
              if (scopePath) await persistKnowledgeScope(currentProjectId(), id, scopePath);
              await refreshWorkspace(currentProjectId());
              activateDetail("knowledge:library", id, "decision");
              pushToast("Decision saved locally.", "success");
            });
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not create knowledge.", "danger");
          });
        }}
        onCreateDoc={({ title, docType, tags, path, scopePath }) => {
          void justifyChange({
            title: "Justify new doc",
            defaultSummary: `Add ${docType}: ${title}`,
          }).then((change) => {
            if (!change) return;
            return persistKnowledgeCreate({
              projectId: currentProjectId(),
              kind: "doc",
              docType,
              tags,
              title,
              path,
              change,
            }).then(async (id) => {
              if (scopePath) await persistKnowledgeScope(currentProjectId(), id, scopePath);
              await refreshWorkspace(currentProjectId());
              activateDetail("knowledge:docs", id, "doc");
              pushToast("Doc saved locally.", "success");
            });
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not add the doc.", "danger");
          });
        }}
        onImportProjectSources={() => {
          if (importSourcesBusy()) return;
          setImportSourcesBusy(true);
          void persistImportProjectSources({ projectId: currentProjectId() })
            .then(async (result) => {
              await refreshWorkspace(currentProjectId());
              pushToast(result.message, "success");
            })
            .catch((error: unknown) => {
              pushToast(
                error instanceof Error ? error.message : "Could not import project sources.",
                "danger",
              );
            })
            .finally(() => setImportSourcesBusy(false));
        }}
        importBusy={importSourcesBusy()}
        onCreateCard={(title, stage, milestone) => createWorkCard(title, stage, milestone)}
        onNewFeature={openFeatureFlow}
        onContinueFeature={continueFeatureFlow}
        onArchive={(id) => {
          // Archiving is reversible, so it runs at once and the toast offers Undo.
          const title = workspace().docs.find((item) => item.id === id)?.title ?? "item";
          const restore = () => void persistKnowledgeArchived(id, false, { summary: `Restore: ${title}`, rationale: "Changed in Desktop" })
            .then(() => refreshWorkspace(currentProjectId()))
            .catch((error: unknown) => pushToast(error instanceof Error ? error.message : "Could not restore.", "danger"));
          void persistKnowledgeArchived(id, true, { summary: `Archive: ${title}`, rationale: "Changed in Desktop" })
            .then(async () => {
              await refreshWorkspace(currentProjectId());
              pushToast(`Archived “${title}”`, "default", { action: { label: "Undo", onClick: restore } });
            })
            .catch((error: unknown) => {
              pushToast(error instanceof Error ? error.message : "Could not archive.", "danger");
            });
        }}
        loadArchivedDocs={async () =>
          (await loadArchivedKnowledge(currentProjectId(), "doc")).map((item): ArchivedListItem => ({
            id: item.id,
            title: item.title,
            detail: item.tags.join(", "),
            archivedAt: formatArchiveDate(item.archivedAt),
          }))}
        onRestoreDoc={async (item) => {
          try {
            await persistKnowledgeArchived(item.id, false, { summary: `Restore: ${item.title}`, rationale: "Changed in Desktop" });
            await refreshWorkspace(currentProjectId());
            pushToast(`Restored “${item.title}”`);
          } catch (error) {
            pushToast(error instanceof Error ? error.message : "Could not restore.", "danger");
          }
        }}
        onDeleteDoc={async (item) => {
          const confirmed = await requestConfirm({
            title: `Delete “${item.title}” permanently?`,
            description: "The item, its body, and its links to other records are removed from this project.",
            recovery: "This cannot be undone.",
            confirmLabel: "Delete permanently",
          });
          if (!confirmed) return;
          try {
            await persistKnowledgeDeletePermanently(item.id, { summary: `Delete permanently: ${item.title}`, rationale: "Changed in Desktop" });
            pushToast(`Deleted “${item.title}”`);
          } catch (error) {
            pushToast(error instanceof Error ? error.message : "Could not delete.", "danger");
          }
        }}
        onRemoveCard={(slug) => {
          const title = workspace().workCards.find((card) => card.slug === slug)?.title ?? slug;
          const restore = () => void persistWorkRestoreCard(currentProjectId(), slug, { summary: `Restore card: ${slug}`, rationale: "Changed in Desktop" })
            .then(() => refreshWorkspace(currentProjectId()))
            .catch((error: unknown) => pushToast(error instanceof Error ? error.message : "Could not restore card.", "danger"));
          void persistWorkRemoveCard(currentProjectId(), slug, { summary: `Remove card: ${slug}`, rationale: "Changed in Desktop" })
            .then(async () => {
              await refreshWorkspace(currentProjectId());
              pushToast(`Removed “${title}” from the board`, "default", { action: { label: "Undo", onClick: restore } });
            })
            .catch((error: unknown) => {
              pushToast(error instanceof Error ? error.message : "Could not remove card.", "danger");
            });
        }}
        onSetCardStage={(slug, stage) =>
          // Resolves false when the change was cancelled or failed, so the board can roll back.
          justifyChange({
            title: "Justify card stage",
            defaultSummary: `Move card to ${stageLabel(stage)}: ${slug}`,
          }).then(async (change) => {
            if (!change) return false;
            await persistWorkSetStage(currentProjectId(), slug, stage, change);
            await refreshWorkspace(currentProjectId());
            pushToast(`Card moved to ${stageLabel(stage)}.`, "success");
            return true;
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not update card stage.", "danger");
            return false;
          })}
        onOpenComponent={(id) =>
          navigateToDetail(
            goSection(route(), "structure"),
            STRUCTURE_SCOPE,
            id,
            "arch-node",
          )
        }
      />
    );
  }

  function ProjectSettings(props: { embedded?: boolean; tab?: ProjectSettingsPageId }) {
    return (
      <ProjectSettingsDialog
        open
        embedded={props.embedded}
        tab={props.tab}
        onClose={() => applyRoute(closeDialog(route()), "silent")}
        general={workspace().settings}
        environments={workspace().settingsEnvironments}
        repositories={workspace().repositories}
        onAddRepository={async (draft) => {
          try {
            await persistAddProjectRepo(currentProjectId(), draft.name, draft.path);
            pushToast(`Repository "${draft.name}" added.`, "success");
            await refreshWorkspace(currentProjectId());
          } catch (error: unknown) {
            pushToast(error instanceof Error ? error.message : "Could not add repository.", "danger");
            throw error;
          }
        }}
        onRemoveRepository={async (name) => {
          try {
            await persistRemoveProjectRepo(currentProjectId(), name);
            pushToast(`Repository "${name}" removed.`, "success");
            await refreshWorkspace(currentProjectId());
          } catch (error: unknown) {
            pushToast(error instanceof Error ? error.message : "Could not remove repository.", "danger");
            throw error;
          }
        }}
        onBrowseRepository={async () => {
          const selected = await window.polterware.app.selectDirectory();
          return selected.path;
        }}
        onAgentsSyncChange={async (enabled) => {
          try {
            const written = await persistAgentsSync(currentProjectId(), enabled);
            pushToast(enabled
              ? `AGENTS.md sync on${written > 0 ? `: ${written} ${written === 1 ? "file" : "files"} updated` : ""}.`
              : "AGENTS.md sync off.", "success");
            await refreshWorkspace(currentProjectId());
          } catch (error: unknown) {
            pushToast(error instanceof Error ? error.message : "Could not change AGENTS.md sync.", "danger");
          }
        }}
        onSaveGeneral={(settings) => {
          void persistProjectSettings(
            currentProjectId(),
            settings,
            workspace().settingsEnvironments,
          ).then(async () => {
            pushToast("Project settings saved.", "success");
            await refreshWorkspace(currentProjectId());
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not save settings.", "danger");
          });
        }}
        onCreateEnvironment={(draft) => {
          void persistEnvironment({
            projectId: currentProjectId(),
            name: draft.name,
            kind: draft.kind,
            protection: draft.protection,
            existingCount: workspace().settingsEnvironments.length,
            settings: workspace().settings,
          }).then(async () => {
            pushToast(`Environment "${draft.name}" saved locally.`, "success");
            await refreshWorkspace(currentProjectId());
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not save environment.", "danger");
          });
        }}
        onSetDefaultEnvironment={(environmentId) => {
          const environment = workspace().settingsEnvironments.find((item) => item.id === environmentId);
          void persistEnvironmentDefault(workspace(), currentProjectId(), environmentId).then(async () => {
            pushToast(
              environment
                ? `${environment.name} is now the default environment.`
                : "Default environment updated.",
              "success",
            );
            await refreshWorkspace(currentProjectId());
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not update default environment.", "danger");
          });
        }}
        onDeleteEnvironment={(environmentId) => {
          const environment = workspace().settingsEnvironments.find((item) => item.id === environmentId);
          void persistDeleteEnvironment(currentProjectId(), environmentId).then(async () => {
            pushToast(
              environment
                ? `Environment "${environment.name}" deleted.`
                : "Environment deleted.",
              "success",
            );
            await refreshWorkspace(currentProjectId());
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not delete environment.", "danger");
          });
        }}
        onArchiveProject={() => {
          const projectId = currentProjectId();
          const name = workspace().settings.name;
          void persistArchiveProject(projectId).then(async () => {
            pushToast(`Project "${name}" archived.`, "success");
            const listed = await loadProjects();
            const fallback = listed.projects.find((project) => project.projectId !== projectId) ?? listed.projects[0];
            if (fallback) {
              selectProject(fallback.projectId);
              await refreshWorkspace(fallback.projectId);
            } else {
              loadedProjectId = "";
              setCreateProjectOpen(true);
              setWorkspace({ ...emptyWorkspace(), available: true, projects: [] });
              applyRoute(goHome(route()), "replace");
            }
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not archive project.", "danger");
          });
        }}
      />
    );
  }

  return (
    <Shell
      route={route}
      projects={workspace().projects}
      environments={workspace().environments}
      onNavigate={navigateSection}
      onProjectSelect={selectProject}
      onCreateProject={() => setCreateProjectOpen(true)}
      onSelectEnvironment={(environmentId) =>
        applyRoute(setEnvironment(route(), environmentId))
      }
      onOpenCommander={() => setPaletteOpen(true)}
      onOpenSettings={() => applyRoute(openDialog(route(), { type: "settings", tab: "general" }), "silent")}
      onOpenAppSettings={() => applyRoute(openDialog(route(), { type: "settings", tab: "agents-mcp" }), "silent")}
      onOpenProjectSettings={() => applyRoute(openDialog(route(), { type: "project-settings" }), "silent")}
      settingsOpen={settingsDialogScope() === "project"}
      appSettingsOpen={settingsDialogScope() === "app"}
      canGoBack={historyIndex() > 0}
      canGoForward={historyIndex() < history().length - 1}
      onBack={goBack}
      onForward={goForward}
      onGoHome={goProjectsHome}
      status={{ dataMode: dataMode() }}
      platform={PLATFORM_CONTEXT}
      navCounts={{
        inbox: {
          count: workspace().inbox.openCount,
          tone: workspace().inbox.blockingCount > 0 ? "danger" : "muted",
          label: `${workspace().inbox.openCount} open Inbox items, ${workspace().inbox.blockingCount} blocking`,
        },
      }}
    >
      <Suspense fallback={<PageLoading layout="page" label="Loading…" />}>
      <Show
        when={!isHomeRoute(route())}
        fallback={
          <ProjectsScreen
            projects={workspace().projects}
            loading={!bootstrapped()}
            unavailable={bootstrapped() && !workspace().available}
            message={workspace().healthMessage}
            onOpenProject={selectProject}
            onOpenProjectSettings={(projectId) => {
              selectProject(projectId);
              applyRoute(openDialog(route(), { type: "project-settings" }), "silent");
            }}
            onCreateProject={() => setCreateProjectOpen(true)}
          />
        }
      >
      <Switch>
        <Match when={route().section === "inbox"}>
          <InboxPage
            inbox={workspace().inbox}
            loading={loading() || !workspace().extensionsReady}
            onResolve={resolveInboxItem}
            scopeTokens={scopeTokens()}
            scopeNodes={scopeNodes()}
            scopeEnvironments={scopeEnvironmentCatalog()}
            onScopeTokensChange={applyScopeTokens}
            onCheckDrift={checkDrift}
          />
        </Match>

        <Match when={route().section === "canvas"}>
          <Show when={currentProjectId()} keyed>{(projectId) => <CanvasWorkspace projectId={projectId} workspace={workspace()} onReload={() => refreshWorkspace(projectId)} />}</Show>
        </Match>

        <Match when={route().section === "structure"}>
          <StructureView
            projectName={workspace().settings.name || "Project"}
            projectDescription={workspace().settings.description}
            projectRepository={workspace().settings.repository}
            nodes={filterStructureNodes(workspace().structure.nodes, scopeNodeIdList()).map((node) => ({ ...node, deploys: node.deploys?.filter((deploy) =>
              matchesEnvironment([deploy.environmentId, deploy.environment], scopeEnvironments())) }))}
            counts={structureCounts()}
            registryNodes={workspace().structure.nodes}
            projectCounts={{ work: workspace().workCards.length, decisions: workspace().decisions.length, facts: workspace().structureFacts.length }}
            error={structureError() || (!workspace().available ? workspace().healthMessage : undefined)}
            loading={!structureError() && workspace().available && (loading() || !workspace().extensionsReady)}
            createDialogOpen={route().dialog?.type === "arch-node-create"}
            onOpenCreate={() => applyRoute(openDialog(route(), { type: "arch-node-create" }), "silent")}
            onCloseCreate={() => applyRoute(closeDialog(route()), "silent")}
            onOpenNode={(id) => activateDetail(STRUCTURE_SCOPE, id, "arch-node")}
            onSelect={(id) => applyRoute(setSelectedNode(route(), id), "silent")}
            environments={workspace().settingsEnvironments.map((e) => ({ id: e.id, label: e.name, kind: e.kind, protected: e.protection === "strict" }))}
            integrations={workspace().integrations}
            scopeTokens={scopeTokens()}
            scopeNodes={scopeNodes()}
            scopeEnvironments={scopeEnvironmentCatalog()}
            onScopeTokensChange={applyScopeTokens}
            onDeploysChange={async (nodeId, deploys) => {
              const projectId = currentProjectId();
              if (!projectId) throw new Error("No project selected.");
              const node = workspace().structure.nodes.find((n) => n.id === nodeId);
              if (!node) throw new Error("Structure node not found.");
              const change = await justifyChange({ title: "Update deploys", defaultSummary: `Update deploys for ${node.title}` });
              if (!change) throw new Error("Cancelled.");
              await persistStructureUpdateDeploys({ projectId, path: node.path, title: node.title, level: node.level, deploys, change });
              await refreshWorkspace(projectId);
            }}
            onKindTechChange={async (nodeId, kind, tech) => {
              const projectId = currentProjectId();
              const node = workspace().structure.nodes.find((item) => item.id === nodeId);
              if (!projectId || !node) throw new Error("Structure node not found.");
              const change = await justifyChange({ title: "Update kind and technology", defaultSummary: `Describe what ${node.title} is` });
              if (!change) throw new Error("Cancelled.");
              await persistStructureKindTech({ projectId, path: node.path, title: node.title, level: node.level, kind, tech, change });
              await refreshWorkspace(projectId);
            }}
            onMove={async (nodeId, parentId) => {
              const nodes = workspace().structure.nodes;
              const node = nodes.find((item) => item.id === nodeId);
              const parent = nodes.find((item) => item.id === parentId);
              if (!node || !parent) throw new Error("Missing structure node.");
              const from = nodes.find((item) => item.id === node.parentId);
              const change = await justifyChange({
                title: "Move structure node",
                defaultSummary:
                  parent.level === "system" && from
                    ? `Move ${node.title} out of ${from.title}`
                    : `Move ${node.title} under ${parent.title}`,
              });
              if (!change) throw new Error("Cancelled.");
              await persistStructureMoveNode({
                projectId: currentProjectId(),
                path: node.path,
                title: node.title,
                level: node.level,
                under: parent.path,
                change,
              });
              await refreshWorkspace(currentProjectId());
            }}
            onUses={async (nodeId, targetIds) => {
              const nodes = workspace().structure.nodes;
              const source = nodes.find((node) => node.id === nodeId);
              if (!source) throw new Error("Missing structure node.");
              const change = await justifyChange({ title: "Update dependencies", defaultSummary: `Update dependencies of ${source.title}` });
              if (!change) throw new Error("Cancelled.");
              await persistStructureUses({ projectId: currentProjectId(), path: source.path, title: source.title, level: source.level,
                uses: nodes.filter((node) => targetIds.includes(node.id)).map((node) => node.path), change });
              await refreshWorkspace(currentProjectId());
            }}
            onCreate={async (draft) => {
              const nodes = workspace().structure.nodes;
              const parent = nodes.find((node) => node.id === draft.parentId);
              const change = await justifyChange({ title: "Add structure node", defaultSummary: `Add ${draft.title}${parent ? ` under ${parent.title}` : ""}` });
              if (!change) throw new Error("Cancelled.");
              await persistStructureCreateNode({ projectId: currentProjectId(), heading: uniqueStructureSlug(nodes, draft.title), title: draft.title,
                level: draft.level, under: parent?.path, change });
              await refreshWorkspace(currentProjectId());
              pushToast("Structure node added.", "success");
            }}
          />
        </Match>

        <Match when={route().section === "work"}>
          <KnowledgeSurface
            tab={route().tab}
            tabs={[...SECTION_TABS.work]}
            tabsLabel="Work"
          />
        </Match>

        <Match when={route().section === "truth" && route().tab === "decisions"}>
          <KnowledgeSurface
            tab="library"
            tabs={[...SECTION_TABS.truth]}
            activeTab={route().tab}
            tabsLabel="Truth"
          />
        </Match>

        <Match when={route().section === "truth" && route().tab === "docs"}>
          <KnowledgeSurface
            tab="docs"
            tabs={[...SECTION_TABS.truth]}
            activeTab={route().tab}
            tabsLabel="Truth"
          />
        </Match>

        <Match when={route().section === "truth" && route().tab === "facts"}>
          <TruthFactsPage
            projectId={currentProjectId()}
            scopeNodes={scopeNodeIdList()}
            scopeTokens={scopeTokens()}
            scopeCatalogNodes={scopeNodes()}
            scopeEnvironments={scopeEnvironmentCatalog()}
            onScopeTokensChange={applyScopeTokens}
            entities={workspace().canonEntities}
            loadFacts={loadFacts}
            loadEvidence={loadCanonEvidence}
            tab="facts"
            tabs={[...SECTION_TABS.truth]}
            tabsLabel="Truth"
            onTabChange={(tab) => applyRoute(setTab(route(), tab))}
            justifyChange={justifyChange}
          />
        </Match>

        <Match
          when={
            route().section === "dispatch"
            || route().section === "dispatch-routing"
            || route().section === "dispatch-usage"
          }
        >
          <DispatchPage
            projectId={currentProjectId()}
            tab={route().tab}
            tabs={dispatchTabsFor(route().section)}
            tabsLabel={dispatchTabsLabel(route().section)}
            onTabChange={(tab) => applyRoute(setTab(route(), tab))}
          />
        </Match>

        <Match when={route().section === "activity"}>
          <ActivityPage
            projectId={currentProjectId()}
            scopeNodes={scopeNodeIdList()}
            scopeTokens={scopeTokens()}
            scopeCatalogNodes={scopeNodes()}
            scopeEnvironments={scopeEnvironmentCatalog()}
            onScopeTokensChange={applyScopeTokens}
            loadChanges={loadChanges}
          />
        </Match>

      </Switch>
      </Show>
      </Suspense>

      <Show when={settingsDialogTab()}>
        <Suspense>
          <SettingsView
            open
            tab={settingsDialogTab() ?? undefined}
            onClose={() => {
              setConnectIntegration(null);
              applyRoute(closeDialog(route()), "silent");
            }}
            projectId={currentProjectId()}
            loading={loading()}
            onTabChange={(tab) => applyRoute(openDialog(route(), { type: "settings", tab: tab as ProjectSettingsTabId }), "silent")}
            renderProjectSettings={(tab) => <ProjectSettings embedded tab={tab} />}
            renderPlatforms={(tab) => (
              <IntegrationsView
                embedded
                projectId={currentProjectId()}
                providers={workspace().providers}
                connectOpen={connectIntegration() !== null}
                connectProviderId={connectIntegration()?.providerId}
                onOpenConnect={(providerId) => setConnectIntegration({ providerId })}
                onCloseConnect={() => setConnectIntegration(null)}
                integrations={workspace().integrations}
                resources={workspace().integrationResources}
                syncRuns={workspace().syncRuns}
                tab={tab}
                loading={loading() || !workspace().extensionsReady}
                onTabChange={(next) => applyRoute(openDialog(route(), { type: "settings", tab: next === "catalog" ? "platforms-catalog" : "platforms-connected" }), "silent")}
                onConnect={(provider) => {
                  void persistIntegrationConnection({
                    projectId: currentProjectId(),
                    environmentId: route().environmentId,
                    provider,
                  }).then(async () => {
                    await refreshWorkspace(currentProjectId());
                  }).catch((error: unknown) => {
                    pushToast(error instanceof Error ? error.message : "Could not save connection.", "danger");
                  });
                }}
                onSync={(integrationId) => {
                  void persistIntegrationSync({
                    connectionId: integrationId,
                  }).then(async (run) => {
                    if (run.result === "success") {
                      pushToast(run.message || "Integration inventory synced.", "success");
                    } else {
                      pushToast(run.message || "Integration inventory sync failed.", "danger");
                    }
                    await refreshWorkspace(currentProjectId());
                  }).catch((error: unknown) => {
                    pushToast(error instanceof Error ? error.message : "Could not refresh integration metadata.", "danger");
                  });
                }}
              />
            )}
            onResetLocalStore={() => {
              void resetLocalStore().then(async () => {
                pushToast("Local store reset to the demonstration project.", "success");
                applyRoute(createDefaultRoute("inbox", PLATFORM_CONTEXT), "replace");
                await refreshWorkspace("proj-polter");
              }).catch((error: unknown) => {
                pushToast(error instanceof Error ? error.message : "Could not reset the local store.", "danger");
              });
            }}
          />
        </Suspense>
      </Show>

      <Show when={route().dialog?.type === "project-settings"}>
        <Suspense>
          <ProjectSettings />
        </Suspense>
      </Show>

      <CreateProjectDialog
        open={createProjectOpen()}
        canCancel={workspace().projects.length > 0}
        onClose={() => {
          if (workspace().projects.length === 0) return;
          setCreateProjectOpen(false);
        }}
        onPickDirectory={async () => {
          const result = await window.polterware.app.selectDirectory();
          return result.path;
        }}
        onCreate={(input) => {
          void (async () => {
            const kinds = input.environments.filter(isEnvironmentKind);
            const created = await persistCreatedProject({
              ...input,
              environments: kinds.length > 0 ? kinds : ["development"],
            });
            setCreateProjectOpen(false);
            applyRoute(
              enterProject(route(), created.projectId, {
                environmentId: created.environmentId,
              }),
            );
            pushToast(`Created ${input.name}.`, "success");
            loadedProjectId = created.projectId;
            await refreshWorkspace(created.projectId);
          })().catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not create project.", "danger");
          });
        }}
      />

      <Show when={flowOpen()}>
        <Suspense>
          <NewFeatureFlow
            open={flowOpen()}
            step={flowStep()}
            review={flowReview()}
            components={flowComponents()}
            busy={flowBusy()}
            errors={flowErrors()}
            onStepChange={(step) => {
              setFlowErrors([]);
              setFlowStep(step);
            }}
            onClose={closeFeatureFlow}
            onCreate={(input) => {
              void runFlowWrite(
                { title: "Justify new feature", defaultSummary: `Create feature: ${input.title || input.intent.slice(0, 60)}` },
                (change) => persistFeatureCreate({ projectId: currentProjectId(), ...input, change }),
              ).then((review) => {
                if (review) setFlowStep("shape");
              });
            }}
            onAddLine={(line) => {
              const slug = flowReview()?.card.slug;
              if (!slug) return;
              const summary =
                line.kind === "under"
                  ? `Place ${slug} under ${line.path}`
                  : line.kind === "task"
                    ? `Add task to ${slug}: ${line.text}`
                    : line.kind === "question"
                      ? `Ask on ${slug}: ${line.text}`
                      : `Add invariant to ${slug}: ${line.text}`;
              void runFlowWrite(
                { title: "Justify feature change", defaultSummary: summary },
                (change) => persistFeatureLine(currentProjectId(), slug, line, change),
              );
            }}
            onAdvance={(step) => {
              const slug = flowReview()?.card.slug;
              if (!slug) return;
              void runFlowWrite(
                {
                  title: step === "contract" ? "Justify accepting the contract" : "Justify approving the plan",
                  defaultSummary: step === "contract" ? `Accept contract for ${slug}` : `Approve plan for ${slug}`,
                },
                (change) => persistFeatureAdvance({ projectId: currentProjectId(), slug, step, change }),
              ).then((review) => {
                if (review) setFlowStep("plan");
              });
            }}
          />
        </Suspense>
      </Show>

      <CommandPalette
        open={paletteOpen()}
        platform={PLATFORM_CONTEXT}
        onClose={() => setPaletteOpen(false)}
        onCommand={(id) => {
          setPaletteOpen(false);
          handlePaletteCommand(id);
        }}
      />
    </Shell>
  );
}
