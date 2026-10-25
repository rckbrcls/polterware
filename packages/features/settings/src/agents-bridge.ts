import type {
  AgentRunDetail,
  CompilePreviewResult,
  DriftPreviewResult,
  McpStatusView,
  ProjectChangeRow,
} from "./agents-types";

export type AgentsBridge = {
  getMcpStatus: () => Promise<unknown>;
  startMcp: () => Promise<unknown>;
  stopMcp: () => Promise<unknown>;
  compileContext: (payload: {
    projectId: string;
    query: string;
    entityId?: string;
    tokenBudget: number;
  }) => Promise<unknown>;
  checkDrift: (payload: {
    projectId: string;
    entityId?: string;
  }) => Promise<unknown>;
  listChanges: (payload: {
    projectId: string;
    actorKind?: string;
    limit?: number;
    scopeNodes?: string[];
  }) => Promise<unknown>;
  getAgentRun: (payload: { id: string }) => Promise<unknown>;
};

export function workQuery():
  | ((payload: { projectId: string; query: string }) => Promise<unknown>)
  | undefined {
  const root = globalThis as {
    polterware?: { core?: { work?: { query?: (payload: { projectId: string; query: string }) => Promise<unknown> } } };
  };
  return root.polterware?.core?.work?.query;
}

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
          compile?: (payload: {
            projectId: string;
            query: string;
            entityId?: string;
            tokenBudget: number;
          }) => Promise<unknown>;
          checkDrift?: (payload: {
            projectId: string;
            entityId?: string;
          }) => Promise<unknown>;
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
    || !context?.compile
    || !context.checkDrift
    || !context.listChanges
    || !context.getAgentRun
  ) {
    return undefined;
  }
  return {
    getMcpStatus: app.getMcpStatus,
    startMcp: app.startMcp,
    stopMcp: app.stopMcp,
    compileContext: context.compile,
    checkDrift: context.checkDrift,
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

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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

export function mapCompileResult(raw: unknown): CompilePreviewResult {
  const record = asRecord(raw);
  const itemsRaw = Array.isArray(record.items) ? record.items : [];
  return {
    tokensUsed: asNumber(record.tokensUsed),
    tokenBudget: asNumber(record.tokenBudget),
    truncated: asBoolean(record.truncated),
    items: itemsRaw.flatMap((item) => {
      const row = asRecord(item);
      const id = asString(row.id);
      if (!id) return [];
      const reasonsRaw = Array.isArray(row.reasons) ? row.reasons : [];
      const evidenceRaw = Array.isArray(row.evidence) ? row.evidence : [];
      return [{
        kind: asString(row.kind),
        id,
        title: asString(row.title) || id,
        excerpt: asString(row.excerpt),
        truthClass: asString(row.truthClass),
        source: asString(row.source),
        path: asString(row.path),
        reasons: reasonsRaw.flatMap((value) => {
          const reason = asString(value);
          return reason ? [reason] : [];
        }),
        evidence: evidenceRaw.flatMap((value) => {
          const ev = asRecord(value);
          const evidenceId = asString(ev.id);
          if (!evidenceId) return [];
          return [{
            id: evidenceId,
            kind: asString(ev.kind),
            summary: asString(ev.summary),
            path: asString(ev.path),
            source: asString(ev.source),
          }];
        }),
      }];
    }),
  };
}

export function mapDriftResult(value: unknown): DriftPreviewResult {
  const raw = asRecord(value);
  const findingsRaw = Array.isArray(raw.findings) ? raw.findings : [];
  return {
    projectId: asString(raw.projectId),
    entityId: asString(raw.entityId),
    status: asString(raw.status),
    checker: asString(raw.checker) || "narrow",
    findings: findingsRaw.flatMap((item) => {
      const row = asRecord(item);
      const subjectIds = Array.isArray(row.subjectIds)
        ? row.subjectIds.flatMap((value) => {
            const id = asString(value);
            return id ? [id] : [];
          })
        : [];
      const evidenceIds = Array.isArray(row.evidenceIds)
        ? row.evidenceIds.flatMap((value) => {
            const id = asString(value);
            return id ? [id] : [];
          })
        : [];
      return [{
        type: asString(row.type),
        severity: asString(row.severity),
        summary: asString(row.summary),
        subjectIds,
        evidenceIds,
      }];
    }),
  };
}
