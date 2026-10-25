import type {
  EnvironmentKind,
  ProjectEnvironment,
  ProjectGeneralSettings,
  ProtectionLevel,
} from "@polterware/feature-settings";
import type { WorkspaceVerdict, WorkspaceCatalogProvider, WorkspaceFeatureReview, WorkCardKind, WorkStage } from "@polterware/feature-shell";
import type { ChangeEnvelope, DecisionAction, FeatureFlowLine } from "@polterware/feature-knowledge";
import { asNumber, asObjectArray, asRecord, asString } from "./format";
import type { WorkspaceSnapshot } from "./load";
import { mapFeatureReview } from "./map-feature-review";
import { uniqueCardSlug } from "@polterware/feature-knowledge";

function core() {
  return window.polterware.core;
}

function changePayload(change: ChangeEnvelope) {
  return {
    summary: change.summary,
    rationale: change.rationale,
    agentRunId: change.agentRunId ?? "",
  };
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function protectionForKind(kind: string): ProtectionLevel {
  if (kind === "production") return "strict";
  if (kind === "staging") return "standard";
  return "relaxed";
}

async function syncEnvironmentDefaultFlags(
  projectId: string,
  environments: readonly ProjectEnvironment[],
  defaultEnvironmentId: string,
): Promise<void> {
  if (!defaultEnvironmentId || environments.length === 0) return;
  for (const environment of environments) {
    const isDefault = environment.id === defaultEnvironmentId;
    if (environment.isDefault === isDefault) continue;
    await core().projects.saveEnvironment({
      environment: {
        id: environment.id,
        projectId,
        name: environment.name,
        kind: environment.kind,
        protection: environment.protection,
        isDefault,
        description: environment.description ?? "",
      },
    });
  }
}

export async function persistLayout(
  projectId: string,
  bodyJson: string,
  expectedRevision: number,
): Promise<{ revision: number }> {
  const response = asRecord(await core().architecture.updateLayout({
    projectId,
    expectedRevision,
    bodyJson,
  }));
  return { revision: asNumber(asRecord(response.layout).revision) };
}

export async function persistView(input: {
  projectId: string;
  id?: string;
  name: string;
  description?: string;
  owner?: string;
  purpose?: string;
  notes?: string;
  filterSummary?: string;
  environments?: string[];
  tags?: string[];
  members: Array<{ nodeId: string; name: string; type?: string; layer?: string }>;
}): Promise<void> {
  await core().architecture.saveView({
    view: {
      id: input.id ?? newId("view"),
      projectId: input.projectId,
      name: input.name,
      description: input.description ?? "",
      owner: input.owner ?? "",
      purpose: input.purpose ?? "",
      notes: input.notes ?? "",
      filterSummary: input.filterSummary ?? "",
      environments: input.environments ?? [],
      tags: input.tags ?? [],
      members: input.members.map((member) => ({
        nodeId: member.nodeId,
        name: member.name,
        type: member.type ?? "",
        layer: member.layer ?? "",
      })),
    },
  });
}

export async function persistDeleteView(id: string): Promise<void> {
  await core().architecture.deleteView({ id });
}

export async function persistKnowledgeBody(
  workspace: WorkspaceSnapshot,
  projectId: string,
  itemId: string,
  body: string,
  change: ChangeEnvelope,
): Promise<void> {
  const current = workspace.rawKnowledge.find((item) => asString(item.id) === itemId);
  if (!current) return;
  await core().knowledge.save({
    item: {
      ...current,
      projectId,
      body,
    },
    change: changePayload(change),
  });
}

export async function persistKnowledgeTitle(
  workspace: WorkspaceSnapshot,
  projectId: string,
  itemId: string,
  title: string,
  change: ChangeEnvelope,
): Promise<void> {
  const current = workspace.rawKnowledge.find((item) => asString(item.id) === itemId);
  if (!current) return;
  await core().knowledge.save({
    item: { ...current, projectId, title },
    change: changePayload(change),
  });
}

export async function persistKnowledgeTags(
  workspace: WorkspaceSnapshot,
  projectId: string,
  itemId: string,
  tags: string[],
  change: ChangeEnvelope,
): Promise<void> {
  const current = workspace.rawKnowledge.find((item) => asString(item.id) === itemId);
  if (!current) return;
  await core().knowledge.save({
    item: { ...current, projectId, tags },
    change: changePayload(change),
  });
}

export async function persistKnowledgeSourcePath(
  workspace: WorkspaceSnapshot,
  projectId: string,
  itemId: string,
  path: string,
  change: ChangeEnvelope,
): Promise<void> {
  const current = workspace.rawKnowledge.find((item) => asString(item.id) === itemId);
  if (!current) return;
  let extra: Record<string, unknown> = {};
  try {
    extra = JSON.parse(asString(current.extraJson, "{}")) as Record<string, unknown>;
  } catch {
    extra = {};
  }
  await core().knowledge.save({
    item: {
      ...current,
      projectId,
      extraJson: JSON.stringify({ ...extra, path }),
    },
    change: changePayload(change),
  });
}

/**
 * Create a knowledge item. Evidence has no type: `tags` is all that says what it is, and
 * `path` points at a project file when the item stands for one. A template's old kind
 * ("doc", "runbook", "source") only seeds a tag.
 */
export async function persistKnowledgeCreate(input: {
  projectId: string;
  kind: "evidence" | "verdict";
  title: string;
  body?: string;
  extraJson?: string;
  tags?: string[];
  path?: string;
  change: ChangeEnvelope;
}): Promise<string> {
  const verdict = input.kind === "verdict";
  const id = newId(verdict ? "verdict" : "ev");
  const defaultBody = verdict
    ? "## Status\n\nProposed\n\n## Context\n\n\n\n## Decision\n\n\n\n## Consequences\n\n"
    : "";
  const path = input.path?.trim();
  await core().knowledge.save({
    item: {
      id,
      projectId: input.projectId,
      title: input.title,
      body: input.body ?? defaultBody,
      kind: input.kind,
      tags: verdict ? ["verdict"] : [...new Set(input.tags ?? [])],
      summary: "",
      owner: "human",
      status: verdict ? "proposed" : "",
      extraJson: input.extraJson ?? (path ? JSON.stringify({ path }) : "{}"),
    },
    change: changePayload(input.change),
  });
  return id;
}

/** Scopes a knowledge item (Decision or Evidence) to an Atlas node path; an empty path clears it. */
export async function persistKnowledgeScope(projectId: string, id: string, path: string): Promise<void> {
  await core().work.setScope({ projectId, kind: "knowledge", id, node: path });
}

export async function persistKnowledgeDelete(
  id: string,
  change: ChangeEnvelope,
): Promise<void> {
  await core().knowledge.delete({ id, change: changePayload(change) });
}

/** Polter text for one card: the Desktop writes Work through the same codec as agents. */
function polterCard(slug: string, title: string | null, meta: Record<string, string>): string {
  const heading = title ? `## ${slug}: ${title.replace(/\s+/g, " ").trim()}` : `## ${slug}`;
  const metaLine = Object.entries(meta).map(([key, value]) => `${key}: ${value}`).join(" · ");
  return `---\npolter: 1\n---\n\n${heading}\n${metaLine}\n`;
}

function atlasNodeText(input: { heading: string; title: string; level: string; under?: string }): string {
  const meta = [`level: ${input.level}`];
  if (input.under) meta.push(`under: ${input.under}`);
  return `---\npolter: 1\n---\n\n# ${input.heading}: ${polterValue(input.title)}\n${meta.join(" · ")}\n`;
}

/** Create an Atlas node. The heading is the slug; under names the parent path. */
export async function persistAtlasCreateNode(input: {
  projectId: string;
  heading: string;
  title: string;
  level: string;
  under?: string;
  change: ChangeEnvelope;
}): Promise<void> {
  await applyPolter(input.projectId, atlasNodeText(input), input.change);
}

/** Move an existing Atlas node under a new parent. The heading is its current path. */
export async function persistAtlasMoveNode(input: {
  projectId: string;
  path: string;
  title: string;
  level: string;
  under: string;
  change: ChangeEnvelope;
}): Promise<void> {
  await applyPolter(
    input.projectId,
    atlasNodeText({ heading: input.path, title: input.title, level: input.level, under: input.under }),
    input.change,
  );
}

/**
 * Replace an Atlas node's `uses:` list (the node paths it depends on). An empty
 * list clears it. The heading is the node's current path.
 */
export async function persistAtlasUses(input: {
  projectId: string;
  path: string;
  title: string;
  level: string;
  uses: readonly string[];
  change: ChangeEnvelope;
}): Promise<void> {
  const text = atlasNodeText({ heading: input.path, title: input.title, level: input.level });
  await applyPolter(input.projectId, `${text}uses: ${input.uses.join(", ")}\n`, input.change);
}

async function applyPolter(projectId: string, text: string, change: ChangeEnvelope): Promise<void> {
  await core().work.apply({ projectId, text, change: changePayload(change) });
}

/** Metadata values must not contain the separators a `key: value` line splits on. */
function polterValue(value: string): string {
  return value.replace(/\s+/g, " ").replace(/ [·•] /g, ", ").replace(/ - /g, " – ").trim();
}

/**
 * Move an Verdict through its lifecycle as a Polter decision block. The core
 * enforces the legal transitions; a refusal comes back as the error message.
 */
export async function persistDecisionAction(input: {
  projectId: string;
  verdict: WorkspaceVerdict;
  action: DecisionAction;
  change: ChangeEnvelope;
}): Promise<void> {
  const reason = polterValue(input.change.rationale);
  let block: string;
  switch (input.action.kind) {
    case "activate":
    case "reactivate":
      block = `### ${input.verdict.id}\nstatus: active`;
      break;
    case "challenge":
      block = `### ${input.verdict.id}\nstatus: challenged · reason: ${reason}`;
      break;
    case "supersede":
      block = `### ${input.action.byId}\nsupersedes: ${input.verdict.id} · reason: ${reason}`;
      break;
  }
  await applyPolter(input.projectId, `---\npolter: 1\n---\n\n${block}\n`, input.change);
}

/** Create a Work card in Shape; returns its slug. */
export async function persistWorkCreateCard(input: {
  workspace: WorkspaceSnapshot;
  projectId: string;
  title: string;
  change: ChangeEnvelope;
}): Promise<string> {
  const slug = uniqueCardSlug(input.workspace.workCards.map((card) => card.slug), input.title);
  // status: active restores a removed card that already owns this slug.
  await applyPolter(
    input.projectId,
    polterCard(slug, input.title, { stage: "shape", status: "active" }),
    input.change,
  );
  return slug;
}

function requireReview(raw: unknown): WorkspaceFeatureReview {
  const review = mapFeatureReview(asRecord(asRecord(raw).review));
  if (!review) throw new Error("The core returned no feature review.");
  return review;
}

/** Shape impact and gate checks of one card. */
export async function loadFeatureReview(projectId: string, slug: string): Promise<WorkspaceFeatureReview> {
  return requireReview(await core().work.reviewFeature({ projectId, slug }));
}

/** New-feature flow: write a card in shape from an intent; under is only the picked value. */
export async function persistFeatureCreate(input: {
  projectId: string;
  intent: string;
  title: string;
  under: string;
  kind?: WorkCardKind;
  change: ChangeEnvelope;
}): Promise<WorkspaceFeatureReview> {
  return requireReview(await core().work.createFeature({
    projectId: input.projectId,
    intent: input.intent,
    title: input.title,
    under: input.under,
    kind: input.kind ?? "feature",
    change: changePayload(input.change),
  }));
}

/** Pass the contract (shape → plan) or plan (plan → build) gate. */
export async function persistFeatureAdvance(input: {
  projectId: string;
  slug: string;
  step: "contract" | "plan";
  change: ChangeEnvelope;
}): Promise<WorkspaceFeatureReview> {
  return requireReview(await core().work.advanceFeature({
    projectId: input.projectId,
    slug: input.slug,
    step: input.step,
    change: changePayload(input.change),
  }));
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Polter text that adds one line to a card (or sets under:) without touching the rest. */
export function featureLineText(slug: string, line: FeatureFlowLine): string {
  const header = `---\npolter: 1\n---\n\n## ${slug}\n`;
  switch (line.kind) {
    case "invariant":
      return `${header}! ${oneLine(line.text)}\n`;
    case "question":
      return `${header}? ${oneLine(line.text)}${line.blocking ? " [blocking]" : ""}\n`;
    case "task": {
      const scope = oneLine(line.scope).replace(/`/g, "");
      return `${header}- [ ] ${oneLine(line.text)}${scope ? ` \`${scope}\`` : ""}\n`;
    }
    case "under":
      return `${header}under: ${oneLine(line.path)}\n`;
  }
}

export async function persistFeatureLine(
  projectId: string,
  slug: string,
  line: FeatureFlowLine,
  change: ChangeEnvelope,
): Promise<WorkspaceFeatureReview> {
  await applyPolter(projectId, featureLineText(slug, line), change);
  return loadFeatureReview(projectId, slug);
}

export async function persistWorkSetStage(
  projectId: string,
  slug: string,
  stage: WorkStage,
  change: ChangeEnvelope,
): Promise<void> {
  await applyPolter(projectId, polterCard(slug, null, { stage }), change);
}

/** Remove a card from the board; the core keeps the row with status removed. */
export async function persistWorkRemoveCard(
  projectId: string,
  slug: string,
  change: ChangeEnvelope,
): Promise<void> {
  await applyPolter(projectId, polterCard(slug, null, { status: "removed" }), change);
}

export async function persistKnowledgeDuplicate(
  workspace: WorkspaceSnapshot,
  projectId: string,
  itemId: string,
  change: ChangeEnvelope,
): Promise<string | undefined> {
  const current = workspace.rawKnowledge.find((item) => asString(item.id) === itemId);
  if (!current) return undefined;
  const id = newId(asString(current.kind) === "verdict" ? "verdict" : "ev");
  const title = `${asString(current.title)} (copy)`;
  await core().knowledge.save({
    item: {
      ...current,
      id,
      projectId,
      title,
    },
    change: changePayload(change),
  });
  return id;
}

export async function persistAddProjectRepo(projectId: string, name: string, path: string): Promise<void> {
  await core().projects.addRepo({ projectId, name, path });
}

export async function persistRemoveProjectRepo(projectId: string, name: string): Promise<void> {
  await core().projects.removeRepo({ projectId, name });
}

export async function persistProjectSettings(
  projectId: string,
  settings: ProjectGeneralSettings,
  environments: readonly ProjectEnvironment[] = [],
): Promise<void> {
  await core().projects.save({
    project: {
      id: projectId,
      name: settings.name,
    },
  });
  await core().projects.saveSettings({
    settings: {
      projectId,
      description: settings.description,
      defaultEnvironmentId: settings.defaultEnvironmentId,
      repository: settings.repository,
    },
  });
  await syncEnvironmentDefaultFlags(projectId, environments, settings.defaultEnvironmentId);
}

export async function persistEnvironment(input: {
  projectId: string;
  name: string;
  kind: EnvironmentKind;
  protection?: ProtectionLevel;
  description?: string;
  isDefault?: boolean;
  existingCount: number;
  settings: ProjectGeneralSettings;
}): Promise<string> {
  const id = newId("env");
  const isDefault = input.isDefault ?? input.existingCount === 0;
  const protection = input.protection ?? protectionForKind(input.kind);
  await core().projects.saveEnvironment({
    environment: {
      id,
      projectId: input.projectId,
      name: input.name,
      kind: input.kind,
      protection,
      isDefault,
      description: input.description ?? `${input.kind} environment`,
    },
  });
  if (isDefault) {
    await core().projects.saveSettings({
      settings: {
        projectId: input.projectId,
        description: input.settings.description,
        defaultEnvironmentId: id,
        repository: input.settings.repository,
      },
    });
  }
  return id;
}

export async function persistEnvironmentDefault(
  workspace: WorkspaceSnapshot,
  projectId: string,
  environmentId: string,
): Promise<void> {
  const environments = workspace.settingsEnvironments;
  if (!environments.some((item) => item.id === environmentId)) return;

  for (const environment of environments) {
    const isDefault = environment.id === environmentId;
    if (environment.isDefault === isDefault) continue;
    await core().projects.saveEnvironment({
      environment: {
        id: environment.id,
        projectId,
        name: environment.name,
        kind: environment.kind,
        protection: environment.protection,
        isDefault,
        description: environment.description ?? "",
      },
    });
  }

  await core().projects.saveSettings({
    settings: {
      projectId,
      description: workspace.settings.description,
      defaultEnvironmentId: environmentId,
      repository: workspace.settings.repository,
    },
  });
}

export async function persistDeleteEnvironment(projectId: string, environmentId: string): Promise<void> {
  await core().projects.deleteEnvironment({ id: environmentId, projectId });
}

export async function persistArchiveProject(projectId: string): Promise<void> {
  await core().projects.archive({ id: projectId });
}

export async function persistCreatedProject(input: {
  name: string;
  directory: string;
  environments: string[];
}): Promise<{ projectId: string; environmentId?: string }> {
  const projectId = newId("proj");
  await core().projects.save({
    project: {
      id: projectId,
      name: input.name,
      rootPath: input.directory,
    },
  });
  let firstEnvironmentId: string | undefined;
  for (const [index, kind] of input.environments.entries()) {
    const environmentId = `${projectId}-${kind}`;
    await core().projects.saveEnvironment({
      environment: {
        id: environmentId,
        projectId,
        name: kind === "production" ? "main" : kind,
        kind,
        protection: kind === "production" ? "strict" : kind === "staging" ? "standard" : "relaxed",
        isDefault: index === 0,
        description: `${kind} environment`,
      },
    });
    firstEnvironmentId ??= environmentId;
  }
  await core().projects.saveSettings({
    settings: {
      projectId,
      description: "",
      defaultEnvironmentId: firstEnvironmentId ?? "",
      repository: "",
    },
  });
  return { projectId, environmentId: firstEnvironmentId };
}

export async function persistIntegrationConnection(input: {
  projectId: string;
  environmentId?: string;
  provider: WorkspaceCatalogProvider;
}): Promise<void> {
  await core().integrations.saveConnection({
    connection: {
      id: newId("int"),
      projectId: input.projectId,
      providerId: input.provider.id,
      status: "connected",
      label: input.provider.name,
      environmentId: input.environmentId ?? "",
      summary: `Local ${input.provider.name} connection`,
      cliCommand: input.provider.binary,
      freshness: "unknown",
    },
  });
}

export async function persistIntegrationSync(input: {
  connectionId: string;
}): Promise<{ result: string; message: string }> {
  const response = asRecord(await core().integrations.syncConnection({
    connectionId: input.connectionId,
  }));
  const run = asRecord(response.run);
  return {
    result: asString(run.result, "failed"),
    message: asString(run.message, "CLI inventory sync finished."),
  };
}

export async function persistImportProjectSources(input: {
  projectId: string;
}): Promise<{
  factCount: number;
  evidenceCount: number;
  sourceCount: number;
  skippedCount: number;
  message: string;
}> {
  const response = asRecord(
    await core().canon.importSources({ projectId: input.projectId }),
  );
  return {
    factCount: asNumber(response.factCount, 0),
    evidenceCount: asNumber(response.evidenceCount, 0),
    sourceCount: asNumber(response.sourceCount, 0),
    skippedCount: asNumber(response.skippedCount, 0),
    message: asString(response.message, "Import finished."),
  };
}

export async function persistCanonFact(input: {
  fact: {
    id?: string;
    projectId: string;
    statement: string;
    truthClass: string;
    entityId?: string;
  };
  change: ChangeEnvelope;
}): Promise<void> {
  await core().canon.upsertFact({
    fact: {
      id: input.fact.id ?? "",
      projectId: input.fact.projectId,
      statement: input.fact.statement,
      truthClass: input.fact.truthClass,
      entityId: input.fact.entityId ?? "",
      source: "",
      actor: "",
      observedAt: "",
      createdAt: "",
      updatedAt: "",
    },
    change: changePayload(input.change),
  });
}

export async function persistCanonEvidence(input: {
  evidence: {
    id?: string;
    projectId: string;
    kind: string;
    summary: string;
    path?: string;
  };
  change: ChangeEnvelope;
}): Promise<{ id: string }> {
  const id = input.evidence.id?.trim() || newId("ev");
  await core().canon.upsertEvidence({
    evidence: {
      id,
      projectId: input.evidence.projectId,
      kind: input.evidence.kind,
      summary: input.evidence.summary,
      path: input.evidence.path ?? "",
      source: "",
      actor: "",
      observedAt: "",
      createdAt: "",
      updatedAt: "",
    },
    change: changePayload(input.change),
  });
  return { id };
}

export async function persistLinkEvidenceToFact(input: {
  projectId: string;
  factId: string;
  evidenceId: string;
  change: ChangeEnvelope;
}): Promise<void> {
  await core().canon.linkEvidenceToFact({
    projectId: input.projectId,
    factId: input.factId,
    evidenceId: input.evidenceId,
    change: changePayload(input.change),
  });
}

export async function resetLocalStore(): Promise<void> {
  await core().health.resetLocalStore({});
}

/** Board config currently declares only its format version; stages stay canonical. */
export async function persistWorkBoardCreate(projectId: string, name: string, change: ChangeEnvelope): Promise<string> {
  const response = asRecord(await core().work.createBoard({
    projectId, name, configJson: '{"version":1}', change: changePayload(change),
  }));
  const id = asString(asRecord(response.board).id);
  if (!id) throw new Error("The core returned no board.");
  return id;
}

export async function persistWorkBoardRename(projectId: string, id: string, name: string, change: ChangeEnvelope): Promise<void> {
  await core().work.updateBoard({ projectId, id, name, change: changePayload(change) });
}

export async function persistWorkBoardDelete(projectId: string, id: string, change: ChangeEnvelope): Promise<void> {
  await core().work.deleteBoard({ projectId, id, change: changePayload(change) });
}

export async function persistWorkBoardsReorder(projectId: string, boardIds: string[], change: ChangeEnvelope): Promise<void> {
  await core().work.reorderBoards({ projectId, boardIds, change: changePayload(change) });
}
