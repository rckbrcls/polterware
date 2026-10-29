import type { ProjectEnvironment, ProjectGeneralSettings, ProjectRepository, ProtectionLevel } from "@polterware/feature-settings";
import type {
  EnvironmentItem,
  EnvironmentKind,
  ProjectSwitcherItem,
  WorkspaceCatalogProvider,
  WorkspaceDoc,
  DocType,
  DecisionState,
  WorkspaceDecision,
  WorkspaceEntityLink,
  WorkspaceCanonEntity,
  WorkspaceIntegration,
  WorkspaceIntegrationResource,
  WorkspaceIntegrationSyncRun,
  WorkspaceInbox,
  WorkspaceInboxAction,
  WorkspaceInboxKind,
  WorkspaceStructure,
  WorkspaceStructureHistoryEntry,
  WorkspaceStructureNode,
  StructureLevel,
  StructureStatus,
  WorkspaceWorkCard,
  WorkspaceMilestone,
  WorkStage,
} from "@polterware/feature-shell";
import {
  asBoolean,
  asNumber,
  asObjectArray,
  asRecord,
  asString,
  asStringArray,
  formatInstant,
  parseJsonObject,
} from "./format";

function projectStatus(value: string): ProjectSwitcherItem["status"] | undefined {
  if (value === "active" || value === "paused" || value === "archived") return value;
  return undefined;
}

export function mapProjects(
  projects: Record<string, unknown>[],
  environments: EnvironmentItem[],
  currentProjectId?: string,
): ProjectSwitcherItem[] {
  return projects.map((project) => {
    const projectId = asString(project.id);
    const projectEnvs = environments.filter((item) => item.projectId === projectId);
    const defaultEnv = projectEnvs.find((item) => item.kind === "production") ?? projectEnvs[0];
    const description = asString(project.description);
    const updatedAt = asString(project.updatedAt);
    const status = projectStatus(asString(project.status));
    const createdAt = asString(project.createdAt);
    return {
      projectId,
      name: asString(project.name, projectId),
      directory: asString(project.rootPath),
      environmentSummary: defaultEnv?.name ?? "No environments",
      isCurrent: projectId === currentProjectId,
      ...(description ? { description } : {}),
      ...(status ? { status } : {}),
      ...(createdAt ? { createdAt: formatInstant(createdAt) } : {}),
      ...(updatedAt ? { lastActivity: formatInstant(updatedAt) } : {}),
    };
  });
}

export function mapEnvironments(items: Record<string, unknown>[]): EnvironmentItem[] {
  return items.flatMap((item) => {
    const kind = asString(item.kind);
    if (!isEnvironmentKind(kind)) return [];
    return [{
      id: asString(item.id),
      name: asString(item.name),
      kind,
      projectId: asString(item.projectId),
    }];
  });
}

export function mapSettingsEnvironments(
  items: Record<string, unknown>[],
): ProjectEnvironment[] {
  return items.flatMap((item) => {
    const kind = asString(item.kind);
    if (!isEnvironmentKind(kind)) return [];
    const id = asString(item.id);
    return [{
      id,
      name: asString(item.name),
      kind,
      protection: asProtection(asString(item.protection)),
      nodeCount: 0,
      isDefault: asBoolean(item.isDefault),
      description: asString(item.description),
      protectionRules: protectionRules(asProtection(asString(item.protection))),
      dataSource: "empty" as const,
    }];
  });
}

export function mapSettings(
  settings: Record<string, unknown>,
  project: Record<string, unknown> | undefined,
): ProjectGeneralSettings {
  return {
    name: asString(project?.name, asString(settings.projectId, "Project")),
    description: asString(settings.description),
    defaultEnvironmentId: asString(settings.defaultEnvironmentId),
    projectId: asString(settings.projectId),
    repository: asString(settings.repository),
    agentsSync: settings.agentsSync === true,
    dataSource: "empty",
  };
}

export function mapProjectRepos(records: Record<string, unknown>[]): ProjectRepository[] {
  return records.flatMap((item) => {
    const name = asString(item.name);
    const path = asString(item.path);
    if (!name || !path) return [];
    return [{ id: asString(item.id), name, path }];
  });
}

export function mapCanonEntities(items: Record<string, unknown>[]): WorkspaceCanonEntity[] {
  return items.map((item) => ({
    id: asString(item.id),
    kind: asString(item.kind),
    refKind: asString(item.refKind),
    refId: asString(item.refId),
    title: asString(item.title),
    truthClass: asString(item.truthClass, "declared"),
    source: asString(item.source, "polterware"),
  }));
}

export function mapKnowledgeEntityLinks(
  links: Record<string, unknown>[],
  entities: WorkspaceCanonEntity[],
): Map<string, WorkspaceEntityLink[]> {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const grouped = new Map<string, WorkspaceEntityLink[]>();
  for (const item of links) {
    const knowledgeId = asString(item.knowledgeId);
    const entityId = asString(item.entityId);
    const entity = byId.get(entityId);
    const link: WorkspaceEntityLink = {
      id: asString(item.id),
      entityId,
      entityTitle: entity?.title ?? entityId,
      entityKind: entity?.kind ?? "",
      entityRefId: entity?.refId ?? "",
      predicate: asString(item.predicate),
      truthClass: asString(item.truthClass, "declared"),
      source: asString(item.source, "polterware"),
    };
    const current = grouped.get(knowledgeId) ?? [];
    current.push(link);
    grouped.set(knowledgeId, current);
  }
  return grouped;
}

/** The doc type of a stored doc; anything unknown reads as a plain doc. */
export function docType(value: string): DocType {
  return value === "runbook" || value === "source" ? value : "doc";
}

/** Docs are the `doc` knowledge items; their type is `docType` and tags are free labels. */
export function mapDocs(
  items: Record<string, unknown>[],
  linksByKnowledge: Map<string, WorkspaceEntityLink[]> = new Map(),
): WorkspaceDoc[] {
  return items.filter((item) => asString(item.kind) === "doc").map((item) => {
    const extra = parseJsonObject(asString(item.extraJson));
    const id = asString(item.id);
    return {
      id,
      title: asString(item.title),
      summary: asString(item.summary),
      bodyMarkdown: asString(item.body),
      docType: docType(asString(item.docType)),
      tags: asStringArray(item.tags),
      path: asString(extra.path),
      scopeNodeId: asString(item.scopeNodeId),
      owner: asString(item.owner, "Platform"),
      updatedAt: formatInstant(asString(item.updatedAt)),
      entityLinks: linksByKnowledge.get(id) ?? [],
    };
  });
}

const DECISION_STATES: DecisionState[] = ["proposed", "active", "challenged", "superseded"];

/** Lifecycle state of a stored Decision status; legacy "accepted" reads as active. */
export function decisionState(status: string): DecisionState {
  const value = status.trim().toLowerCase();
  if (value === "accepted") return "active";
  return DECISION_STATES.includes(value as DecisionState) ? (value as DecisionState) : "proposed";
}

/**
 * The number of a reference ("Decision-0008") or of a numbered title ("Decision 0008: Title"),
 * as the core reads it: the adr and verdict prefixes are legacy names, and free text never matches.
 */
function decisionNumber(text: string): number | null {
  const match = /^\s*(?:adr|verdict|decision)[\s\-_]*0*(\d+)\s*(?:[:.\-–—]|$)/i.exec(text);
  return match ? Number(match[1]) : null;
}

/** True when a `decisions:` entry names the Decision by id or Decision number. */
function citesDecision(ref: string, id: string, title: string): boolean {
  if (ref.trim().toLowerCase() === id.toLowerCase()) return true;
  const wanted = decisionNumber(ref);
  return wanted !== null && wanted === decisionNumber(title);
}

export function mapDecisions(
  items: Record<string, unknown>[],
  linksByKnowledge: Map<string, WorkspaceEntityLink[]> = new Map(),
  nodes: { path: string; decisions: string[]; status?: string }[] = [],
): WorkspaceDecision[] {
  const decisionItems = items.filter((item) => asString(item.kind) === "decision");
  const titleById = new Map(decisionItems.map((item) => [asString(item.id), asString(item.title)]));
  const supersededBy = (item: Record<string, unknown>) =>
    asString(parseJsonObject(asString(item.extraJson)).supersededBy);
  return decisionItems.map((item) => {
    const id = asString(item.id);
    const title = asString(item.title);
    const extra = parseJsonObject(asString(item.extraJson));
    return {
      id,
      title,
      summary: asString(item.summary),
      bodyMarkdown: asString(item.body),
      updatedAt: formatInstant(asString(item.updatedAt)),
      tags: asStringArray(item.tags),
      status: asString(item.status, "proposed"),
      state: decisionState(asString(item.status)),
      level: extra.level === "principle" ? "principle" : "decision",
      supersededBy: titleById.get(asString(extra.supersededBy)) ?? "",
      supersedes: decisionItems.filter((other) => supersededBy(other) === id).map((other) => asString(other.title)),
      reviewTrigger: asString(extra.reviewTrigger),
      statusReason: asString(extra.statusReason),
      governs: nodes
        .filter((node) => node.status !== "removed" && node.decisions.some((ref) => citesDecision(ref, id, title)))
        .map((node) => node.path),
      scopeNodeId: asString(item.scopeNodeId),
      owner: asString(item.owner, "Platform"),
      entityLinks: linksByKnowledge.get(id) ?? [],
    };
  });
}

function asWorkStage(value: string): WorkStage {
  return value === "plan"
    || value === "build"
    || value === "verify"
    || value === "delivered"
    ? value
    : "shape";
}

/** Active Work cards from WorkService.ListWorkCards, in board position order. */
export function mapWorkCards(items: Record<string, unknown>[]): WorkspaceWorkCard[] {
  return items.map((item) => ({
    id: asString(item.id),
    slug: asString(item.slug),
    title: asString(item.title, asString(item.slug)),
    intent: asString(item.intent),
    stage: asWorkStage(asString(item.stage)),
    kind: asString(item.kind) === "architecture" ? "architecture" : "feature",
    owner: asString(item.owner),
    under: asString(item.under),
    decisions: asStringArray(item.decisions),
    milestoneId: asString(item.milestoneId),
    updatedAt: formatInstant(asString(item.updatedAt)),
    tasks: asObjectArray(item.tasks).map((task) => {
      const state = asString(task.state);
      return {
        id: asString(task.id),
        number: asNumber(task.number),
        title: asString(task.title),
        state: state === "done" || state === "dropped" ? state : "open",
        scope: asString(task.scope),
        claimHolder: asString(task.claimHolder),
      };
    }),
    questions: asObjectArray(item.questions).map((question) => ({
      id: asString(question.id),
      text: asString(question.text),
      blocking: asBoolean(question.blocking),
      options: asStringArray(question.options),
      state: asString(question.state) === "answered" ? "answered" : "open",
      answer: asString(question.answer),
    })),
    invariants: asObjectArray(item.invariants).map((invariant) => ({
      id: asString(invariant.id),
      text: asString(invariant.text),
    })),
  }));
}

const STRUCTURE_LEVELS: StructureLevel[] = ["system", "domain", "component"];
const STRUCTURE_STATUSES: StructureStatus[] = ["proposed", "in_progress", "delivered", "drift"];

/** Structure hierarchy from WorkService.ListStructure. Unknown levels and statuses are dropped. */
export function mapStructure(raw: Record<string, unknown>): WorkspaceStructure {
  const nodes: WorkspaceStructureNode[] = [];
  for (const item of asObjectArray(raw.nodes)) {
    const level = asString(item.level);
    const status = asString(item.status);
    if (!STRUCTURE_LEVELS.includes(level as StructureLevel) || !STRUCTURE_STATUSES.includes(status as StructureStatus)) {
      continue;
    }
    nodes.push({
      id: asString(item.id),
      parentId: asString(item.parentId),
      level: level as StructureLevel,
      slug: asString(item.slug),
      path: asString(item.path),
      title: asString(item.title, asString(item.slug)),
      intent: asString(item.intent),
      decisions: asStringArray(item.decisions),
      invariants: asObjectArray(item.invariants).map((invariant) => ({
        id: asString(invariant.id),
        text: asString(invariant.text),
      })),
      status: status as StructureStatus,
      childCount: asNumber(item.childCount),
      featureCount: asNumber(item.featureCount),
      openQuestions: asNumber(item.openQuestions),
      repo: asString(item.repo),
      folder: asString(item.folder),
      kind: asString(item.kind),
      tech: asString(item.tech),
      migrationFrom: asString(item.migrationFrom),
      migrationTo: asString(item.migrationTo),
      uses: asStringArray(item.uses),
      deploys: asObjectArray(item.deploys).map((deploy) => ({
        id: asString(deploy.id), environmentId: asString(deploy.environmentId),
        environment: asString(deploy.environment), provider: asString(deploy.provider), resource: asString(deploy.resource),
      })),
    });
  }
  return { nodes, driftSlugs: asStringArray(raw.driftSlugs), historical: asBoolean(raw.historical) };
}

/** Change batches that touched the Structure, newest first. */
export function mapStructureHistory(raw: Record<string, unknown>): WorkspaceStructureHistoryEntry[] {
  return asObjectArray(raw.entries).map((item) => ({
    batchId: asString(item.batchId),
    at: formatInstant(asString(item.at)),
    nodeOps: asNumber(item.nodeOps),
    summary: asString(item.summary),
  }));
}

const INBOX_KINDS: WorkspaceInboxKind[] = ["decision", "drift", "verify"];
const INBOX_ACTIONS: WorkspaceInboxAction[] = [
  "decide",
  "delegate",
  "defer",
  "fix_code",
  "update_intent",
  "ignore",
  "verify",
  "reject",
];

/** Inbox from WorkService.ListInbox; unknown kinds and actions are dropped. */
export function mapInbox(response: Record<string, unknown>): WorkspaceInbox {
  const items = asObjectArray(response.items).flatMap((item) => {
    const kind = asString(item.kind) as WorkspaceInboxKind;
    if (!INBOX_KINDS.includes(kind)) return [];
    return [{
      id: asString(item.id),
      kind,
      blocking: asBoolean(item.blocking),
      title: asString(item.title),
      detail: asString(item.detail),
      options: asStringArray(item.options),
      where: asString(item.where),
      source: asString(item.source),
      state: asString(item.state) === "deferred" ? "deferred" as const : "open" as const,
      actions: asStringArray(item.actions).filter((action): action is WorkspaceInboxAction =>
        INBOX_ACTIONS.includes(action as WorkspaceInboxAction),
      ),
    }];
  });
  return {
    items,
    openCount: asNumber(response.openCount),
    blockingCount: asNumber(response.blockingCount),
  };
}

export function mapProviders(
  items: Record<string, unknown>[],
  connections: WorkspaceIntegration[],
): WorkspaceCatalogProvider[] {
  const connected = new Set(connections.map((item) => item.providerId));
  return items.map((item) => {
    const id = asString(item.id);
    const authCommands = asStringArray(item.authCommands);
    return {
      id,
      name: asString(item.name),
      description: asString(item.description),
      category: asCategory(asString(item.category)),
      binary: asString(item.binary),
      authCommands,
      transcript: authCommands.map((command) => `$ ${command}`),
      state: connected.has(id) ? "connected" : "ready",
    };
  });
}

export function mapConnections(
  items: Record<string, unknown>[],
  providers: Record<string, unknown>[],
  environments: EnvironmentItem[],
  resources: WorkspaceIntegrationResource[],
): WorkspaceIntegration[] {
  const providerNames = new Map(providers.map((item) => [asString(item.id), asString(item.name)]));
  const envNames = new Map(environments.map((item) => [item.id, item.name]));
  return items.map((item) => {
    const id = asString(item.id);
    const linked = resources.filter((resource) => resource.integrationId === id);
    return {
      id,
      providerId: asString(item.providerId),
      name: providerNames.get(asString(item.providerId)) ?? asString(item.providerId),
      provider: providerNames.get(asString(item.providerId)) ?? asString(item.providerId),
      status: asIntegrationStatus(asString(item.status)),
      connectionLabel: asString(item.label),
      environment: envNames.get(asString(item.environmentId)) ?? "All",
      lastSync: formatInstant(asString(item.lastSyncAt)),
      summary: asString(item.summary),
      resourceCount: linked.length,
      cliCommand: asString(item.cliCommand),
      syncInterval: asString(item.syncInterval) || undefined,
      freshness: asFreshness(asString(item.freshness)),
      error: asString(item.errorMessage) || undefined,
    };
  });
}

export function mapIntegrationResources(
  items: Record<string, unknown>[],
  environments: EnvironmentItem[],
): WorkspaceIntegrationResource[] {
  const envNames = new Map(environments.map((item) => [item.id, item.name]));
  return items.map((item) => ({
    id: asString(item.id),
    integrationId: asString(item.connectionId),
    name: asString(item.name),
    kind: asString(item.kind),
    externalId: asString(item.externalId),
    environment: envNames.get(asString(item.environmentId)) ?? "All",
    status: asString(item.status),
  }));
}

export function mapSyncRuns(items: Record<string, unknown>[]): WorkspaceIntegrationSyncRun[] {
  return items.map((item) => ({
    id: asString(item.id),
    integrationId: asString(item.connectionId),
    startedAt: formatInstant(asString(item.startedAt)),
    finishedAt: formatInstant(asString(item.finishedAt)),
    result: asSyncResult(asString(item.result)),
    imported: asNumber(item.imported),
    changed: asNumber(item.changed),
    message: asString(item.message),
  }));
}

function isEnvironmentKind(value: string): value is EnvironmentKind {
  return value === "production" || value === "staging" || value === "development" || value === "local";
}

function asProtection(value: string): ProtectionLevel {
  if (value === "strict" || value === "relaxed") return value;
  return "standard";
}

function protectionRules(level: ProtectionLevel): string[] {
  if (level === "strict") {
    return ["Changes persist locally", "Freeze window: Fri 18:00 – Mon 08:00 UTC", "Destructive commands are not executed"];
  }
  if (level === "relaxed") {
    return ["Local changes are allowed", "No remote commands are executed"];
  }
  return ["Changes persist locally", "Validation results stay in the local store"];
}

function asCategory(value: string): WorkspaceCatalogProvider["category"] {
  if (value === "Cloud" || value === "Deployment" || value === "Databases" || value === "Infrastructure") return value;
  return "Source Control";
}

function asIntegrationStatus(value: string): WorkspaceIntegration["status"] {
  if (value === "error" || value === "disconnected" || value === "disabled") return value;
  return "connected";
}

function asFreshness(value: string): WorkspaceIntegration["freshness"] {
  if (value === "stale" || value === "unknown") return value;
  return "fresh";
}

function asSyncResult(value: string): WorkspaceIntegrationSyncRun["result"] {
  if (value === "partial" || value === "failed" || value === "running") return value;
  return "success";
}

export function mapMilestones(rows: Record<string, unknown>[]): WorkspaceMilestone[] {
  return rows.map((row) => {
    const state = asString(row.state);
    return {
      id: asString(row.id),
      projectId: asString(row.projectId),
      slug: asString(row.slug),
      name: asString(row.name),
      goal: asString(row.goal),
      exitCriteria: asStringArray(row.exitCriteria),
      targetDate: asString(row.targetDate),
      state: state === "active" || state === "done" ? state : "planned",
      position: asNumber(row.position),
      archivedAt: asString(row.archivedAt),
    };
  });
}
