import type { AgentRunDetail, McpStatusView, ProjectChangeRow } from "./agents-types";

export type AgentsBridge = {
  getMcpStatus: () => Promise<unknown>;
  startMcp: () => Promise<unknown>;
  stopMcp: () => Promise<unknown>;
  listChanges: (payload: {
    projectId: string;
    actorKind?: string;
    limit?: number;
    scopeNodes?: string[];
  }) => Promise<unknown>;
  getAgentRun: (payload: { id: string }) => Promise<unknown>;
};

export function agentsBridge(): AgentsBridge | undefined {
  const root = globalThis as {
    polterware?: {
      app?: {
        getMcpStatus?: () => Promise<unknown>;
        startMcp?: () => Promise<unknown>;
        stopMcp?: () => Promise<unknown>;
      };
      core?: {
        context?: {
          listChanges?: (payload: {
            projectId: string;
            actorKind?: string;
            limit?: number;
            scopeNodes?: string[];
          }) => Promise<unknown>;
          getAgentRun?: (payload: { id: string }) => Promise<unknown>;
        };
      };
    };
  };
  const app = root.polterware?.app;
  const context = root.polterware?.core?.context;
  if (
    !app?.getMcpStatus
    || !app.startMcp
    || !app.stopMcp
    || !context?.listChanges
    || !context.getAgentRun
  ) {
    return undefined;
  }
  return {
    getMcpStatus: app.getMcpStatus,
    startMcp: app.startMcp,
    stopMcp: app.stopMcp,
    listChanges: context.listChanges,
    getAgentRun: context.getAgentRun,
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

function asBoolean(value: unknown): boolean {
  return value === true;
}

export function mapMcpStatus(raw: unknown): McpStatusView {
  const record = asRecord(raw);
  const pidRaw = record.pid;
  return {
    running: asBoolean(record.running),
    pid: typeof pidRaw === "number" ? pidRaw : null,
    dbPath: asString(record.dbPath),
    command: asString(record.command),
    cursorConfig: asString(record.cursorConfig),
  };
}

export function mapAgentRunDetail(raw: unknown): AgentRunDetail | undefined {
  const record = asRecord(raw);
  const runRaw = asRecord(record.run);
  const id = asString(runRaw.id);
  if (!id) return undefined;
  const stepsRaw = Array.isArray(record.steps) ? record.steps : [];
  return {
    run: {
      id,
      projectId: asString(runRaw.projectId),
      task: asString(runRaw.task),
      agentLabel: asString(runRaw.agentLabel),
      actorKind: asString(runRaw.actorKind) || "agent",
      status: asString(runRaw.status),
      createdAt: asString(runRaw.createdAt),
      completedAt: asString(runRaw.completedAt),
    },
    steps: stepsRaw.flatMap((item) => {
      const step = asRecord(item);
      const stepId = asString(step.id);
      if (!stepId) return [];
      return [{
        id: stepId,
        agentRunId: asString(step.agentRunId),
        kind: asString(step.kind),
        summary: asString(step.summary),
        payloadJson: asString(step.payloadJson),
        createdAt: asString(step.createdAt),
      }];
    }),
  };
}

export function mapProjectChanges(raw: unknown): ProjectChangeRow[] {
  const record = asRecord(raw);
  const changes = Array.isArray(record.changes) ? record.changes : [];
  return changes.flatMap((item) => {
    const row = asRecord(item);
    const stepId = asString(row.stepId);
    if (!stepId) return [];
    const avatar = asString(row.avatarUrl) || asString(row.photoUrl) || asString(row.imageUrl);
    return [{
      stepId,
      agentRunId: asString(row.agentRunId),
      projectId: asString(row.projectId),
      actorKind: asString(row.actorKind) || "agent",
      agentLabel: asString(row.agentLabel),
      runStatus: asString(row.runStatus),
      runTask: asString(row.runTask),
      summary: asString(row.summary),
      payloadJson: asString(row.payloadJson),
      createdAt: asString(row.createdAt),
      ...(avatar ? { avatarUrl: avatar } : {}),
    }];
  });
}
