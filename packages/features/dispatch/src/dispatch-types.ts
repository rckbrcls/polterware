export type DispatchTab = "runs" | "worktrees" | "pace" | "tiers";

export type DispatchHistoryEventKind = "started" | "verified" | "merged" | "failed";

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

export type DispatchStatsView = {
  by: string;
  since: string;
  inFlight: number;
  rows: DispatchStatsRowView[];
};
