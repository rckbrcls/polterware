import { Match, Show, Switch, Suspense, createEffect, createSignal, lazy, onCleanup, onMount } from "solid-js";
import {
  Shell,
  CliReferencePage,
  InboxPage,
  CreateProjectDialog,
  createDefaultRoute,
  goSection,
  enterProject,
  setTab,
  openDialog,
  closeDialog,
  setSearch,
  setFilters,
  setSelectedNode,
  setEnvironment,
  historySnapshot,
  ensureRouteAvailable,
  routesEqual,
  SECTION_TABS,
  type ClientRoute,
  type EnvironmentItem,
  type FeatureFlowStep,
  type ProjectSettingsTabId,
  type WorkspaceFeatureReview,
  type LocalCoreStatus,
  type WorkspaceInboxAction,
  type WorkspaceInboxItem,
} from "@polterware/feature-shell";
import { ArchitectureView } from "@polterware/feature-architecture";
import type { ChangeEnvelope } from "@polterware/feature-knowledge/change-envelope";
import { hydrateAppearancePreferences, hydrateShortcutPreferences } from "@polterware/feature-settings/boot";
import { CommandPalette } from "@polterware/feature-commander";
import { PageLoading, pushToast, type TabItem } from "@polterware/frontend-design-system";
import { detailPanelStore, matchesShortcut } from "@polterware/frontend-state";
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
const NewFeatureFlow = lazy(() =>
  import("@polterware/feature-knowledge").then((m) => ({ default: m.NewFeatureFlow })),
);
const TruthFactsPage = lazy(() =>
  import("@polterware/feature-settings").then((m) => ({ default: m.TruthFactsPage })),
);
const ActivityPage = lazy(() =>
  import("@polterware/feature-settings").then((m) => ({ default: m.ActivityPage })),
);

import {
  emptyWorkspace,
  loadProjects,
  loadWorkCards,
  loadAtlas,
  loadInbox,
  loadWorkspaceExtensions,
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
  persistKnowledgeCreate,
  persistKnowledgeDelete,
  persistKnowledgeDuplicate,
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

export function App() {
  const initialRoute = createDefaultRoute("inbox", PLATFORM_CONTEXT);
  const [route, setRoute] = createSignal<ClientRoute>(initialRoute);
  const [history, setHistory] = createSignal<ClientRoute[]>([historySnapshot(initialRoute)]);
  const [historyIndex, setHistoryIndex] = createSignal(0);
  const [paletteOpen, setPaletteOpen] = createSignal(false);
  const [coreStatus, setCoreStatus] = createSignal<LocalCoreStatus | null>(null);
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
      const preferredId =
        (route().projectId && listed.projects.some((project) => project.projectId === route().projectId)
          ? route().projectId
          : undefined)
        ?? listed.projects[0]?.projectId;
      if (!preferredId) {
        setLoading(false);
        setBootstrapped(true);
        return;
      }
      if (route().projectId !== preferredId) {
        const environment = listed.environments.find((item) => item.projectId === preferredId);
        applyRoute(
          enterProject(route(), preferredId, { environmentId: environment?.id }),
          "replace",
        );
      }
      loadedProjectId = preferredId;
      await refreshWorkspace(preferredId, listed);
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
    // Live sync (ADR 0007): writes from the CLI, MCP agents, or the TUI refresh
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
    const unsubscribeCoreStatus = window.polterware.core.onStatusChange?.(setCoreStatus);
    void window.polterware.app
      .getCoreStatus?.()
      .then(setCoreStatus)
      .catch((error: unknown) => console.warn("Core status unavailable.", error));
    onCleanup(() => {
      unsubscribeCoreStatus?.();
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

  function navigateSection(section: string) {
    applyRoute(goSection(route(), section));
  }

  /** Docs and runbooks open in the Evidence list; ADRs open in the Decisions list. */
  const libraryScope = () =>
    route().section === "truth" && route().tab === "evidence" ? "knowledge:evidence" : "knowledge:library";

  function activateDetail(scopeId: string, entityId: string, entityKind: string) {
    detailPanelStore.getState().activateTarget({ scopeId, entityId, entityKind });
  }

  function navigateToDetail(
    nextRoute: ClientRoute,
    scopeId: string,
    entityId: string,
    entityKind: string,
  ) {
    detailPanelStore.getState().requestTarget({ scopeId, entityId, entityKind });
    applyRoute(nextRoute);
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
      applyRoute(openDialog(route(), { type: "settings", tab: "agents-access" }), "silent");
      return;
    }
    if (id === "nav.integrations") {
      applyRoute(openDialog(route(), { type: "settings", tab: "integrations-connected" }), "silent");
      return;
    }
    if (id.startsWith("nav.")) {
      navigateSection(id.slice(4));
      return;
    }
    if (id === "action.open-sync") {
      applyRoute(openDialog(route(), { type: "settings", tab: "advanced" }), "silent");
      return;
    }
    if (id === "action.create-node") {
      applyRoute(openDialog(goSection(route(), "atlas"), { type: "arch-node-create" }));
      return;
    }
    if (id === "action.connect-integration") {
      applyRoute(openDialog(route(), { type: "settings", tab: "integrations-catalog" }), "silent");
    }
  }

  function selectProject(projectId: string) {
    const environment =
      workspace().environments.find((item) => item.projectId === projectId) ?? workspace().environments[0];
    applyRoute(
      enterProject(route(), projectId, {
        environmentId: environment?.id,
      }),
    );
  }

  const currentProjectId = () => route().projectId ?? workspace().settings.projectId;

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
    libraryKinds?: ("doc" | "adr" | "runbook" | "source")[];
  }) {
    return (
      <KnowledgeView
        documents={workspace().documents}
        adrs={workspace().adrs}
        runbooks={workspace().runbooks}
        sources={workspace().sources}
        workCards={workspace().workCards}
        entities={workspace().ppmEntities}
        tab={surface.tab}
        tabs={surface.tabs}
        activeTab={surface.activeTab}
        tabsLabel={surface.tabsLabel}
        libraryKinds={surface.libraryKinds}
        loading={loading() || !workspace().extensionsReady}
        onTabChange={(tab) => applyRoute(setTab(route(), tab))}
        onOpenDoc={(id) => activateDetail(libraryScope(), id, "document")}
        onOpenAdr={(id) => activateDetail(libraryScope(), id, "adr")}
        onDecisionAction={(adrId, action) => {
          const adr = workspace().adrs.find((item) => item.id === adrId);
          if (!adr) return;
          const successor = action.kind === "supersede"
            ? workspace().adrs.find((item) => item.id === action.byId)
            : undefined;
          const summaries = {
            activate: `Activate decision: ${adr.title}`,
            reactivate: `Keep decision active after review: ${adr.title}`,
            challenge: `Open review of decision: ${adr.title}`,
            supersede: `Supersede ${adr.title} with ${successor?.title ?? "another decision"}`,
          } as const;
          void justifyChange({
            title: "Justify decision change",
            defaultSummary: summaries[action.kind],
          }).then((change) => {
            if (!change) return;
            return persistDecisionAction({ projectId: currentProjectId(), adr, action, change }).then(async () => {
              await refreshWorkspace(currentProjectId());
              pushToast("Decision updated.", "success");
            });
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not update the decision.", "danger");
          });
        }}
        onOpenRunbook={(id) => activateDetail(libraryScope(), id, "runbook")}
        onOpenSource={(id) => activateDetail("knowledge:evidence", id, "source")}
        onOpenCard={(slug) => activateDetail(cardScopeId(), slug, "card")}
        onOpenEntity={(_entityId, refId, kind) => {
          if (kind === "component") {
            applyRoute(setTab(goSection(route(), "atlas"), "map"));
            activateDetail("architecture:canvas", refId, "arch-node");
          }
        }}
        onLinkEntity={(knowledgeId, entityId, kind) => {
          const predicate = kind === "resource" || kind === "component"
            ? (workspace().runbooks.some((item) => item.id === knowledgeId) ? "OPERATES" : "DOCUMENTS")
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
        onCreate={(kind, title, scope) => {
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
              await refreshWorkspace(currentProjectId());
              if (kind === "runbook") {
                activateDetail(libraryScope(), id, "runbook");
                pushToast("Runbook saved locally.", "success");
              } else if (kind === "adr") {
                activateDetail(libraryScope(), id, "adr");
                pushToast("ADR saved locally.", "success");
              } else {
                activateDetail(libraryScope(), id, "document");
                pushToast("Document saved locally.", "success");
              }
            });
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not create knowledge.", "danger");
          });
        }}
        onCreateSource={({ title, path }) => {
          void justifyChange({
            title: "Justify create source",
            defaultSummary: `Create source: ${title}`,
          }).then((change) => {
            if (!change) return;
            return persistKnowledgeCreate({
              projectId: currentProjectId(),
              kind: "source",
              title,
              extraJson: JSON.stringify({ path }),
              change,
            }).then(async (id) => {
              await refreshWorkspace(currentProjectId());
              activateDetail("knowledge:evidence", id, "source");
              pushToast("Source saved locally.", "success");
            });
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not create source.", "danger");
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
          const kind = template.kind;
          if (kind !== "doc" && kind !== "runbook" && kind !== "adr" && kind !== "source") {
            return;
          }
          void justifyChange({
            title: "Justify create",
            defaultSummary: `Create ${kind}: ${template.title}`,
          }).then((change) => {
            if (!change) return;
            return persistKnowledgeCreate({
              projectId: currentProjectId(),
              kind,
              title: template.title,
              body: template.body,
              extraJson: template.extraJson,
              change,
            }).then(async (id) => {
              await refreshWorkspace(currentProjectId());
              if (kind === "runbook") {
                activateDetail(libraryScope(), id, "runbook");
                pushToast("Runbook saved locally.", "success");
              } else if (kind === "adr") {
                activateDetail(libraryScope(), id, "adr");
                pushToast("ADR saved locally.", "success");
              } else if (kind === "source") {
                activateDetail("knowledge:evidence", id, "source");
                pushToast("Source saved locally.", "success");
              } else {
                activateDetail(libraryScope(), id, "document");
                pushToast("Document saved locally.", "success");
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
        onDuplicate={(id) => {
          void justifyChange({
            title: "Justify duplicate",
            defaultSummary: "Duplicate knowledge item",
          }).then((change) => {
            if (!change) return;
            return persistKnowledgeDuplicate(workspace(), currentProjectId(), id, change).then(async (nextId) => {
              await refreshWorkspace(currentProjectId());
              if (nextId) activateDetail(libraryScope(), nextId, "runbook");
              pushToast("Runbook duplicated.", "success");
            });
          }).catch((error: unknown) => {
            pushToast(error instanceof Error ? error.message : "Could not duplicate runbook.", "danger");
          });
        }}
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
      settingsOpen={settingsDialogTab() !== null}
      onOpenCliReference={() => navigateSection("cli")}
      coreStatus={{
        status: coreStatus(),
        onStart: async () => setCoreStatus(await window.polterware.app.startCore()),
        onStop: async () => setCoreStatus(await window.polterware.app.stopCore()),
        onRestart: async () => setCoreStatus(await window.polterware.app.restartCore()),
        onRevealLogs: () => window.polterware.app.revealCoreLogs(),
        onCopy: (text) => navigator.clipboard.writeText(text),
      }}
      canGoBack={historyIndex() > 0}
      canGoForward={historyIndex() < history().length - 1}
      onBack={goBack}
      onForward={goForward}
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
            resources={workspace().integrationResources.map((resource) => ({
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
                const entity = workspace().ppmEntities.find(
                  (item) => item.kind === "component" && item.refId === nodeId,
                );
                if (!entity) return [];
                const linked = [
                  ...workspace().documents,
                  ...workspace().adrs,
                  ...workspace().runbooks,
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
            views={workspace().views}
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
            libraryKinds={["adr"]}
          />
        </Match>

        <Match when={route().section === "truth" && route().tab === "evidence"}>
          <KnowledgeSurface
            tab="evidence"
            tabs={[...SECTION_TABS.truth]}
            activeTab={route().tab}
            tabsLabel="Truth"
            libraryKinds={["source", "doc", "runbook"]}
          />
        </Match>

        <Match when={route().section === "truth" && route().tab === "facts"}>
          <TruthFactsPage
            projectId={currentProjectId()}
            tab="facts"
            tabs={[...SECTION_TABS.truth]}
            tabsLabel="Truth"
            onTabChange={(tab) => applyRoute(setTab(route(), tab))}
            justifyChange={justifyChange}
          />
        </Match>

        <Match when={route().section === "activity"}>
          <ActivityPage projectId={currentProjectId()} />
        </Match>

        <Match when={route().section === "cli"}>
          <CliReferencePage />
        </Match>
      </Switch>
      </Suspense>

      <Show when={settingsDialogTab()}>
        <Suspense>
          <SettingsView
            open
            tab={settingsDialogTab() ?? undefined}
            onClose={() => applyRoute(closeDialog(route()), "silent")}
            projectId={currentProjectId()}
            general={workspace().settings}
            environments={workspace().settingsEnvironments}
            repositories={workspace().repositories}
            loading={loading()}
            onTabChange={(tab) => applyRoute(openDialog(route(), { type: "settings", tab: tab as ProjectSettingsTabId }), "silent")}
            renderIntegrations={(integrationsTab, setIntegrationsTab) => (
              <IntegrationsView
                projectId={currentProjectId()}
                providers={workspace().providers}
                integrations={workspace().integrations}
                resources={workspace().integrationResources}
                syncRuns={workspace().syncRuns}
                tab={integrationsTab}
                loading={loading() || !workspace().extensionsReady}
                onTabChange={(next) => setIntegrationsTab(next as "connected" | "catalog")}
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
                }
              }).catch((error: unknown) => {
                pushToast(error instanceof Error ? error.message : "Could not archive project.", "danger");
              });
            }}
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
