export type AgentRunRow = {
  id: string;
  projectId: string;
  task: string;
  agentLabel: string;
  actorKind: string;
  status: string;
  createdAt: string;
  completedAt: string;
};

export type AgentRunStepRow = {
  id: string;
  agentRunId: string;
  kind: string;
  summary: string;
  payloadJson: string;
  createdAt: string;
};

export type AgentRunDetail = {
  run: AgentRunRow;
  steps: AgentRunStepRow[];
};

export type ProjectChangeRow = {
  stepId: string;
  agentRunId: string;
  projectId: string;
  actorKind: string;
  agentLabel: string;
  runStatus: string;
  runTask: string;
  summary: string;
  payloadJson: string;
  createdAt: string;
  avatarUrl?: string;
};

export type ChangeEnvelopeView = {
  summary: string;
  rationale: string;
  tool: string;
  subjectIds: string[];
  paths: string[];
};

export type CompilePreviewEvidence = {
  id: string;
  kind: string;
  summary: string;
  path: string;
  source: string;
};

export type CompilePreviewItem = {
  kind: string;
  id: string;
  title: string;
  excerpt: string;
  truthClass: string;
  source: string;
  path: string;
  reasons: string[];
  evidence: CompilePreviewEvidence[];
};

export type CompilePreviewResult = {
  tokensUsed: number;
  tokenBudget: number;
  truncated: boolean;
  items: CompilePreviewItem[];
};

export type DriftPreviewFinding = {
  type: string;
  severity: string;
  summary: string;
  subjectIds: string[];
  evidenceIds: string[];
};

export type DriftPreviewResult = {
  projectId: string;
  entityId: string;
  status: string;
  checker: string;
  findings: DriftPreviewFinding[];
};

export type McpStatusView = {
  running: boolean;
  pid: number | null;
  dbPath: string;
  command: string;
  cursorConfig: string;
};

export type SessionClaimRow = {
  slug: string;
  number: number;
  title: string;
  scope: string;
};

/** One agent working now: an open run plus the tasks its label has claimed. */
export type AgentSessionRow = {
  runId: string;
  agent: string;
  task: string;
  startedAt: string;
  claims: SessionClaimRow[];
};

export type SessionHandoffRow = {
  slug: string;
  branch: string;
  goal: string;
  done: string;
  inProgress: string;
  next: string;
  agent: string;
  at: string;
};

export type AgentSessionsView = {
  branch: string;
  sessions: AgentSessionRow[];
  handoffs: SessionHandoffRow[];
};

export type HookSwitchRow = {
  name: string;
  label: string;
  note: string;
  enabled: boolean;
};

export type AgentSetupView = {
  hooks: HookSwitchRow[];
  polterwarePath: string;
  claudePath: string;
  pluginInstalled: boolean;
  pluginEnabled: boolean;
  pluginVersion: string;
  embeddedVersion: string;
  problem: string;
  skillReady: boolean;
  agentsLineReady: boolean;
};
