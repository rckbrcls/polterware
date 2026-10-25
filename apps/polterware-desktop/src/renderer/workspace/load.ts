import type { ArchViewCard } from "@polterware/feature-architecture";
import type { ProjectEnvironment, ProjectGeneralSettings, ProjectRepository } from "@polterware/feature-settings";
import type {
  EnvironmentItem,
  ProjectSwitcherItem,
  WorkspaceCatalogProvider,
  WorkspaceEvidence,
  WorkspaceVerdict,
  WorkspaceCanonEntity,
  WorkspaceIntegration,
  WorkspaceIntegrationResource,
  WorkspaceIntegrationSyncRun,
  WorkspaceInbox,
  WorkspaceAtlas,
  WorkspaceAtlasHistoryEntry,
  WorkspaceWorkCard,
} from "@polterware/feature-shell";
import { asNumber, asObjectArray, asRecord, asString } from "./format";
import {
  mapVerdicts,
  mapAtlasHistory,
  mapConnections,
  mapEvidence,
  mapEnvironments,
  mapIntegrationResources,
  mapKnowledgeEntityLinks,
  mapCanonEntities,
  mapProjects,
  mapProviders,
  mapProjectRepos,
  mapSettings,
  mapSettingsEnvironments,
  mapSyncRuns,
  mapInbox,
  mapAtlas,
  mapWorkCards,
  mapViews,
} from "./map-records";

export type WorkspaceSnapshot = {
  available: boolean;
  quarantined: boolean;
  healthMessage: string;
  extensionsReady: boolean;
  projects: ProjectSwitcherItem[];
  environments: EnvironmentItem[];
  settingsEnvironments: ProjectEnvironment[];
  settings: ProjectGeneralSettings;
  repositories: ProjectRepository[];
  evidence: WorkspaceEvidence[];
  verdicts: WorkspaceVerdict[];
  workCards: WorkspaceWorkCard[];
  atlas: WorkspaceAtlas;
  inbox: WorkspaceInbox;
  canonEntities: WorkspaceCanonEntity[];
  providers: WorkspaceCatalogProvider[];
  integrations: WorkspaceIntegration[];
  integrationResources: WorkspaceIntegrationResource[];
  syncRuns: WorkspaceIntegrationSyncRun[];
  views: ArchViewCard[];
  layoutBody: string;
  layoutRevision: number;
  rawKnowledge: Record<string, unknown>[];
};

/** Extension-domain fields merged after the Architecture shell paints. */
export type WorkspaceExtensions = Pick<
  WorkspaceSnapshot,
  | "evidence"
  | "verdicts"
  | "workCards"
  | "atlas"
  | "inbox"
  | "canonEntities"
  | "providers"
  | "integrations"
  | "integrationResources"
  | "syncRuns"
  | "rawKnowledge"
>;

type ProjectMetadata = {
  rawProjects: Record<string, unknown>[];
  rawEnvironments: Record<string, unknown>[];
  environments: EnvironmentItem[];
};

export type ProjectCatalog = ProjectMetadata & {
  projects: ProjectSwitcherItem[];
};

const emptySettings: ProjectGeneralSettings = {
  name: "",
  description: "",
  defaultEnvironmentId: "",
  projectId: "",
  repository: "",
  dataSource: "unavailable",
};

export function emptyWorkspaceExtensions(): WorkspaceExtensions {
  return {
    evidence: [],
    verdicts: [],
    workCards: [],
    atlas: emptyAtlas(),
    inbox: emptyInbox(),
    canonEntities: [],
    providers: [],
    integrations: [],
    integrationResources: [],
    syncRuns: [],
    rawKnowledge: [],
  };
}

export function emptyWorkspace(): WorkspaceSnapshot {
  return {
    available: false,
    quarantined: false,
    healthMessage: "",
    extensionsReady: false,
    projects: [],
    environments: [],
    settingsEnvironments: [],
    settings: emptySettings,
    repositories: [],
    ...emptyWorkspaceExtensions(),
    views: [],
    layoutBody: "",
    layoutRevision: 0,
  };
}

function core() {
  return window.polterware.core;
}

export function emptyInbox(): WorkspaceInbox {
  return { items: [], openCount: 0, blockingCount: 0 };
}

export function emptyAtlas(): WorkspaceAtlas {
  return { nodes: [], driftSlugs: [], historical: false };
}

/**
 * The global scope the Desktop reads under: an Atlas node path, or empty for the
 * whole project. Loaders read it so every refresh path stays scoped.
 */
let activeScope: { node: string } = { node: "" };

export function setActiveScope(scope: { node: string }): void {
  activeScope = { node: scope.node };
}

function scopeArgs(): { scopeNode?: string } {
  return activeScope.node ? { scopeNode: activeScope.node } : {};
}

/** Work cards only — the slice a Work change event refreshes. */
export async function loadWorkCards(projectId: string): Promise<WorkspaceWorkCard[]> {
  return mapWorkCards(asObjectArray(asRecord(await core().work.listCards({ projectId, ...scopeArgs() })).cards));
}

/** Atlas nodes for the canvas. A failed read keeps the page usable with no nodes. */
export async function loadAtlas(projectId: string, asOf = "", api = core()): Promise<WorkspaceAtlas> {
  try {
    return mapAtlas(asRecord(await api.work.listAtlas({ projectId, asOf })));
  } catch (error) {
    console.warn("Atlas read failed.", error);
    return emptyAtlas();
  }
}

/** Change batches that touched the Atlas. A failed read leaves the timeline with only Now. */
export async function loadAtlasHistory(projectId: string, api = core()): Promise<WorkspaceAtlasHistoryEntry[]> {
  try {
    return mapAtlasHistory(asRecord(await api.work.listAtlasHistory({ projectId })));
  } catch (error) {
    console.warn("Atlas history read failed.", error);
    return [];
  }
}

/** The derived Inbox. A failed read keeps the page usable with no items. */
export async function loadInbox(projectId: string, api = core()): Promise<WorkspaceInbox> {
  try {
    return mapInbox(asRecord(await api.work.listInbox({ projectId, ...scopeArgs() })));
  } catch (error) {
    console.warn("Inbox read failed.", error);
    return emptyInbox();
  }
}

/** The extension fields of a snapshot, to keep them across a shell reload. */
export function pickWorkspaceExtensions(snapshot: WorkspaceSnapshot): WorkspaceExtensions {
  const keys = Object.keys(emptyWorkspaceExtensions()) as (keyof WorkspaceExtensions)[];
  return Object.fromEntries(keys.map((key) => [key, snapshot[key]])) as WorkspaceExtensions;
}

async function loadProjectMetadata(api = core()): Promise<ProjectMetadata> {
  const listed = asRecord(await api.projects.list());
  const rawProjects = asObjectArray(listed.projects);
  const details = await Promise.all(rawProjects.map(async (project) => {
    const projectId = asString(project.id);
    const environmentsPromise = api.projects.listEnvironments({ projectId });
    const settingsPromise = api.projects.getSettings({ projectId }).catch((error: unknown) => {
      console.warn("Project description read failed.", error);
      return null;
    });
    const listedEnvs = asRecord(await environmentsPromise);
    const settingsValue = await settingsPromise;
    let description = asString(project.description);
    if (settingsValue) {
      const fromSettings = asString(asRecord(asRecord(settingsValue).settings).description);
      if (fromSettings) description = fromSettings;
    }
    return { environments: asObjectArray(listedEnvs.environments), description };
  }));
  const described = rawProjects.map((project, index) => {
    const description = details[index]?.description;
    return description ? { ...project, description } : project;
  });
  const rawEnvironments = details.flatMap((item) => item.environments);
  const environments = mapEnvironments(rawEnvironments);
  return { rawProjects: described, rawEnvironments, environments };
}

export async function loadProjects(currentProjectId?: string): Promise<ProjectCatalog> {
  const metadata = await loadProjectMetadata();
  return {
    ...metadata,
    projects: mapProjects(metadata.rawProjects, metadata.environments, currentProjectId),
  };
}

/**
 * Architecture + project shell — enough for the first workspace paint.
 * Extension domains (Knowledge / Canon / Integrations) load separately.
 */
export async function loadWorkspaceShell(
  projectId: string,
  catalog?: ProjectCatalog,
): Promise<WorkspaceSnapshot> {
  const api = core();
  const metadataPromise: Promise<ProjectMetadata> = catalog
    ? Promise.resolve(catalog)
    : loadProjectMetadata(api);
  const [healthRes, settingsRes, layoutRes, viewsRes, reposRes] = await Promise.all([
    api.health.getStoreHealth(),
    api.projects.getSettings({ projectId }),
    api.architecture.getLayout({ projectId }).catch(() => ({})),
    api.architecture.listViews({ projectId }),
    api.projects.listRepos({ projectId }).catch(() => ({ repos: [] })),
  ] as const);

  const metadata = await metadataPromise;
  const health = asRecord(healthRes);
  const { rawProjects, rawEnvironments, environments } = metadata;
  const currentEnvRecords = rawEnvironments.filter((item) => asString(item.projectId) === projectId);
  const layout = asRecord(asRecord(layoutRes).layout);
  const projects = mapProjects(rawProjects, environments, projectId);
  const settings = mapSettings(
    asRecord(asRecord(settingsRes).settings),
    rawProjects.find((item) => asString(item.id) === projectId),
  );
  const settingsEnvironments = mapSettingsEnvironments(currentEnvRecords);
  const views = mapViews(asObjectArray(asRecord(viewsRes).views));

  return {
    available: true,
    quarantined: health.quarantined === true,
    healthMessage: asString(health.message),
    extensionsReady: false,
    projects,
    environments,
    settingsEnvironments,
    settings,
    repositories: mapProjectRepos(asObjectArray(asRecord(reposRes).repos)),
    ...emptyWorkspaceExtensions(),
    views,
    layoutBody: asString(layout.bodyJson),
    layoutRevision: asNumber(layout.revision),
  };
}

export async function loadWorkspaceExtensions(
  projectId: string,
  options?: { environments?: EnvironmentItem[] },
): Promise<WorkspaceExtensions> {
  const api = core();
  const environmentsPromise: Promise<EnvironmentItem[]> = options?.environments
    ? Promise.resolve(options.environments)
    : loadProjectMetadata(api).then((metadata) => metadata.environments);
  const settled = await Promise.all([
    api.knowledge.list({ projectId, ...scopeArgs() }),
    api.work.listCards({ projectId, ...scopeArgs() }),
    loadInbox(projectId, api),
    loadAtlas(projectId, "", api),
    api.canon.listEntities({ projectId }).catch(() => ({ entities: [] })),
    api.knowledge.listLinks({ projectId }).catch(() => ({ links: [] })),
    api.integrations.listProviders(),
    api.integrations.listConnections({ projectId }),
    api.integrations.listResources({ projectId }),
    api.integrations.listSyncRuns({ projectId }),
    environmentsPromise,
  ]);
  const [
    knowledgeRes,
    workRes,
    inbox,
    atlas,
    entitiesRes,
    linksRes,
    providersRes,
    connectionsRes,
    integrationResourcesRes,
    syncRunsRes,
  ] = settled;
  const environments: EnvironmentItem[] = settled[10];

  const projectEnvironments = environments.filter((item) => item.projectId === projectId);

  await Promise.resolve();

  const knowledgeItems = asObjectArray(asRecord(knowledgeRes).items);
  const canonEntities = mapCanonEntities(asObjectArray(asRecord(entitiesRes).entities));
  const linksByKnowledge = mapKnowledgeEntityLinks(asObjectArray(asRecord(linksRes).links), canonEntities);
  const evidence = mapEvidence(knowledgeItems, linksByKnowledge);
  const verdicts = mapVerdicts(knowledgeItems, linksByKnowledge, atlas.nodes);
  const workCards = mapWorkCards(asObjectArray(asRecord(workRes).cards));

  await Promise.resolve();

  const integrationResources = mapIntegrationResources(
    asObjectArray(asRecord(integrationResourcesRes).resources),
    projectEnvironments,
  );
  const providersRaw = asObjectArray(asRecord(providersRes).providers);
  const integrations = mapConnections(
    asObjectArray(asRecord(connectionsRes).connections),
    providersRaw,
    projectEnvironments,
    integrationResources,
  );
  const providers = mapProviders(providersRaw, integrations);
  const syncRuns = mapSyncRuns(asObjectArray(asRecord(syncRunsRes).runs));

  return {
    evidence,
    verdicts,
    workCards,
    atlas,
    inbox,
    canonEntities,
    providers,
    integrations,
    integrationResources,
    syncRuns,
    rawKnowledge: knowledgeItems,
  };
}

/** Full snapshot — shell then extensions (callers that need one round-trip). */
export async function loadWorkspace(
  projectId: string,
  catalog?: ProjectCatalog,
): Promise<WorkspaceSnapshot> {
  const shell = await loadWorkspaceShell(projectId, catalog);
  const extensions = await loadWorkspaceExtensions(projectId);
  return {
    ...shell,
    ...extensions,
    extensionsReady: true,
  };
}
