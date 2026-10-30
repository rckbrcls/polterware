import type {
  EnvironmentKind,
  ProjectEnvironment,
  ProjectGeneralSettings,
  ProtectionLevel,
} from "@polterware/feature-settings";
import type { DocType, WorkspaceDecision, WorkspaceCatalogProvider, WorkspaceFeatureReview, WorkspaceMilestone, WorkCardKind, WorkStage } from "@polterware/feature-shell";
import type { ChangeEnvelope, DecisionAction, FeatureFlowLine } from "@polterware/feature-knowledge";
import { asNumber, asObjectArray, asRecord, asString } from "./format";
import type { WorkspaceSnapshot } from "./load";
import { mapFeatureReview } from "./map-feature-review";
import { uniqueCardSlug } from "@polterware/feature-knowledge";
import { readCanvas, readTypes, type CanvasPort } from "@polterware/feature-canvas/model";
import { promotionText, assertApplied, createdDecisionTitle, createdFactId, PromotionAppliedError } from "@polterware/feature-canvas/promotion";

function core() {
  return window.polterware.core;
}

/** Canvas writes use the same audited change envelope as the other surfaces. */
export const canvasPersistence: CanvasPort = {
  async list(projectId) {
    const response = asRecord(await core().canvas.listCanvases({ projectId }));
    return asObjectArray(response.canvases).map(readCanvas);
  },
  async get(projectId, id) {
    const response = asRecord(await core().canvas.getCanvas({ projectId, id }));
    return readCanvas(response.canvas);
  },
  async types() { return readTypes(await core().canvas.listCanvasTypes({})); },
  async create(projectId, name, type) {
    const response = asRecord(await core().canvas.createCanvas({ projectId, name, type, agentVisible: false,
      graph: { nodes: [], edges: [] }, layoutJson: "{}",
      change: { summary: `Create canvas: ${name}`, rationale: "Start a local canvas for visual exploration." } }));
    return readCanvas(response.canvas);
  },
  async update(projectId, id, patch) {
    const response = asRecord(await core().canvas.updateCanvas({ projectId, id, ...patch,
      change: { summary: "Update canvas", rationale: "Save canvas edits from the Desktop editor." } }));
    return readCanvas(response.canvas);
  },
  async promote(projectId, input) {
    const text = promotionText(input);
    if (input.kind === "card") {
      const cards = asObjectArray(asRecord(await core().work.listCards({ projectId })).cards);
      if (cards.some((card) => card.slug === input.slug)) throw new Error("That Work card slug already exists. Choose another slug.");
      // Removed cards are absent from listCards, but still own their slug in Polter.
      const plan = asRecord(await core().work.apply({ projectId, text, dryRun: true }));
      const errors = asObjectArray(plan.diagnostics).filter((item) => item.severity === "error");
      if (errors.length) throw new Error(errors.map((item) => asString(item.message)).join("\n"));
      if (!Array.isArray(plan.ops) || !plan.ops.some((op) => typeof op === "string" && op.startsWith(`+ card ${input.slug} `))) {
        throw new Error("That slug already belongs to a Work card, including removed cards. Choose another slug.");
      }
    }
    if (input.kind === "fact") {
      const plan = asRecord(await core().work.apply({ projectId, text, dryRun: true }));
      const errors = asObjectArray(plan.diagnostics).filter((item) => item.severity === "error");
      if (errors.length) throw new Error(errors.map((item) => asString(item.message)).join("\n"));
      if (!Array.isArray(plan.ops) || !plan.ops.some((op) => typeof op === "string" && op.startsWith("+ fact "))) {
        throw new Error("That slug already belongs to a Fact. Choose another slug.");
      }
    }
    const response = asRecord(await core().work.apply({ projectId, text,
      change: { summary: `Promote canvas item: ${input.title}`, rationale: input.kind === "fact" ? `promoted from canvas ${input.canvasName.replace(/\s+/g, " ").trim()}` : `Promoted from canvas ${input.canvasName}.` } }));
    assertApplied(response);
    try {
      if (input.kind === "card") {
        const cards = asObjectArray(asRecord(await core().work.listCards({ projectId })).cards);
        const card = cards.find((item) => item.slug === input.slug);
        if (!card || !asString(card.id)) throw new Error("The new Work card was not returned.");
        return { kind: "card", id: asString(card.id), title: asString(card.title), slug: asString(card.slug) };
      }
      if (input.kind === "fact") {
        const id = createdFactId(response.ops);
        const facts = asObjectArray(asRecord(await core().canon.listFacts({ projectId })).facts);
        const fact = facts.find((item) => item.id === id);
        if (!fact) throw new Error("The new Fact was not returned.");
        return { kind: "fact", id, title: asString(fact.statement), slug: input.slug };
      }
      const title = createdDecisionTitle(response.ops);
      const items = asObjectArray(asRecord(await core().knowledge.list({ projectId })).items);
      const decision = items.find((item) => item.kind === "decision" && item.title === title);
      if (!decision || !asString(decision.id)) throw new Error("The new Decision was not returned.");
      return { kind: "decision", id: asString(decision.id), title: asString(decision.title) };
    } catch (error) {
      throw new PromotionAppliedError(`The entity was created, but could not be linked. Reload project data and link it using the picker. ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  async listArchived(projectId) {
    const response = asRecord(await core().canvas.listCanvases({ projectId, archived: true }));
    return asObjectArray(response.canvases).map(readCanvas);
  },
  async setArchived(projectId, id, archived) {
    const response = asRecord(await core().canvas.setCanvasArchived({ projectId, id, archived,
      change: { summary: archived ? "Archive canvas" : "Restore canvas", rationale: "" } }));
    return readCanvas(response.canvas);
  },
  async remove(projectId, id) {
    await core().canvas.deleteCanvas({ projectId, id,
      change: { summary: "Delete canvas permanently", rationale: "" } });
  },
};

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
 * Create a knowledge item: a Decision, or a doc of `docType` (doc when omitted) whose
 * `path` points at a project file when the doc stands for one.
 */
export async function persistKnowledgeCreate(input: {
  projectId: string;
  kind: "doc" | "decision";
  docType?: DocType;
  title: string;
  body?: string;
  extraJson?: string;
  tags?: string[];
  path?: string;
  change: ChangeEnvelope;
}): Promise<string> {
  const decision = input.kind === "decision";
  const id = newId(decision ? "decision" : "doc");
  const defaultBody = decision
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
      docType: decision ? "" : (input.docType ?? "doc"),
      tags: decision ? [] : [...new Set(input.tags ?? [])],
      summary: "",
      owner: "human",
      status: decision ? "proposed" : "",
      extraJson: input.extraJson ?? (path ? JSON.stringify({ path }) : "{}"),
    },
    change: changePayload(input.change),
  });
  return id;
}

/** Changes what a doc is (doc, runbook, or source), keeping the rest of the item. */
export async function persistKnowledgeDocType(
  workspace: WorkspaceSnapshot,
  projectId: string,
  itemId: string,
  docType: DocType,
  change: ChangeEnvelope,
): Promise<void> {
  const current = workspace.rawKnowledge.find((item) => asString(item.id) === itemId);
  if (!current) return;
  await core().knowledge.save({
    item: { ...current, projectId, docType },
    change: changePayload(change),
  });
}

/** Scopes a knowledge item (Decision or Evidence) to a Structure node path; an empty path clears it. */
export async function persistKnowledgeScope(projectId: string, id: string, path: string): Promise<void> {
  await core().work.setScope({ projectId, kind: "knowledge", id, node: path });
}

/** Archives a knowledge item, or restores it when `archived` is false. Decisions are refused by the core. */
export async function persistKnowledgeArchived(
  id: string,
  archived: boolean,
  change: ChangeEnvelope,
): Promise<void> {
  await core().knowledge.setArchived({ id, archived, change: changePayload(change) });
}

/** Removes an archived knowledge item for good; the core refuses an active one. */
export async function persistKnowledgeDeletePermanently(
  id: string,
  change: ChangeEnvelope,
): Promise<void> {
  await core().knowledge.delete({ id, change: changePayload(change) });
}

/** The project's archived knowledge items of one kind, newest first. */
export async function loadArchivedKnowledge(projectId: string, kind: string): Promise<ArchivedKnowledgeItem[]> {
  const response = asRecord(await core().knowledge.list({ projectId, kind, archived: true }));
  return asObjectArray(response.items).map((item) => ({
    id: asString(item.id),
    title: asString(item.title),
    tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
    archivedAt: asString(item.archivedAt),
  }));
}

export type ArchivedKnowledgeItem = { id: string; title: string; tags: string[]; archivedAt: string };

/** Polter text for one card: the Desktop writes Work through the same codec as agents. */
function polterCard(slug: string, title: string | null, meta: Record<string, string>): string {
  const heading = title ? `## ${slug}: ${title.replace(/\s+/g, " ").trim()}` : `## ${slug}`;
  const metaLine = Object.entries(meta).map(([key, value]) => `${key}: ${value}`).join(" · ");
  return `---\npolter: 1\n---\n\n${heading}\n${metaLine}\n`;
}

function structureNodeText(input: { heading: string; title: string; level: string; under?: string }): string {
  const meta = [`level: ${input.level}`];
  if (input.under) meta.push(`under: ${input.under}`);
  return `---\npolter: 1\n---\n\n# ${input.heading}: ${polterValue(input.title)}\n${meta.join(" · ")}\n`;
}

/** Create a Structure node. The heading is the slug; under names the parent path. */
export async function persistStructureCreateNode(input: {
  projectId: string;
  heading: string;
  title: string;
  level: string;
  under?: string;
  change: ChangeEnvelope;
}): Promise<void> {
  await applyPolter(input.projectId, structureNodeText(input), input.change);
}

/** Move an existing Structure node under a new parent. The heading is its current path. */
export async function persistStructureMoveNode(input: {
  projectId: string;
  path: string;
  title: string;
  level: string;
  under: string;
  change: ChangeEnvelope;
}): Promise<void> {
  await applyPolter(
    input.projectId,
    structureNodeText({ heading: input.path, title: input.title, level: input.level, under: input.under }),
    input.change,
  );
}

/**
 * Replace a Structure node's `uses:` list (the node paths it depends on). An empty
 * list clears it. The heading is the node's current path.
 */
export async function persistStructureUses(input: {
  projectId: string;
  path: string;
  title: string;
  level: string;
  uses: readonly string[];
  change: ChangeEnvelope;
}): Promise<void> {
  const text = structureNodeText({ heading: input.path, title: input.title, level: input.level });
  await applyPolter(input.projectId, `${text}uses: ${input.uses.join(", ")}\n`, input.change);
}

/**
 * Replace a Structure node's `deploys:` list (environment=provider:resource links).
 * An empty list clears it. The heading is the node's current path.
 */
export async function persistStructureUpdateDeploys(input: {
  projectId: string;
  path: string;
  title: string;
  level: string;
  deploys: readonly { environmentId: string; provider: string; resource: string }[];
  change: ChangeEnvelope;
}): Promise<void> {
  const text = structureNodeText({ heading: input.path, title: input.title, level: input.level });
  const deploysLine = input.deploys.length > 0
    ? `deploys: ${input.deploys.map((d) => `${d.environmentId}=${d.provider}:${d.resource}`).join(", ")}\n`
    : "deploys:\n";
  await applyPolter(input.projectId, `${text}${deploysLine}`, input.change);
}

/**
 * Set a component's `kind:` and `tech:`. Both lines are written, so an empty value
 * clears it. The heading is the node's current path.
 */
export async function persistStructureKindTech(input: {
  projectId: string;
  path: string;
  title: string;
  level: string;
  kind: string;
  tech: string;
  change: ChangeEnvelope;
}): Promise<void> {
  const text = structureNodeText({ heading: input.path, title: input.title, level: input.level });
  await applyPolter(input.projectId, `${text}kind: ${input.kind}\ntech: ${polterValue(input.tech)}\n`, input.change);
}

/** The fields of a Structure node its document edits in place; a field left out is unchanged. */
export type StructureNodePatch = { title?: string; intent?: string; repo?: string; folder?: string; kind?: string; tech?: string };

/**
 * Edit a Structure node in place: the title in its heading, `repo:`, `path:` (the folder),
 * `kind:`, and `tech:` lines (an empty value clears them), and the intent as the paragraph after
 * them. Polter keeps the stored intent when the paragraph is empty, so the intent cannot be cleared
 * here. The heading is the node's current path.
 */
export async function persistStructureNode(input: {
  projectId: string;
  path: string;
  title: string;
  level: string;
  patch: StructureNodePatch;
  change: ChangeEnvelope;
}): Promise<void> {
  const { patch } = input;
  let text = structureNodeText({ heading: input.path, title: patch.title ?? input.title, level: input.level });
  if (patch.repo !== undefined) text += `repo: ${patch.repo}\n`;
  if (patch.folder !== undefined) text += `path: ${patch.folder}\n`;
  if (patch.kind !== undefined) text += `kind: ${patch.kind}\n`;
  if (patch.tech !== undefined) text += `tech: ${polterValue(patch.tech)}\n`;
  if (patch.intent?.trim()) text += `\n${patch.intent.trim()}\n`;
  await applyPolter(input.projectId, text, input.change);
}

/** Puts a card under a component path, or takes it out of any when `under` is empty. */
export async function persistWorkCardUnder(input: { projectId: string; slug: string; under: string; change: ChangeEnvelope }): Promise<void> {
  await applyPolter(input.projectId, polterCard(input.slug, null, { under: input.under }), input.change);
}

/** Scopes a fact to a Structure node path; an empty path clears it. */
export async function persistFactScope(projectId: string, id: string, path: string): Promise<void> {
  await core().work.setScope({ projectId, kind: "fact", id, node: path });
}

async function applyPolter(projectId: string, text: string, change: ChangeEnvelope): Promise<void> {
  await core().work.apply({ projectId, text, change: changePayload(change) });
}

/** Metadata values must not contain the separators a `key: value` line splits on. */
function polterValue(value: string): string {
  return value.replace(/\s+/g, " ").replace(/ [·•] /g, ", ").replace(/ - /g, " – ").trim();
}

/**
 * Move a Decision through its lifecycle as a Polter decision block. The core
 * enforces the legal transitions; a refusal comes back as the error message.
 */
export async function persistDecisionAction(input: {
  projectId: string;
  decision: WorkspaceDecision;
  action: DecisionAction;
  change: ChangeEnvelope;
}): Promise<void> {
  const reason = polterValue(input.change.rationale);
  let block: string;
  switch (input.action.kind) {
    case "activate":
    case "reactivate":
      block = `### ${input.decision.id}\nstatus: active`;
      break;
    case "challenge":
      block = `### ${input.decision.id}\nstatus: challenged · reason: ${reason}`;
      break;
    case "supersede":
      block = `### ${input.action.byId}\nsupersedes: ${input.decision.id} · reason: ${reason}`;
      break;
    case "level":
      block = `### ${input.decision.id}\nlevel: ${input.action.level}`;
      break;
  }
  await applyPolter(input.projectId, `---\npolter: 1\n---\n\n${block}\n`, input.change);
}

/** Create a Work card in Shape; returns its slug. */
export async function persistWorkCreateCard(input: {
  workspace: WorkspaceSnapshot;
  projectId: string;
  title: string;
  /** Defaults to Shape. */
  stage?: string;
  /** The description; it becomes the card's intent. */
  intent?: string;
  /** Slug of the milestone the card ships in; omitted keeps it in the Backlog. */
  milestone?: string;
  /** Path of the component the card lives under. */
  under?: string;
  kind?: "feature" | "architecture";
  change: ChangeEnvelope;
}): Promise<string> {
  const slug = uniqueCardSlug(input.workspace.workCards.map((card) => card.slug), input.title);
  const meta: Record<string, string> = { stage: input.stage || "shape", status: "active" };
  if (input.milestone) meta.milestone = input.milestone;
  if (input.under) meta.under = polterValue(input.under);
  if (input.kind === "architecture") meta.kind = "architecture";
  // A heading line in the intent would start a new block, so its marks are dropped.
  const intent = (input.intent ?? "").split("\n").map((line) => line.replace(/^\s*#+\s+/, "")).join("\n").trim();
  // status: active restores a removed card that already owns this slug.
  await applyPolter(input.projectId, polterCard(slug, input.title, meta) + (intent ? `\n${intent}\n` : ""), input.change);
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

/** What an agent reads before it works on a card (`polterware brief <slug>`). */
export async function loadAgentBrief(projectId: string, slug: string): Promise<string> {
  const raw = asRecord(await core().work.query({ projectId, query: `brief ${slug}` }));
  return typeof raw.text === "string" ? raw.text : "";
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

/** One `## slug` block per card in one Polter text: one audited write, so one change batch. */
function polterCardsMeta(slugs: readonly string[], meta: Record<string, string>): string {
  const metaLine = Object.entries(meta).map(([key, value]) => `${key}: ${value}`).join(" · ");
  return `---\npolter: 1\n---\n\n${slugs.map((slug) => `## ${slug}\n${metaLine}`).join("\n\n")}\n`;
}

/** Move several cards to one milestone (empty slug: the Backlog) under one justification. */
export async function persistWorkSetMilestones(
  projectId: string,
  slugs: readonly string[],
  milestone: string,
  change: ChangeEnvelope,
): Promise<void> {
  await applyPolter(projectId, polterCardsMeta(slugs, { milestone }), change);
}

/** Move several cards to one stage under one justification. */
export async function persistWorkSetStages(
  projectId: string,
  slugs: readonly string[],
  stage: WorkStage,
  change: ChangeEnvelope,
): Promise<void> {
  await applyPolter(projectId, polterCardsMeta(slugs, { stage }), change);
}

/** Archive several cards under one justification; Restore brings them back the same way. */
export async function persistWorkSetCardsStatus(
  projectId: string,
  slugs: readonly string[],
  status: "removed" | "active",
  change: ChangeEnvelope,
): Promise<void> {
  await applyPolter(projectId, polterCardsMeta(slugs, { status }), change);
}

/** Remove a card from the board; the core keeps the row with status removed. */
export async function persistWorkRemoveCard(
  projectId: string,
  slug: string,
  change: ChangeEnvelope,
): Promise<void> {
  await applyPolter(projectId, polterCard(slug, null, { status: "removed" }), change);
}

/** Bring a removed card back to the board. */
export async function persistWorkRestoreCard(
  projectId: string,
  slug: string,
  change: ChangeEnvelope,
): Promise<void> {
  await applyPolter(projectId, polterCard(slug, null, { status: "active" }), change);
}

export async function persistKnowledgeDuplicate(
  workspace: WorkspaceSnapshot,
  projectId: string,
  itemId: string,
  change: ChangeEnvelope,
): Promise<string | undefined> {
  const current = workspace.rawKnowledge.find((item) => asString(item.id) === itemId);
  if (!current) return undefined;
  const id = newId(asString(current.kind) === "decision" ? "decision" : "ev");
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

/** Turns AGENTS.md sync on or off; on writes each checkout's block at once. Returns the files written. */
export async function persistAgentsSync(projectId: string, enabled: boolean): Promise<number> {
  const response = await core().projects.setAgentsSync({ projectId, enabled });
  const files: unknown[] = Array.isArray(response.files) ? response.files : [];
  return files.filter((file) => (file as { action?: string }).action === "write").length;
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

/** Create a milestone; it starts planned and owns no cards. Returns its id. */
export async function persistMilestoneCreate(projectId: string, name: string, change: ChangeEnvelope): Promise<string> {
  const response = asRecord(await core().work.createMilestone({ projectId, name, change: changePayload(change) }));
  const id = asString(asRecord(response.milestone).id);
  if (!id) throw new Error("The core returned no milestone.");
  return id;
}

/** Rename a milestone; the update rewrites every editable field, so the others are sent as they are. */
export async function persistMilestoneRename(projectId: string, milestone: WorkspaceMilestone, name: string, change: ChangeEnvelope): Promise<void> {
  await core().work.updateMilestone({
    projectId, id: milestone.id, name, goal: milestone.goal, exitCriteria: milestone.exitCriteria,
    targetDate: milestone.targetDate, state: milestone.state, change: changePayload(change),
  });
}

/** Archive a milestone; its cards keep it, so a restore brings them back. */
export async function persistMilestoneArchive(projectId: string, id: string, archived: boolean, change: ChangeEnvelope): Promise<void> {
  await core().work.archiveMilestone({ projectId, id, archived, change: changePayload(change) });
}

export async function persistMilestonesReorder(projectId: string, milestoneIds: string[], change: ChangeEnvelope): Promise<void> {
  await core().work.reorderMilestones({ projectId, milestoneIds, change: changePayload(change) });
}
