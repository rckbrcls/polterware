import type { JsonObject } from "../../../shared/ipc.js";
import { Code, ConnectError } from "@connectrpc/connect";
import { decodeBase64Bytes, toJsonObject, type CoreClients } from "../client.js";

function payload(value: JsonObject | undefined): Record<string, unknown> {
  return value ?? {};
}

function requestMessage(value: JsonObject | undefined): never {
  return payload(value) as never;
}

function terminalWriteMessage(value: JsonObject | undefined): never {
  const next = payload(value);
  const data = decodeBase64Bytes(next.data);
  if (data) next.data = data;
  return next as never;
}

function isTerminalNotFound(error: unknown): boolean {
  if (error instanceof ConnectError) {
    if (error.code === Code.NotFound) return true;
    const raw = `${error.rawMessage ?? ""} ${error.message}`.toLowerCase();
    if (raw.includes("terminal session not found")) return true;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("terminal session not found") || message.includes("not_found");
}

export type CoreDomainControllerOptions = {
  emitRunEvent?: (event: JsonObject) => void;
};

export function createCoreDomainControllers(
  clients: CoreClients,
  options: CoreDomainControllerOptions = {},
) {
  const runWatchers = new Map<string, AbortController>();

  return {
    healthCheck: async () => toJsonObject(await clients.health.check({})),
    getStoreHealth: async () => toJsonObject(await clients.maintenance.getStoreHealth({})),
    resetLocalStore: async () => toJsonObject(await clients.maintenance.resetLocalStore({})),
    listProjects: async (input?: JsonObject) => toJsonObject(await clients.projects.listProjects(requestMessage(input))),
    saveProject: async (input?: JsonObject) => toJsonObject(await clients.projects.saveProject(requestMessage(input))),
    archiveProject: async (input?: JsonObject) => toJsonObject(await clients.projects.archiveProject(requestMessage(input))),
    listEnvironments: async (input?: JsonObject) => toJsonObject(await clients.projects.listEnvironments(requestMessage(input))),
    saveEnvironment: async (input?: JsonObject) => toJsonObject(await clients.projects.saveEnvironment(requestMessage(input))),
    deleteEnvironment: async (input?: JsonObject) => toJsonObject(await clients.projects.deleteEnvironment(requestMessage(input))),
    getProjectSettings: async (input?: JsonObject) => toJsonObject(await clients.projects.getProjectSettings(requestMessage(input))),
    saveProjectSettings: async (input?: JsonObject) => toJsonObject(await clients.projects.saveProjectSettings(requestMessage(input))),
    setAgentsSync: async (input?: JsonObject) => toJsonObject(await clients.work.setAgentsSync(requestMessage(input))),
    listProjectRepos: async (input?: JsonObject) => toJsonObject(await clients.projects.listProjectRepos(requestMessage(input))),
    addProjectRepo: async (input?: JsonObject) => toJsonObject(await clients.projects.addProjectRepo(requestMessage(input))),
    removeProjectRepo: async (input?: JsonObject) => toJsonObject(await clients.projects.removeProjectRepo(requestMessage(input))),
    listCanvases: async (input?: JsonObject) => toJsonObject(await clients.canvas.listCanvases(requestMessage(input))),
    getCanvas: async (input?: JsonObject) => toJsonObject(await clients.canvas.getCanvas(requestMessage(input))),
    createCanvas: async (input?: JsonObject) => toJsonObject(await clients.canvas.createCanvas(requestMessage(input))),
    updateCanvas: async (input?: JsonObject) => toJsonObject(await clients.canvas.updateCanvas(requestMessage(input))),
    setCanvasArchived: async (input?: JsonObject) => toJsonObject(await clients.canvas.setCanvasArchived(requestMessage(input))),
    deleteCanvas: async (input?: JsonObject) => toJsonObject(await clients.canvas.deleteCanvas(requestMessage(input))),
    listCanvasTypes: async (input?: JsonObject) => toJsonObject(await clients.canvas.listCanvasTypes(requestMessage(input))),
    listKnowledge: async (input?: JsonObject) => toJsonObject(await clients.knowledge.listKnowledge(requestMessage(input))),
    saveKnowledge: async (input?: JsonObject) => toJsonObject(await clients.knowledge.saveKnowledge(requestMessage(input))),
    setKnowledgeArchived: async (input?: JsonObject) => toJsonObject(await clients.knowledge.setKnowledgeArchived(requestMessage(input))),
    deleteKnowledge: async (input?: JsonObject) => toJsonObject(await clients.knowledge.deleteKnowledge(requestMessage(input))),
    searchKnowledge: async (input?: JsonObject) => toJsonObject(await clients.knowledge.searchKnowledge(requestMessage(input))),
    listKnowledgeLinks: async (input?: JsonObject) => toJsonObject(await clients.knowledge.listKnowledgeLinks(requestMessage(input))),
    saveKnowledgeLink: async (input?: JsonObject) => toJsonObject(await clients.knowledge.saveKnowledgeLink(requestMessage(input))),
    deleteKnowledgeLink: async (input?: JsonObject) => toJsonObject(await clients.knowledge.deleteKnowledgeLink(requestMessage(input))),
    listMilestones: async (input?: JsonObject) => toJsonObject(await clients.work.listMilestones(requestMessage(input))),
    createMilestone: async (input?: JsonObject) => toJsonObject(await clients.work.createMilestone(requestMessage(input))),
    updateMilestone: async (input?: JsonObject) => toJsonObject(await clients.work.updateMilestone(requestMessage(input))),
    archiveMilestone: async (input?: JsonObject) => toJsonObject(await clients.work.archiveMilestone(requestMessage(input))),
    reorderMilestones: async (input?: JsonObject) => toJsonObject(await clients.work.reorderMilestones(requestMessage(input))),
    listSavedFilters: async (input?: JsonObject) => toJsonObject(await clients.savedFilters.listSavedFilters(requestMessage(input))),
    saveSavedFilter: async (input?: JsonObject) => toJsonObject(await clients.savedFilters.saveSavedFilter(requestMessage(input))),
    deleteSavedFilter: async (input?: JsonObject) => toJsonObject(await clients.savedFilters.deleteSavedFilter(requestMessage(input))),
    listWorkCards: async (input?: JsonObject) => toJsonObject(await clients.work.listWorkCards(requestMessage(input))),
    listStructure: async (input?: JsonObject) => toJsonObject(await clients.work.listStructure(requestMessage(input))),
    listAgentSessions: async (input?: JsonObject) =>
      toJsonObject(await clients.work.listAgentSessions(requestMessage(input))),
    listStructureHistory: async (input?: JsonObject) =>
      toJsonObject(await clients.work.listStructureHistory(requestMessage(input))),
    queryPolter: async (input?: JsonObject) => toJsonObject(await clients.work.queryPolter(requestMessage(input))),
    applyPolter: async (input?: JsonObject) => toJsonObject(await clients.work.applyPolter(requestMessage(input))),
    listInbox: async (input?: JsonObject) => toJsonObject(await clients.work.listInbox(requestMessage(input))),
    listRules: async (input?: JsonObject) => toJsonObject(await clients.work.listRules(requestMessage(input))),
    resolveInboxItem: async (input?: JsonObject) => toJsonObject(await clients.work.resolveInboxItem(requestMessage(input))),
    setScope: async (input?: JsonObject) => toJsonObject(await clients.work.setScope(requestMessage(input))),
    reviewFeature: async (input?: JsonObject) => toJsonObject(await clients.work.reviewFeature(requestMessage(input))),
    createFeature: async (input?: JsonObject) => toJsonObject(await clients.work.createFeature(requestMessage(input))),
    advanceFeature: async (input?: JsonObject) => toJsonObject(await clients.work.advanceFeature(requestMessage(input))),
    verifyFeature: async (input?: JsonObject) => toJsonObject(await clients.work.verifyFeature(requestMessage(input))),
    listCanonEntities: async (input?: JsonObject) => toJsonObject(await clients.canon.listEntities(requestMessage(input))),
    syncProjectModel: async (input?: JsonObject) => toJsonObject(await clients.canon.syncProjectModel(requestMessage(input))),
    listFacts: async (input?: JsonObject) => toJsonObject(await clients.canon.listFacts(requestMessage(input))),
    getFact: async (input?: JsonObject) => toJsonObject(await clients.canon.getFact(requestMessage(input))),
    upsertFact: async (input?: JsonObject) => toJsonObject(await clients.canon.upsertFact(requestMessage(input))),
    getAgentRun: async (input?: JsonObject) => toJsonObject(await clients.agentRuns.getAgentRun(requestMessage(input))),
    listChanges: async (input?: JsonObject) => toJsonObject(await clients.agentRuns.listChanges(requestMessage(input))),
    getAgentSetup: async (input?: JsonObject) => toJsonObject(await clients.agentRuns.getAgentSetup(requestMessage(input))),
    setHookSwitch: async (input?: JsonObject) => toJsonObject(await clients.agentRuns.setHookSwitch(requestMessage(input))),
    listRuns: async (input?: JsonObject) => toJsonObject(await clients.dispatch.listRuns(requestMessage(input))),
    getRun: async (input?: JsonObject) => toJsonObject(await clients.dispatch.getRun(requestMessage(input))),
    startRun: async (input?: JsonObject) => toJsonObject(await clients.dispatch.startRun(requestMessage(input))),
    cancelRun: async (input?: JsonObject) => toJsonObject(await clients.dispatch.cancelRun(requestMessage(input))),
    verifyRun: async (input?: JsonObject) => toJsonObject(await clients.dispatch.verifyRun(requestMessage(input))),
    mergeRun: async (input?: JsonObject) => toJsonObject(await clients.dispatch.mergeRun(requestMessage(input))),
    cleanRun: async (input?: JsonObject) => toJsonObject(await clients.dispatch.cleanRun(requestMessage(input))),
    recoverRun: async (input?: JsonObject) => toJsonObject(await clients.dispatch.recoverRun(requestMessage(input))),
    routeDispatch: async (input?: JsonObject) => toJsonObject(await clients.dispatch.route(requestMessage(input))),
    classifyDispatch: async (input?: JsonObject) => toJsonObject(await clients.dispatch.classify(requestMessage(input))),
    dispatchConfig: async (input?: JsonObject) => toJsonObject(await clients.dispatch.config(requestMessage(input))),
    dispatchSubagents: async (input?: JsonObject) => toJsonObject(await clients.dispatch.subagents(requestMessage(input))),
    initDispatchVerify: async (input?: JsonObject) => toJsonObject(await clients.dispatch.initVerify(requestMessage(input))),
    dispatchSkill: async (input?: JsonObject) => toJsonObject(await clients.dispatch.skill(requestMessage(input))),
    result: async (input?: JsonObject) => toJsonObject(await clients.dispatch.result(requestMessage(input))),
    watchRun: async (input?: JsonObject) => {
      const raw = payload(input);
      const id = typeof raw.id === "string" ? raw.id.trim() : "";
      const subscriptionId =
        typeof raw.subscriptionId === "string" && raw.subscriptionId.trim()
          ? raw.subscriptionId.trim()
          : id;
      const afterSeq = BigInt(typeof raw.afterSeq === "number" && Number.isFinite(raw.afterSeq) ? Math.max(0, Math.trunc(raw.afterSeq)) : 0);
      if (!id || !subscriptionId) return { ok: false };
      runWatchers.get(subscriptionId)?.abort();
      const controller = new AbortController();
      runWatchers.set(subscriptionId, controller);
      void (async () => {
        try {
          const stream = clients.dispatch.watchRun({ id, afterSeq }, { signal: controller.signal });
          for await (const item of stream) {
            if (controller.signal.aborted) break;
            options.emitRunEvent?.({
              subscriptionId,
              id,
              seq: Number(item.seq),
              kind: item.kind,
              text: item.text,
              at: item.at,
            });
          }
        } catch {
          // Stream closed or cancelled.
        } finally {
          if (runWatchers.get(subscriptionId) === controller) {
            runWatchers.delete(subscriptionId);
          }
        }
      })();
      return { ok: true, subscriptionId };
    },
    unwatchRun: async (input?: JsonObject) => {
      const raw = payload(input);
      const subscriptionId =
        typeof raw.subscriptionId === "string" && raw.subscriptionId.trim()
          ? raw.subscriptionId.trim()
          : typeof raw.id === "string"
            ? raw.id.trim()
            : "";
      if (subscriptionId) {
        runWatchers.get(subscriptionId)?.abort();
        runWatchers.delete(subscriptionId);
      }
      return { ok: true };
    },
    listWorktrees: async (input?: JsonObject) => toJsonObject(await clients.dispatch.listWorktrees(requestMessage(input))),
    listQuota: async (input?: JsonObject) => toJsonObject(await clients.dispatch.listQuota(requestMessage(input))),
    listTiers: async (input?: JsonObject) => toJsonObject(await clients.dispatch.listTiers(requestMessage(input))),
    listAgents: async (input?: JsonObject) => toJsonObject(await clients.dispatch.listAgents(requestMessage(input))),
    listHistory: async (input?: JsonObject) => toJsonObject(await clients.dispatch.listHistory(requestMessage(input))),
    checkTiers: async (input?: JsonObject) => toJsonObject(await clients.dispatch.checkTiers(requestMessage(input))),
    listModels: async (input?: JsonObject) => toJsonObject(await clients.dispatch.listModels(requestMessage(input))),
    replaceTiers: async (input?: JsonObject) => toJsonObject(await clients.dispatch.replaceTiers(requestMessage(input))),
    stats: async (input?: JsonObject) => toJsonObject(await clients.dispatch.stats(requestMessage(input))),
    getClassifier: async (input?: JsonObject) => toJsonObject(await clients.dispatch.getClassifier(requestMessage(input))),
    capacity: async (input?: JsonObject) => toJsonObject(await clients.dispatch.capacity(requestMessage(input))),
    listCliProviders: async () => toJsonObject(await clients.integrations.listCliProviders({})),
    listIntegrationConnections: async (input?: JsonObject) => toJsonObject(await clients.integrations.listIntegrationConnections(requestMessage(input))),
    saveIntegrationConnection: async (input?: JsonObject) => toJsonObject(await clients.integrations.saveIntegrationConnection(requestMessage(input))),
    listIntegrationResources: async (input?: JsonObject) => toJsonObject(await clients.integrations.listIntegrationResources(requestMessage(input))),
    listIntegrationSyncRuns: async (input?: JsonObject) => toJsonObject(await clients.integrations.listIntegrationSyncRuns(requestMessage(input))),
    saveIntegrationSyncRun: async (input?: JsonObject) => toJsonObject(await clients.integrations.saveIntegrationSyncRun(requestMessage(input))),
    syncIntegrationConnection: async (input?: JsonObject) => toJsonObject(await clients.integrations.syncIntegrationConnection(requestMessage(input))),
    probeCliProvider: async (input?: JsonObject) => toJsonObject(await clients.integrations.probeCliProvider(requestMessage(input))),
    beginCliAuth: async (input?: JsonObject) => toJsonObject(await clients.integrations.beginCliAuth(requestMessage(input))),
    createTerminalSession: async (input?: JsonObject) => toJsonObject(await clients.terminals.createTerminalSession(requestMessage(input))),
    writeTerminalSession: async (input?: JsonObject) => {
      try {
        return toJsonObject(await clients.terminals.writeTerminalSession(terminalWriteMessage(input)));
      } catch (error: unknown) {
        if (isTerminalNotFound(error)) return {};
        throw error;
      }
    },
    resizeTerminalSession: async (input?: JsonObject) => {
      try {
        return toJsonObject(await clients.terminals.resizeTerminalSession(requestMessage(input)));
      } catch (error: unknown) {
        if (isTerminalNotFound(error)) return {};
        throw error;
      }
    },
    closeTerminalSession: async (input?: JsonObject) => {
      try {
        return toJsonObject(await clients.terminals.closeTerminalSession(requestMessage(input)));
      } catch (error: unknown) {
        if (isTerminalNotFound(error)) return {};
        throw error;
      }
    },
    readTerminalOutput: async (input?: JsonObject) => {
      try {
        return toJsonObject(await clients.terminals.readTerminalOutput(requestMessage(input)));
      } catch (error: unknown) {
        if (isTerminalNotFound(error)) {
          const offset = Number(payload(input).offset ?? 0);
          return { data: "", nextOffset: offset, closed: true };
        }
        throw error;
      }
    },
    listTerminalSessions: async (input?: JsonObject) => toJsonObject(await clients.terminals.listTerminalSessions(requestMessage(input))),
  };
}

export type CoreDomainControllers = ReturnType<typeof createCoreDomainControllers>;
