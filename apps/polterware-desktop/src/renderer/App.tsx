import { Match, Show, Switch, Suspense, createEffect, createMemo, createSignal, lazy, onCleanup, onMount } from "solid-js";
import {
  Shell,
  CliReferencePage,
  InboxPage,
  ProjectsScreen,
  CreateProjectDialog,
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
import { ArchitectureView } from "@polterware/feature-architecture";
import type { ChangeEnvelope } from "@polterware/feature-knowledge/change-envelope";
import { hydrateAppearancePreferences, hydrateShortcutPreferences } from "@polterware/feature-settings/boot";
import type { ProjectSettingsPageId } from "@polterware/feature-settings";
import { CommandPalette } from "@polterware/feature-commander";
import { PageLoading, pushToast, type TabItem } from "@polterware/frontend-design-system";
import { detailDisplayFor, detailPanelStore, matchesShortcut } from "@polterware/frontend-state";
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
  import("@polterware/feature-settings").then((m) => ({ default: m.TruthFactsPage })),
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
  loadAtlas,
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
  persistDeleteView,
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
  persistKnowledgeScope,
  persistKnowledgeDelete,
  persistKnowledgeSourcePath,
  persistLayout,
  persistAddProjectRepo,
  persistProjectSettings,
  persistRemoveProjectRepo,
  persistView,
  persistDecisionAction,
  persistWorkCreateCard,
  persistFeatureAdvance,
  persistFeatureCreate,
  persistFeatureLine,
  loadFeatureReview,
  persistWorkRemoveCard,
  persistAtlasCreateNode,
  persistAtlasMoveNode,
  persistAtlasUses,
  persistWorkSetStage,
  resetLocalStore,
} from "./workspace/persist";

const SYSTEM_ID = "sys-local";
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

/** Local label so the lazily loaded Knowledge package stays out of the main bundle. */
function uniqueAtlasSlug(nodes: readonly { path: string; slug: string }[], title: string): string {
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

  async function refreshWorkspace(
    projectId = route().projectId ?? "",
    catalog?: ProjectCatalog,
  ) {
    if (!projectId) {
      setLoading(false);
      return;
    }
    try {
      const shell = await loadWorkspaceShell(projectId, catalog);
      if (loadedProjectId && loadedProjectId !== projectId) return;
      // Same project: keep the loaded extensions until the fresh ones land, so the
      // Atlas map never merges against an empty node list and loses its layout.
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
      if (!matchesShortcut("shell.toggle_commander", event)) return;
      event.preventDefault();
      setPaletteOpen((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown);
    const unsubscribeExecute = window.polterware.commander.onExecuteCommand((id: string) => {
      handlePaletteCommand(id);
    });
    // Live sync (Verdict 0007): writes from the CLI, MCP agents, or the TUI refresh
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
        const [workCards, atlas, inbox] = await Promise.all([
          loadWorkCards(projectId),
          loadAtlas(projectId),
          loadInbox(projectId),
        ]);
        if (currentProjectId() !== projectId) return;
        setWorkspace((current) => ({ ...current, workCards, atlas, inbox }));
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

  function navigateSection(section: string, tab?: string) {
    const base = routeWithProject(route());
    if (!base) return;
    const next = goSection(base, section);
    applyRoute(tab ? setTab(next, tab) : next);
  }

  function goProjectsHome() {
    if (isHomeRoute(route())) return;
    applyRoute(goHome(route()));
  }

  /** Evidence opens in the Evidence list; Verdicts open in the Decisions list. */
  const libraryScope = () =>
    route().section === "truth" && route().tab === "evidence" ? "knowledge:evidence" : "knowledge:library";

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
    if (id === "nav.agents") {
      applyRoute(openDialog(route(), { type: "settings", tab: "agents-mcp" }), "silent");
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
      applyRoute(openDialog(goSection(base, "atlas"), { type: "arch-node-create" }));
      return;
    }
    if (id === "action.connect-integration") {
      const current = route();
      const base = routeWithProject(current);
      if (!base) return;
      const onIntegrations = !isHomeRoute(current) && current.section === "integrations";
      const target = onIntegrations ? base : setTab(goSection(base, "integrations"), "catalog");
      applyRoute(openDialog(target, { type: "connect-integration" }), onIntegrations ? "silent" : "push");
    }
  }

  /** Scope tokens. Node tokens become scope_nodes; env tokens narrow on the client. */
  const [scopeTokens, setScopeTokens] = createSignal<ScopeFilterToken[]>([]);
  const scopeNodes = createMemo<ScopeNodeItem[]>(() =>
    workspace().atlas.nodes.map((node) => ({
      id: node.id,
      parentId: node.parentId,
      level: node.level,
      path: node.path,
      title: node.title,
    })),
  );
  const scopeNodeIdList = createMemo(() => scopeNodeIds(scopeTokens(), scopeNodes()));
  const scopeEnvironments = createMemo(() => {
    const selected = new Set(environmentIds(scopeTokens()));
    if (selected.size === 0) return [];
    return workspace()
      .environments.filter((environment) => selected.has(environment.id))
      .map((environment) => ({ id: environment.id, name: environment.name }));
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
    applyRoute(
      enterProject(route(), projectId, {
        environmentId: environment?.id,
      }),
    );
  }

  const currentProjectId = () => route().projectId ?? workspace().settings.projectId;

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
      const [workCards, atlas, inbox] = await Promise.all([
        loadWorkCards(projectId),
        loadAtlas(projectId),
        loadInbox(projectId),
      ]);
      if (currentProjectId() === projectId) setWorkspace((current) => ({ ...current, workCards, atlas, inbox }));
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Could not update the Inbox item.", "danger");
      throw error;
    }
  }

  /** Cards open in the Board or Specs detail scope, matching the visible Work tab. */
  const cardScopeId = () =>
    route().section === "work" && route().tab === "board" ? "knowledge:board" : "knowledge:specs";

  function createWorkCard(title: string) {
    void justifyChange({
      title: "Justify create card",
      defaultSummary: `Create card: ${title}`,
    }).then((change) => {
      if (!change) return;
      return persistWorkCreateCard({
        workspace: workspace(),
        projectId: currentProjectId(),
        title,
        change,
      }).then(async (slug) => {
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
    workspace().atlas.nodes
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

  /** Knowledge content hosted by Work and Truth with their own tab rails. */
  function KnowledgeSurface(surface: {
    tab: string;
    tabs: TabItem[];
    activeTab?: string;
    tabsLabel: string;
  }) {
    return (
      <KnowledgeView
        verdicts={workspace().verdicts}
        evidence={workspace().evidence}
        workCards={workspace().workCards}
        entities={workspace().canonEntities}
        tab={surface.tab}
        tabs={surface.tabs}
        activeTab={surface.activeTab}
        tabsLabel={surface.tabsLabel}
        loading={loading() || !workspace().extensionsReady}
        onTabChange={(tab) => applyRoute(setTab(route(), tab))}
        onOpenEvidence={(id) => activateDetail("knowledge:evidence", id, "evidence")}
        onOpenVerdict={(id) => activateDetail(libraryScope(), id, "verdict")}
        onDecisionAction={(verdictId, action) => {
          const verdict = workspace().verdicts.find((item) => item.id === verdictId);
          if (!verdict) return;
          const successor = action.kind === "supersede"
            ? workspace().verdicts.find((item) => item.id === action.byId)
            : undefined;
          const summaries = {
            activate: `Activate decision: ${verdict.title}`,
            reactivate: `Keep decision active after review: ${verdict.title}`,
            challenge: `Open review of decision: ${verdict.title}`,
            supersede: `Supersede ${verdict.title} with ${successor?.title ?? "another decision"}`,
          } as const;
          void justifyChange({
            title: "Justify decision change",
            defaultSummary: summaries[action.kind],
          }).then((change) => {
            if (!change) return;
            return persistDecisionAction({ projectId: currentProjectId(), verdict, action, change }).then(async () => {
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
            applyRoute(setTab(goSection(route(), "atlas"), "map"));
            activateDetail("architecture:canvas", refId, "arch-node");
          }
        }}
        onLinkEntity={(knowledgeId, entityId, kind) => {
          const predicate = kind === "resource" || kind === "component"
            ? (workspace().evidence.some((item) => item.id === knowledgeId && item.tags.includes("runbook")) ? "OPERATES" : "DOCUMENTS")
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
            title: "Justify evidence rename",
            defaultSummary: "Rename evidence",
          }).then((change) => {
            if (!change) return;
            return persistKnowledgeTitle(workspace(), currentProjectId(), id, title, change);
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not rename evidence.", "danger");
          });
        }}
        onSaveTags={(id, tags) => {
          void justifyChange({
            title: "Justify evidence tags",
            defaultSummary: "Update evidence tags",
          }).then((change) => {
            if (!change) return;
            return persistKnowledgeTags(workspace(), currentProjectId(), id, tags, change);
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not save tags.", "danger");
          });
        }}
        scopeNodes={scopeNodes()}
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
        onCreate={(kind, title, scope, scopePath) => {
          void justifyChange({
            title: "Justify create",
            defaultSummary: `Create ${kind}: ${title}`,
          }).then((change) => {
            if (!change) return;
            return persistKnowledgeCreate({
              projectId: currentProjectId(),
              kind,
              title,
              extraJson: scope === "principle" ? JSON.stringify({ scope: "principle" }) : undefined,
              change,
            }).then(async (id) => {
              if (scopePath) await persistKnowledgeScope(currentProjectId(), id, scopePath);
              await refreshWorkspace(currentProjectId());
              activateDetail("knowledge:library", id, "verdict");
              pushToast("Verdict saved locally.", "success");
            });
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not create knowledge.", "danger");
          });
        }}
        onCreateEvidence={({ title, tags, path, scopePath }) => {
          void justifyChange({
            title: "Justify create evidence",
            defaultSummary: `Create evidence: ${title}`,
          }).then((change) => {
            if (!change) return;
            return persistKnowledgeCreate({
              projectId: currentProjectId(),
              kind: "evidence",
              title,
              tags,
              path,
              change,
            }).then(async (id) => {
              if (scopePath) await persistKnowledgeScope(currentProjectId(), id, scopePath);
              await refreshWorkspace(currentProjectId());
              activateDetail("knowledge:evidence", id, "evidence");
              pushToast("Evidence saved locally.", "success");
            });
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not create evidence.", "danger");
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
        onCreateFromTemplate={(template) => {
          if (template.kind === "card") {
            createWorkCard(template.title);
            return;
          }
          const isVerdict = template.kind === "verdict";
          // Evidence has no type: the template only seeds a tag.
          const templateTag = template.kind === "doc" ? "documentation" : template.kind;
          void justifyChange({
            title: "Justify create",
            defaultSummary: `Create ${isVerdict ? "verdict" : "evidence"}: ${template.title}`,
          }).then((change) => {
            if (!change) return;
            return persistKnowledgeCreate({
              projectId: currentProjectId(),
              kind: isVerdict ? "verdict" : "evidence",
              title: template.title,
              body: template.body,
              extraJson: template.extraJson,
              tags: isVerdict ? undefined : [templateTag],
              change,
            }).then(async (id) => {
              await refreshWorkspace(currentProjectId());
              if (isVerdict) {
                activateDetail("knowledge:library", id, "verdict");
                pushToast("Verdict saved locally.", "success");
              } else {
                activateDetail("knowledge:evidence", id, "evidence");
                pushToast("Evidence saved locally.", "success");
              }
            });
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not create knowledge.", "danger");
          });
        }}
        onCreateCard={(title) => createWorkCard(title)}
        onNewFeature={openFeatureFlow}
        onContinueFeature={continueFeatureFlow}
        onArchive={(id) => {
          void justifyChange({
            title: "Justify archive",
            defaultSummary: "Archive knowledge item",
          }).then((change) => {
            if (!change) return;
            return persistKnowledgeDelete(id, change).then(async () => {
              pushToast("Knowledge archived.", "success");
              await refreshWorkspace(currentProjectId());
            });
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not archive knowledge.", "danger");
          });
        }}
        onRemoveCard={(slug) => {
          void justifyChange({
            title: "Justify remove card",
            defaultSummary: `Remove card: ${slug}`,
          }).then((change) => {
            if (!change) return;
            return persistWorkRemoveCard(currentProjectId(), slug, change).then(async () => {
              pushToast("Card removed from the board.", "success");
              await refreshWorkspace(currentProjectId());
            });
          }).catch((error: unknown) => {
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
            setTab(goSection(route(), "atlas"), "map"),
            "architecture:canvas",
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
      scopeNodes={scopeNodes()}
      scopeTokens={scopeTokens()}
      onScopeTokensChange={applyScopeTokens}
      onNavigate={navigateSection}
      onProjectSelect={selectProject}
      onCreateProject={() => setCreateProjectOpen(true)}
      onSelectEnvironment={(environmentId) =>
        applyRoute(setEnvironment(route(), environmentId))
      }
      onOpenCommander={() => setPaletteOpen(true)}
      onOpenSettings={() => applyRoute(openDialog(route(), { type: "settings", tab: "general" }), "silent")}
      onOpenProjectSettings={() => applyRoute(openDialog(route(), { type: "project-settings" }), "silent")}
      settingsOpen={settingsDialogTab() !== null}
      onOpenCliReference={() => navigateSection("cli")}
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
          />
        </Match>

        <Match when={route().section === "atlas"}>
          <ArchitectureView
            systems={[{ id: SYSTEM_ID, name: workspace().settings.name || "Polterware" }]}
            resources={workspace().integrationResources.filter((resource) =>
              matchesEnvironment(
                resource.environment ? [resource.environment] : [],
                scopeEnvironments(),
              ),
            ).map((resource) => ({
              id: resource.id,
              name: resource.name,
              type: resource.kind,
              source: workspace().integrations.find((item) => item.id === resource.integrationId)?.provider,
              environmentLabel: resource.environment === "All" ? undefined : resource.environment,
              systemId: SYSTEM_ID,
            }))}
            layoutBody={workspace().layoutBody}
            layoutRevision={workspace().layoutRevision}
            dataSource="empty"
            fixtureMode="off"
            loading={loading()}
            inspector={{
              knowledge: (() => {
                const nodeId = route().selectedNodeId;
                if (!nodeId) return [];
                const entity = workspace().canonEntities.find(
                  (item) => item.kind === "component" && item.refId === nodeId,
                );
                if (!entity) return [];
                const linked = [
                  ...workspace().evidence,
                  ...workspace().verdicts,
                ].flatMap((item) =>
                  item.entityLinks.some((link) => link.entityId === entity.id)
                    ? [{ id: item.id, title: item.title, body: "summary" in item ? item.summary : "" }]
                    : [],
                );
                return linked;
              })(),
            }}
            tab={route().tab}
            search={route().search}
            selectedNodeId={route().selectedNodeId}
            views={workspace().views.filter((view) =>
              matchesEnvironment(view.environments, scopeEnvironments()),
            )}
            createDialogOpen={route().dialog?.type === "arch-node-create"}
            onSelect={(id) => applyRoute(setSelectedNode(route(), id), "silent")}
            onOpenNode={(id) => activateDetail("architecture:canvas", id, "arch-node")}
            onTabChange={(tab) => applyRoute(setTab(route(), tab))}
            onCreateNode={() =>
              applyRoute(openDialog(route(), { type: "arch-node-create" }), "silent")
            }
            onCloseCreateNode={() => applyRoute(closeDialog(route()), "silent")}
            atlasNodes={workspace().atlas.nodes}
            cards={workspace().workCards}
            onReparentNode={async (nodeId, parentId) => {
              const nodes = workspace().atlas.nodes;
              const node = nodes.find((item) => item.id === nodeId);
              const parent = nodes.find((item) => item.id === parentId);
              if (!node || !parent) throw new Error("Missing atlas node.");
              const from = nodes.find((item) => item.id === node.parentId);
              const change = await justifyChange({
                title: "Move atlas node",
                defaultSummary:
                  parent.level === "system" && from
                    ? `Move ${node.title} out of ${from.title}`
                    : `Move ${node.title} under ${parent.title}`,
              });
              if (!change) throw new Error("Cancelled.");
              await persistAtlasMoveNode({
                projectId: currentProjectId(),
                path: node.path,
                title: node.title,
                level: node.level,
                under: parent.path,
                change,
              });
              await refreshWorkspace(currentProjectId());
            }}
            onConnectNodes={async (sourceId, targetId) => {
              const nodes = workspace().atlas.nodes;
              const source = nodes.find((item) => item.id === sourceId);
              const target = nodes.find((item) => item.id === targetId);
              if (!source || !target) throw new Error("Missing atlas node.");
              const uses = source.uses ?? [];
              if (uses.includes(target.path)) return;
              const change = await justifyChange({
                title: "Connect atlas nodes",
                defaultSummary: `${source.title} uses ${target.title}`,
              });
              if (!change) return;
              await persistAtlasUses({
                projectId: currentProjectId(),
                path: source.path,
                title: source.title,
                level: source.level,
                uses: [...uses, target.path],
                change,
              });
              await refreshWorkspace(currentProjectId());
            }}
            onDisconnectNodes={async (sourceId, targetId) => {
              const nodes = workspace().atlas.nodes;
              const source = nodes.find((item) => item.id === sourceId);
              const target = nodes.find((item) => item.id === targetId);
              if (!source || !target) throw new Error("Missing atlas node.");
              const change = await justifyChange({
                title: "Remove atlas connection",
                defaultSummary: `${source.title} no longer uses ${target.title}`,
              });
              // Model edges stay drawn until uses: changes, so a cancel needs no undo.
              if (!change) return;
              await persistAtlasUses({
                projectId: currentProjectId(),
                path: source.path,
                title: source.title,
                level: source.level,
                uses: (source.uses ?? []).filter((path) => path !== target.path),
                change,
              });
              await refreshWorkspace(currentProjectId());
            }}
            onCreateNestedNode={async (parentId) => {
              const nodes = workspace().atlas.nodes;
              const parent = parentId ? nodes.find((item) => item.id === parentId) : undefined;
              const level = !parent ? "system" : parent.level === "system" ? "domain" : "component";
              const title = level === "system" ? "New system" : level === "domain" ? "New domain" : "New component";
              const heading = uniqueAtlasSlug(nodes, title);
              const change = await justifyChange({
                title: "Add atlas node",
                defaultSummary: parent ? `Add ${title} under ${parent.title}` : `Add ${title}`,
              });
              if (!change) return;
              try {
                await persistAtlasCreateNode({
                  projectId: currentProjectId(),
                  heading,
                  title,
                  level,
                  under: parent?.path,
                  change,
                });
                await refreshWorkspace(currentProjectId());
                pushToast("Card added to the map.", "success");
              } catch (error: unknown) {
                pushToast(error instanceof Error ? error.message : "Could not add the card.", "danger");
              }
            }}
            onSubmitCreateNode={(result) => {
              applyRoute(closeDialog(route()), "silent");
              if (!result.ok) {
                pushToast(result.error || "Could not save architecture node.", "danger");
                return;
              }
              pushToast("Architecture node saved to the local canvas.", "success");
            }}
            onSaveLayout={async (bodyJson, expectedRevision) => {
              const result = await persistLayout(currentProjectId(), bodyJson, expectedRevision);
              setWorkspace((current) => {
                if (
                  current.layoutBody === bodyJson &&
                  current.layoutRevision === result.revision
                ) {
                  return current;
                }
                return {
                  ...current,
                  layoutBody: bodyJson,
                  layoutRevision: result.revision,
                };
              });
              return result;
            }}
            onSaveView={(draft) =>
              persistView({
                projectId: currentProjectId(),
                ...draft,
              }).then(async () => {
                pushToast("View saved locally.", "success");
                await refreshWorkspace(currentProjectId());
              }).catch((error: unknown) => {
                pushToast(error instanceof Error ? error.message : "Could not save view.", "danger");
                throw error;
              })
            }
            onDeleteView={(id) =>
              persistDeleteView(id).then(async () => {
                pushToast("View deleted.", "success");
                await refreshWorkspace(currentProjectId());
              }).catch((error: unknown) => {
                pushToast(error instanceof Error ? error.message : "Could not delete view.", "danger");
                throw error;
              })
            }
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

        <Match when={route().section === "truth" && route().tab === "evidence"}>
          <KnowledgeSurface
            tab="evidence"
            tabs={[...SECTION_TABS.truth]}
            activeTab={route().tab}
            tabsLabel="Truth"
          />
        </Match>

        <Match when={route().section === "truth" && route().tab === "facts"}>
          <TruthFactsPage
            projectId={currentProjectId()}
            scopeNodes={scopeNodeIdList()}
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

        <Match when={route().section === "integrations"}>
          <Show when={currentProjectId()} keyed>
            {(projectId) => (
              <IntegrationsView
                projectId={projectId}
                providers={workspace().providers}
                connectOpen={route().dialog?.type === "connect-integration"}
                connectProviderId={(() => {
                  const dialog = route().dialog;
                  return dialog?.type === "connect-integration" ? dialog.providerId : undefined;
                })()}
                onOpenConnect={(providerId) => applyRoute(openDialog(route(), { type: "connect-integration", providerId }), "silent")}
                onCloseConnect={() => applyRoute(closeDialog(route()), "silent")}
                integrations={workspace().integrations}
                resources={workspace().integrationResources}
                syncRuns={workspace().syncRuns}
                tab={route().tab}
                loading={loading() || !workspace().extensionsReady}
                onTabChange={(next) => applyRoute(setTab(route(), next))}
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
          </Show>
        </Match>

        <Match when={route().section === "activity"}>
          <ActivityPage
            projectId={currentProjectId()}
            scopeNodes={scopeNodeIdList()}
            loadChanges={loadChanges}
          />
        </Match>

        <Match when={route().section === "cli"}>
          <CliReferencePage />
        </Match>
      </Switch>
      </Show>
      </Suspense>

      <Show when={settingsDialogTab()}>
        <Suspense>
          <SettingsView
            open
            tab={settingsDialogTab() ?? undefined}
            onClose={() => applyRoute(closeDialog(route()), "silent")}
            projectId={currentProjectId()}
            loading={loading()}
            onTabChange={(tab) => applyRoute(openDialog(route(), { type: "settings", tab: tab as ProjectSettingsTabId }), "silent")}
            renderProjectSettings={(tab) => <ProjectSettings embedded tab={tab} />}
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
