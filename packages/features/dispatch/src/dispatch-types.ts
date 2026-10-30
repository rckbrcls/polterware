export type DispatchTab =
  | "runs"
  | "agents"
  | "tiers"
  | "learning"
  | "policy"
  | "stats";

export type DispatchHistoryEventKind = "started" | "verified" | "merged" | "failed";

export type DispatchAttemptView = {
  agent: string;
  model: string;
  error: string;
  exitClass: string;
  durationMs?: number;
};

export type DispatchRunView = {
  id: string;
  projectId: string;
  status: string;
  tier: string;
  agent: string;
  model: string;
  provider: string;
  effort: string;
  prompt: string;
  cardSlug: string;
  agentRunId: string;
  dir: string;
  repo: string;
  worktree: string;
  branch: string;
  baseSha: string;
  readOnly: boolean;
  verification: string;
  exitCode: number;
  exitClass: string;
  error: string;
  note: string;
  filesChanged?: number;
  insertions?: number;
  deletions?: number;
  attempts: DispatchAttemptView[];
  resumedOf: string;
  parentRunId: string;
  queuedMs?: number;
  runMs?: number;
  priority: string;
  createdAt: string;
  startedAt: string;
  finishedAt: string;
  mergedAt: string;
  mergeSha: string;
};

export type DispatchRunEventView = {
  id: string;
  runId: string;
  projectId: string;
  kind: DispatchHistoryEventKind;
  agent: string;
  tier: string;
  text: string;
  seq: number;
  at: string;
};

export type DispatchWorktreeView = {
  id: string;
  projectId: string;
  runId: string;
  cardSlug: string;
  path: string;
  branch: string;
  baseSha: string;
  status: string;
  owner: string;
};

export type DispatchQuotaSnapshotView = {
  agent: string;
  provider: string;
  window: string;
  source: string;
  confidence: string;
  usedPercent?: number;
  windowMinutes: number;
  resetsAt: string;
  sampledAt: string;
};

export type DispatchTierView = {
  name: string;
  provider: string;
  agent: string;
  model: string;
  speed: number;
  strength: number;
  position: number;
};

/** A model an installed agent CLI lists, offered in the tier palette. */
export type DispatchModelView = {
  agent: string;
  model: string;
  provider: string;
  tier: string;
};

export type DispatchAgentView = {
  name: string;
  bin: string;
  provider: string;
  quotaSource: string;
  confidence: string;
  risk: string;
  usedPercent?: number;
  cooldownUntil: string;
};

export type DispatchWatchEventView = {
  id: string;
  seq: number;
  kind: string;
  text: string;
  at: string;
};

export type DispatchStatsRowView = {
  key: string;
  runs: number;
  successPct: number;
  firstTryPct: number;
  p50Ms?: number;
  p90Ms?: number;
  fallbacks: number;
  rateLimits: number;
  orphans: number;
};

export type DispatchStatRankView = {
  key: string;
  runs: number;
  samples: number;
  p50Ms?: number;
  successPct?: number;
  reason: string;
};

export type DispatchStatsRankingsView = {
  mostUsedModel: DispatchStatRankView;
  mostUsedProvider: DispatchStatRankView;
  slowestModel: DispatchStatRankView;
  mostFailedModel: DispatchStatRankView;
};

export type DispatchStatsView = {
  by: string;
  since: string;
  inFlight: number;
  rows: DispatchStatsRowView[];
  rankings: DispatchStatsRankingsView;
};

export type DispatchClassifierTierView = {
  tier: string;
  samples: number;
  weights: number[];
};

export type DispatchClassifierView = {
  featureSchema: number;
  minSamples: number;
  featureNames: string[];
  tiers: DispatchClassifierTierView[];
};

export type DispatchCapacityKeyView = {
  key: string;
  windows: number;
  hitFull: number;
  consumedPct?: number;
  leftoverPct?: number;
  leftover: string;
  pace: string;
};

export type DispatchCapacityView = {
  since: string;
  note: string;
  keys: DispatchCapacityKeyView[];
};
