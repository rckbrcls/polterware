import type { ProjectEnvironment, ProjectGeneralSettings, ProjectRepository } from "@polterware/feature-settings";
import type {
  EnvironmentItem,
  ProjectSwitcherItem,
  WorkspaceCatalogProvider,
  WorkspaceDoc,
  WorkspaceDecision,
  WorkspaceCanonEntity,
  WorkspaceIntegration,
  WorkspaceIntegrationResource,
  WorkspaceIntegrationSyncRun,
  WorkspaceInbox,
  WorkspaceStructure,
  WorkspaceStructureHistoryEntry,
  WorkspaceWorkCard,
  WorkspaceMilestone,
} from "@polterware/feature-shell";
import { asNumber, asObjectArray, asRecord, asString } from "./format";
import {
  mapDecisions,
  mapStructureHistory,
  mapConnections,
  mapDocs,
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
  mapStructure,
  mapWorkCards,
  mapMilestones,
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
  docs: WorkspaceDoc[];
  decisions: WorkspaceDecision[];
  workCards: WorkspaceWorkCard[];
  milestones: WorkspaceMilestone[];
  structure: WorkspaceStructure;
  inbox: WorkspaceInbox;
  canonEntities: WorkspaceCanonEntity[];
  providers: WorkspaceCatalogProvider[];
  integrations: WorkspaceIntegration[];
  integrationResources: WorkspaceIntegrationResource[];
  syncRuns: WorkspaceIntegrationSyncRun[];
  rawKnowledge: Record<string, unknown>[];
  structureFacts: { id: string; entityId: string; scopeNodeId: string }[];
};

/** Extension-domain fields merged after the Architecture shell paints. */
export type WorkspaceExtensions = Pick<
  WorkspaceSnapshot,
  | "docs"
  | "decisions"
  | "workCards"
  | "milestones"
  | "structure"
  | "inbox"
  | "canonEntities"
  | "providers"
  | "integrations"
  | "integrationResources"
  | "syncRuns"
  | "rawKnowledge"
  | "structureFacts"
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
    docs: [],
    decisions: [],
    workCards: [],
    milestones: [],
    structure: emptyStructure(),
    inbox: emptyInbox(),
    canonEntities: [],
    providers: [],
    integrations: [],
    integrationResources: [],
    syncRuns: [],
    rawKnowledge: [],
    structureFacts: [],
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
  };
}

function core() {
  return window.polterware.core;
}

export function emptyInbox(): WorkspaceInbox {
  return { items: [], openCount: 0, blockingCount: 0 };
}

export function emptyStructure(): WorkspaceStructure {
  return { nodes: [], driftSlugs: [], historical: false };
}

/**
 * Structure node ids the Desktop reads under. Empty means the whole project.
 * Loaders spread this so every refresh path stays scoped. A parent id is
 * already expanded to itself and its children by the caller.
 */
let activeScopeNodeIds: string[] = [];

export function setActiveScope(scope: { nodeIds: readonly string[] }): void {
  activeScopeNodeIds = scope.nodeIds.filter((id) => id !== "");
}

/** Repeated `scope_nodes`. Omitted when the project is unscoped. */
export function scopeArgs(): { scopeNodes?: string[] } {
  return activeScopeNodeIds.length > 0 ? { scopeNodes: [...activeScopeNodeIds] } : {};
}

export async function loadFacts(projectId: string) {
  return core().canon.listFacts({ projectId, ...scopeArgs() });
}

export async function loadCanonEvidence(projectId: string) {
  return core().canon.listEvidence({ projectId, ...scopeArgs() });
}

export async function loadChanges(
  projectId: string,
  extra: { actorKind?: string; limit?: number } = {},
) {
  return core().context.listChanges({
    projectId,
    limit: extra.limit ?? 50,
    ...(extra.actorKind ? { actorKind: extra.actorKind } : {}),
    ...scopeArgs(),
  });
}

/** Work cards only — the slice a Work change event refreshes. */
export async function loadWorkCards(projectId: string): Promise<WorkspaceWorkCard[]> {
  return mapWorkCards(asObjectArray(asRecord(await core().work.listCards({ projectId, ...scopeArgs() })).cards));
}

/** Milestones are project-wide; card scope remains applied by loadWorkCards. */
export async function loadMilestones(projectId: string): Promise<WorkspaceMilestone[]> {
  return mapMilestones(asObjectArray(asRecord(await core().work.listMilestones({ projectId })).milestones));
}

/** Structure nodes for the canvas. A failed read keeps the page usable with no nodes. */
export async function loadStructure(projectId: string, asOf = "", api = core()): Promise<WorkspaceStructure> {
  return mapStructure(asRecord(await api.work.listStructure({ projectId, asOf })));
}

/** Change batches that touched the Structure. A failed read leaves the timeline with only Now. */
export async function loadStructureHistory(projectId: string, api = core()): Promise<WorkspaceStructureHistoryEntry[]> {
  try {
    return mapStructureHistory(asRecord(await api.work.listStructureHistory({ projectId })));
  } catch (error) {
    console.warn("Structure history read failed.", error);
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
  const [healthRes, settingsRes, reposRes] = await Promise.all([
    api.health.getStoreHealth(),
    api.projects.getSettings({ projectId }),
    api.projects.listRepos({ projectId }).catch(() => ({ repos: [] })),
  ] as const);

  const metadata = await metadataPromise;
  const health = asRecord(healthRes);
  const { rawProjects, rawEnvironments, environments } = metadata;
  const currentEnvRecords = rawEnvironments.filter((item) => asString(item.projectId) === projectId);
  const projects = mapProjects(rawProjects, environments, projectId);
  const settings = mapSettings(
    asRecord(asRecord(settingsRes).settings),
    rawProjects.find((item) => asString(item.id) === projectId),
  );
  const settingsEnvironments = mapSettingsEnvironments(currentEnvRecords);

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
    loadStructure(projectId, "", api),
    api.canon.listEntities({ projectId }).catch(() => ({ entities: [] })),
    api.knowledge.listLinks({ projectId }).catch(() => ({ links: [] })),
    api.integrations.listProviders(),
    api.integrations.listConnections({ projectId }),
    api.integrations.listResources({ projectId }),
    api.integrations.listSyncRuns({ projectId }),
    environmentsPromise,
    loadMilestones(projectId),
    api.canon.listFacts({ projectId, ...scopeArgs() }),
  ]);
  const [
    knowledgeRes,
    workRes,
    inbox,
    structure,
    entitiesRes,
    linksRes,
    providersRes,
    connectionsRes,
    integrationResourcesRes,
    syncRunsRes,
  ] = settled;
  const environments: EnvironmentItem[] = settled[10];
  const milestones: WorkspaceMilestone[] = settled[11];

  const projectEnvironments = environments.filter((item) => item.projectId === projectId);

  await Promise.resolve();

  const knowledgeItems = asObjectArray(asRecord(knowledgeRes).items);
  const canonEntities = mapCanonEntities(asObjectArray(asRecord(entitiesRes).entities));
  const linksByKnowledge = mapKnowledgeEntityLinks(asObjectArray(asRecord(linksRes).links), canonEntities);
  const docs = mapDocs(knowledgeItems, linksByKnowledge);
  const decisions = mapDecisions(knowledgeItems, linksByKnowledge, structure.nodes);
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
    docs,
    decisions,
    workCards,
    milestones,
    structure,
    inbox,
    canonEntities,
    providers,
    integrations,
    integrationResources,
    syncRuns,
    rawKnowledge: knowledgeItems,
    structureFacts: asObjectArray(asRecord(settled[12]).facts).map((fact) => ({ id: asString(fact.id), entityId: asString(fact.entityId), scopeNodeId: asString(fact.scopeNodeId) })),
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
