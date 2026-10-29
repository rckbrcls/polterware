import type { StatusTone } from "@polterware/frontend-design-system";
import type {
  DispatchAgentView,
  DispatchAttemptView,
  DispatchCapacityView,
  DispatchClassifierView,
  DispatchHistoryEventKind,
  DispatchQuotaSnapshotView,
  DispatchRunEventView,
  DispatchRunView,
  DispatchStatRankView,
  DispatchStatsView,
  DispatchModelView,
  DispatchTierView,
  DispatchWatchEventView,
  DispatchWorktreeView,
} from "./dispatch-types";

export type DispatchBridge = {
  listRuns: (payload: { projectId: string; limit: number; offset?: number }) => Promise<unknown>;
  getRun: (payload: { id: string }) => Promise<unknown>;
  startRun: (payload: {
    projectId: string;
    tier: string;
    prompt: string;
    cardSlug?: string;
    agent?: string;
    worktree?: string;
    dir?: string;
    readOnly?: boolean;
  }) => Promise<unknown>;
  cancelRun: (payload: { id: string }) => Promise<unknown>;
  result: (payload: { id: string; section?: string; offset?: number; limit?: number }) => Promise<unknown>;
  listWorktrees: (payload: { projectId: string }) => Promise<unknown>;
  listQuota: (payload?: { agent?: string; since?: string }) => Promise<unknown>;
  listTiers: (payload?: Record<string, never>) => Promise<unknown>;
  listAgents: (payload?: Record<string, never>) => Promise<unknown>;
  listHistory: (payload: {
    projectId: string;
    agent?: string;
    tier?: string;
    limit?: number;
    offset?: number;
  }) => Promise<unknown>;
  checkTiers: (payload?: Record<string, never>) => Promise<unknown>;
  /** Models the installed agent CLIs list; absent on cores that predate it. */
  listModels?: (payload?: Record<string, never>) => Promise<unknown>;
  /** Replaces the whole tier table; absent on cores that predate it. */
  replaceTiers?: (payload: { tiers: DispatchTierView[] }) => Promise<unknown>;
  stats: (payload: { projectId: string; by?: string; since?: string }) => Promise<unknown>;
  getClassifier: (payload?: Record<string, never>) => Promise<unknown>;
  capacity: (payload?: { since?: string }) => Promise<unknown>;
  watchRun: (
    input: string | { id: string; afterSeq?: number },
    callback: (event: DispatchWatchEventView) => void,
  ) => () => void;
};

export function dispatchBridge(): DispatchBridge | undefined {
  const root = globalThis as {
    polterware?: {
      core?: {
        dispatch?: Partial<DispatchBridge>;
      };
    };
  };
  const d = root.polterware?.core?.dispatch;
  if (
    !d?.listRuns
    || !d.getRun
    || !d.startRun
    || !d.cancelRun
    || !d.result
    || !d.listWorktrees
    || !d.listQuota
    || !d.listTiers
    || !d.listAgents
    || !d.listHistory
    || !d.checkTiers
    || !d.stats
    || !d.getClassifier
    || !d.capacity
  ) {
    return undefined;
  }
  return {
    listRuns: d.listRuns,
    getRun: d.getRun,
    startRun: d.startRun,
    cancelRun: d.cancelRun,
    result: d.result,
    listWorktrees: d.listWorktrees,
    listQuota: d.listQuota,
    listTiers: d.listTiers,
    listAgents: d.listAgents,
    listHistory: d.listHistory,
    checkTiers: d.checkTiers,
    listModels: d.listModels,
    replaceTiers: d.replaceTiers,
    stats: d.stats,
    getClassifier: d.getClassifier,
    capacity: d.capacity,
    watchRun: d.watchRun ?? (() => () => {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Measured milliseconds. Missing stays unset; a real zero stays zero. */
function asOptionalMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseAttempts(value: unknown): DispatchAttemptView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = asRecord(item);
    const durationMs = asOptionalMs(row.durationMs);
    return [{
      agent: asString(row.agent),
      model: asString(row.model),
      error: asString(row.error),
      exitClass: asString(row.exitClass),
      ...(durationMs !== undefined ? { durationMs } : {}),
    }];
  });
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function parseRunObject(row: Record<string, unknown>): DispatchRunView | undefined {
  const id = asString(row.id);
  if (!id) return undefined;
  const filesChanged = asOptionalNumber(row.filesChanged);
  const insertions = asOptionalNumber(row.insertions);
  const deletions = asOptionalNumber(row.deletions);
  const queuedMs = asOptionalMs(row.queuedMs);
  const runMs = asOptionalMs(row.runMs);
  return {
    id,
    projectId: asString(row.projectId),
    status: asString(row.status),
    tier: asString(row.tier),
    agent: asString(row.agent),
    model: asString(row.model),
    provider: asString(row.provider),
    effort: asString(row.effort),
    prompt: asString(row.prompt),
    cardSlug: asString(row.cardSlug),
    agentRunId: asString(row.agentRunId),
    dir: asString(row.dir),
    repo: asString(row.repo),
    worktree: asString(row.worktree),
    branch: asString(row.branch),
    baseSha: asString(row.baseSha),
    readOnly: asBoolean(row.readOnly),
    verification: asString(row.verification),
    exitCode: asNumber(row.exitCode),
    exitClass: asString(row.exitClass),
    error: asString(row.error),
    note: asString(row.note),
    ...(filesChanged !== undefined ? { filesChanged } : {}),
    ...(insertions !== undefined ? { insertions } : {}),
    ...(deletions !== undefined ? { deletions } : {}),
    attempts: parseAttempts(row.attempts),
    resumedOf: asString(row.resumedOf),
    parentRunId: asString(row.parentRunId),
    ...(queuedMs !== undefined ? { queuedMs } : {}),
    ...(runMs !== undefined ? { runMs } : {}),
    priority: asString(row.priority),
    createdAt: asString(row.createdAt),
    startedAt: asString(row.startedAt),
    finishedAt: asString(row.finishedAt),
    mergedAt: asString(row.mergedAt),
    mergeSha: asString(row.mergeSha),
  };
}

export function mapDispatchRun(raw: unknown): DispatchRunView | undefined {
  const record = asRecord(raw);
  const nested = record.run ? asRecord(record.run) : record;
  return parseRunObject(nested);
}

export function mapDispatchRuns(raw: unknown): DispatchRunView[] {
  const record = asRecord(raw);
  const runs = Array.isArray(record.runs) ? record.runs : [];
  return runs.flatMap((item) => {
    const parsed = parseRunObject(asRecord(item));
    return parsed ? [parsed] : [];
  });
}

const HISTORY_KINDS = new Set<DispatchHistoryEventKind>(["started", "verified", "merged", "failed"]);

export function isDispatchHistoryKind(value: string): value is DispatchHistoryEventKind {
  return HISTORY_KINDS.has(value as DispatchHistoryEventKind);
}

export function mapDispatchHistory(raw: unknown): DispatchRunEventView[] {
  const record = asRecord(raw);
  const events = Array.isArray(record.events) ? record.events : [];
  return events.flatMap((item) => {
    const row = asRecord(item);
    const id = asString(row.id);
    const kind = asString(row.kind);
    if (!id || !isDispatchHistoryKind(kind)) return [];
    return [{
      id,
      runId: asString(row.runId),
      projectId: asString(row.projectId),
      kind,
      agent: asString(row.agent),
      tier: asString(row.tier),
      text: asString(row.text),
      seq: asNumber(row.seq),
      at: asString(row.at),
    }];
  });
}

export function mapDispatchWorktrees(raw: unknown): DispatchWorktreeView[] {
  const record = asRecord(raw);
  const worktrees = Array.isArray(record.worktrees) ? record.worktrees : [];
  return worktrees.flatMap((item) => {
    const row = asRecord(item);
    const id = asString(row.id) || asString(row.path);
    if (!id) return [];
    return [{
      id,
      projectId: asString(row.projectId),
      runId: asString(row.runId),
      cardSlug: asString(row.cardSlug),
      path: asString(row.path),
      branch: asString(row.branch),
      baseSha: asString(row.baseSha),
      status: asString(row.status) || "active",
      owner: asString(row.owner),
    }];
  });
}

export function mapDispatchQuotaSnapshots(raw: unknown): DispatchQuotaSnapshotView[] {
  const record = asRecord(raw);
  const snapshots = Array.isArray(record.snapshots) ? record.snapshots : [];
  return snapshots.flatMap((item) => {
    const row = asRecord(item);
    const agent = asString(row.agent);
    if (!agent) return [];
    const usedPercent = asOptionalNumber(row.usedPercent);
    return [{
      agent,
      provider: asString(row.provider),
      window: asString(row.window),
      source: asString(row.source),
      confidence: asString(row.confidence),
      ...(usedPercent !== undefined ? { usedPercent } : {}),
      windowMinutes: asNumber(row.windowMinutes),
      resetsAt: asString(row.resetsAt),
      sampledAt: asString(row.sampledAt),
    }];
  });
}

export function mapDispatchTiers(raw: unknown): DispatchTierView[] {
  const record = asRecord(raw);
  const tiers = Array.isArray(record.tiers) ? record.tiers : [];
  return tiers.flatMap((item) => {
    const row = asRecord(item);
    const name = asString(row.name);
    if (!name) return [];
    return [{
      name,
      provider: asString(row.provider),
      agent: asString(row.agent),
      model: asString(row.model),
      speed: asNumber(row.speed),
      strength: asNumber(row.strength),
      position: asNumber(row.position),
    }];
  });
}

export function mapDispatchModels(raw: unknown): DispatchModelView[] {
  const record = asRecord(raw);
  const models = Array.isArray(record.models) ? record.models : [];
  return models.flatMap((item) => {
    const row = asRecord(item);
    const agent = asString(row.agent);
    const model = asString(row.model);
    if (!agent || !model) return [];
    return [{ agent, model, provider: asString(row.provider), tier: asString(row.tier) }];
  });
}

export function mapDispatchAgents(raw: unknown): DispatchAgentView[] {
  const record = asRecord(raw);
  const agents = Array.isArray(record.agents) ? record.agents : [];
  return agents.flatMap((item) => {
    const row = asRecord(item);
    const name = asString(row.name);
    if (!name) return [];
    const usedPercent = asOptionalNumber(row.usedPercent);
    return [{
      name,
      bin: asString(row.bin),
      provider: asString(row.provider),
      quotaSource: asString(row.quotaSource),
      confidence: asString(row.confidence),
      risk: asString(row.risk),
      ...(usedPercent !== undefined ? { usedPercent } : {}),
      cooldownUntil: asString(row.cooldownUntil),
    }];
  });
}

export function mapCheckTiersProblems(raw: unknown): string[] {
  const record = asRecord(raw);
  const problems = Array.isArray(record.problems) ? record.problems : [];
  return problems.flatMap((item) => {
    const text = asString(item).trim();
    return text ? [text] : [];
  });
}

export function mapDispatchResult(raw: unknown): { content: string; total: number } {
  const record = asRecord(raw);
  return {
    content: asString(record.content),
    total: asNumber(record.total),
  };
}

function parseStatRank(value: unknown): DispatchStatRankView {
  const row = asRecord(value);
  const p50Ms = asOptionalNumber(row.p50Ms);
  const successPct = asOptionalNumber(row.successPct);
  return {
    key: asString(row.key),
    runs: asNumber(row.runs),
    samples: asNumber(row.samples),
    ...(p50Ms !== undefined ? { p50Ms } : {}),
    ...(successPct !== undefined ? { successPct } : {}),
    reason: asString(row.reason),
  };
}

export function mapDispatchStats(raw: unknown): DispatchStatsView {
  const record = asRecord(raw);
  const rows = Array.isArray(record.rows) ? record.rows : [];
  const rankingsRaw = asRecord(record.rankings);
  return {
    by: asString(record.by),
    since: asString(record.since),
    inFlight: asNumber(record.inFlight),
    rows: rows.flatMap((item) => {
      const row = asRecord(item);
      const key = asString(row.key);
      if (!key) return [];
      const p50Ms = asOptionalNumber(row.p50Ms);
      const p90Ms = asOptionalNumber(row.p90Ms);
      return [{
        key,
        runs: asNumber(row.runs),
        successPct: asNumber(row.successPct),
        firstTryPct: asNumber(row.firstTryPct),
        ...(p50Ms !== undefined ? { p50Ms } : {}),
        ...(p90Ms !== undefined ? { p90Ms } : {}),
        fallbacks: asNumber(row.fallbacks),
        rateLimits: asNumber(row.rateLimits),
        orphans: asNumber(row.orphans),
      }];
    }),
    rankings: {
      mostUsedModel: parseStatRank(rankingsRaw.mostUsedModel ?? record.mostUsedModel),
      mostUsedProvider: parseStatRank(rankingsRaw.mostUsedProvider ?? record.mostUsedProvider),
      slowestModel: parseStatRank(rankingsRaw.slowestModel ?? record.slowestModel),
      mostFailedModel: parseStatRank(rankingsRaw.mostFailedModel ?? record.mostFailedModel),
    },
  };
}

export function mapDispatchClassifier(raw: unknown): DispatchClassifierView {
  const record = asRecord(raw);
  const featureNames = Array.isArray(record.featureNames)
    ? record.featureNames.map((item) => asString(item)).filter(Boolean)
    : [];
  const rawTiers = Array.isArray(record.tiers) ? record.tiers : [];
  return {
    featureSchema: asNumber(record.featureSchema, 1),
    minSamples: asNumber(record.minSamples, 5),
    featureNames,
    tiers: rawTiers.flatMap((item) => {
      const row = asRecord(item);
      const tier = asString(row.tier);
      if (!tier) return [];
      const weights = Array.isArray(row.weights)
        ? row.weights.map((w) => asNumber(w))
        : [];
      return [{
        tier,
        samples: asNumber(row.samples),
        weights,
      }];
    }),
  };
}

export function mapDispatchCapacity(raw: unknown): DispatchCapacityView {
  const record = asRecord(raw);
  const rawKeys = Array.isArray(record.keys) ? record.keys : [];
  return {
    since: asString(record.since),
    note: asString(record.note),
    keys: rawKeys.flatMap((item) => {
      const row = asRecord(item);
      const key = asString(row.key);
      if (!key) return [];
      const consumedPct = asOptionalNumber(row.consumedPct);
      const leftoverPct = asOptionalNumber(row.leftoverPct);
      return [{
        key,
        windows: asNumber(row.windows),
        hitFull: asNumber(row.hitFull),
        ...(consumedPct !== undefined ? { consumedPct } : {}),
        ...(leftoverPct !== undefined ? { leftoverPct } : {}),
        leftover: asString(row.leftover),
        pace: asString(row.pace),
      }];
    }),
  };
}

export function dispatchStatusTone(status: string): StatusTone {
  const normalized = status.toLowerCase();
  if (
    normalized === "merged"
    || normalized === "verified"
    || normalized === "completed"
    || normalized === "passed"
    || normalized === "clean"
    || normalized === "ok"
    || normalized === "low"
    || normalized === "high"
    || normalized === "no ritmo"
    || normalized === "on pace"
    || normalized === "atrasado"
  ) {
    return "ok";
  }
  if (
    normalized === "running"
    || normalized === "started"
    || normalized === "starting"
    || normalized === "queued"
    || normalized === "pending"
    || normalized === "active"
    || normalized === "verifying"
  ) {
    return "syncing";
  }
  if (normalized === "failed" || normalized === "error" || normalized === "blocked" || normalized === "orphaned") {
    return "danger";
  }
  if (
    normalized === "cancelled"
    || normalized === "canceled"
    || normalized === "timed_out"
    || normalized === "abandoned"
    || normalized === "dirty"
    || normalized === "medium"
    || normalized === "adiantado"
  ) {
    return "warn";
  }
  if (normalized === "ready") return "ok";
  return "muted";
}

export function formatUsedPercent(usedPercent: number | undefined): string {
  if (usedPercent === undefined || !Number.isFinite(usedPercent)) return "unknown";
  return `${usedPercent.toFixed(1)}%`;
}
