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

export type McpStatusView = {
  running: boolean;
  pid: number | null;
  dbPath: string;
  command: string;
  cursorConfig: string;
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
