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

export function createCoreDomainControllers(clients: CoreClients) {
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
    listProjectRepos: async (input?: JsonObject) => toJsonObject(await clients.projects.listProjectRepos(requestMessage(input))),
    addProjectRepo: async (input?: JsonObject) => toJsonObject(await clients.projects.addProjectRepo(requestMessage(input))),
    removeProjectRepo: async (input?: JsonObject) => toJsonObject(await clients.projects.removeProjectRepo(requestMessage(input))),
    getLayout: async (input?: JsonObject) => toJsonObject(await clients.architecture.getLayout(requestMessage(input))),
    updateLayout: async (input?: JsonObject) => toJsonObject(await clients.architecture.updateLayout(requestMessage(input))),
    listViews: async (input?: JsonObject) => toJsonObject(await clients.architecture.listViews(requestMessage(input))),
    saveView: async (input?: JsonObject) => toJsonObject(await clients.architecture.saveView(requestMessage(input))),
    deleteView: async (input?: JsonObject) => toJsonObject(await clients.architecture.deleteView(requestMessage(input))),
    listKnowledge: async (input?: JsonObject) => toJsonObject(await clients.knowledge.listKnowledge(requestMessage(input))),
    saveKnowledge: async (input?: JsonObject) => toJsonObject(await clients.knowledge.saveKnowledge(requestMessage(input))),
    deleteKnowledge: async (input?: JsonObject) => toJsonObject(await clients.knowledge.deleteKnowledge(requestMessage(input))),
    searchKnowledge: async (input?: JsonObject) => toJsonObject(await clients.knowledge.searchKnowledge(requestMessage(input))),
    listKnowledgeLinks: async (input?: JsonObject) => toJsonObject(await clients.knowledge.listKnowledgeLinks(requestMessage(input))),
    saveKnowledgeLink: async (input?: JsonObject) => toJsonObject(await clients.knowledge.saveKnowledgeLink(requestMessage(input))),
    deleteKnowledgeLink: async (input?: JsonObject) => toJsonObject(await clients.knowledge.deleteKnowledgeLink(requestMessage(input))),
    listWorkCards: async (input?: JsonObject) => toJsonObject(await clients.work.listWorkCards(requestMessage(input))),
    listAtlas: async (input?: JsonObject) => toJsonObject(await clients.work.listAtlas(requestMessage(input))),
    listAgentSessions: async (input?: JsonObject) =>
      toJsonObject(await clients.work.listAgentSessions(requestMessage(input))),
    listAtlasHistory: async (input?: JsonObject) =>
      toJsonObject(await clients.work.listAtlasHistory(requestMessage(input))),
    queryPolter: async (input?: JsonObject) => toJsonObject(await clients.work.queryPolter(requestMessage(input))),
    applyPolter: async (input?: JsonObject) => toJsonObject(await clients.work.applyPolter(requestMessage(input))),
    listInbox: async (input?: JsonObject) => toJsonObject(await clients.work.listInbox(requestMessage(input))),
    resolveInboxItem: async (input?: JsonObject) => toJsonObject(await clients.work.resolveInboxItem(requestMessage(input))),
    setScope: async (input?: JsonObject) => toJsonObject(await clients.work.setScope(requestMessage(input))),
    reviewFeature: async (input?: JsonObject) => toJsonObject(await clients.work.reviewFeature(requestMessage(input))),
    createFeature: async (input?: JsonObject) => toJsonObject(await clients.work.createFeature(requestMessage(input))),
    advanceFeature: async (input?: JsonObject) => toJsonObject(await clients.work.advanceFeature(requestMessage(input))),
    listCanonEntities: async (input?: JsonObject) => toJsonObject(await clients.canon.listEntities(requestMessage(input))),
    syncProjectModel: async (input?: JsonObject) => toJsonObject(await clients.canon.syncProjectModel(requestMessage(input))),
    importProjectSources: async (input?: JsonObject) =>
      toJsonObject(await clients.canon.importProjectSources(requestMessage(input))),
    listFacts: async (input?: JsonObject) => toJsonObject(await clients.canon.listFacts(requestMessage(input))),
    getFact: async (input?: JsonObject) => toJsonObject(await clients.canon.getFact(requestMessage(input))),
    upsertFact: async (input?: JsonObject) => toJsonObject(await clients.canon.upsertFact(requestMessage(input))),
    listEvidence: async (input?: JsonObject) => toJsonObject(await clients.canon.listEvidence(requestMessage(input))),
    getEvidence: async (input?: JsonObject) => toJsonObject(await clients.canon.getEvidence(requestMessage(input))),
    upsertEvidence: async (input?: JsonObject) => toJsonObject(await clients.canon.upsertEvidence(requestMessage(input))),
    linkEvidenceToFact: async (input?: JsonObject) =>
      toJsonObject(await clients.canon.linkEvidenceToFact(requestMessage(input))),
    compileContext: async (input?: JsonObject) => toJsonObject(await clients.context.compileContext(requestMessage(input))),
    checkDrift: async (input?: JsonObject) => toJsonObject(await clients.context.checkDrift(requestMessage(input))),
    getAgentRun: async (input?: JsonObject) => toJsonObject(await clients.agentRuns.getAgentRun(requestMessage(input))),
    listChanges: async (input?: JsonObject) => toJsonObject(await clients.agentRuns.listChanges(requestMessage(input))),
    getAgentSetup: async (input?: JsonObject) => toJsonObject(await clients.agentRuns.getAgentSetup(requestMessage(input))),
    setHookSwitch: async (input?: JsonObject) => toJsonObject(await clients.agentRuns.setHookSwitch(requestMessage(input))),
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
