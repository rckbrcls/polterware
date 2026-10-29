import { contextBridge, ipcRenderer } from "electron";
import type { CoreStatus } from "../shared/core-status.js";
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  type AppIpcRequests,
  type AppIpcResponses,
  type CoreChangeEvent,
  type DispatchWatchEvent,
  type JsonObject,
} from "../shared/ipc.js";

let watchRunCounter = 0;

type BridgeListener = (...args: unknown[]) => void;
type BridgeIpc = {
  invoke<K extends keyof AppIpcRequests>(channel: K, payload?: AppIpcRequests[K]): Promise<AppIpcResponses[K]>;
  on?(channel: string, listener: BridgeListener): void;
  removeListener?(channel: string, listener: BridgeListener): void;
};

// Saved filters belong to one surface (page). An omitted or empty projectId is
// an app-level surface such as "projects". payloadJson is the UI's opaque JSON.
export type SavedFilterListInput = { projectId?: string; surface: string };
export type SavedFilterSaveInput = SavedFilterListInput & { name: string; payloadJson: string };

function coreCall(ipc: BridgeIpc, channel: (typeof IPC_CHANNELS.core)[keyof typeof IPC_CHANNELS.core], payload?: JsonObject) {
  return ipc.invoke(channel, payload);
}

export function createPolterwareBridge(ipc: BridgeIpc) {
  return {
    app: {
      getInfo: () => ipc.invoke(IPC_CHANNELS.app.getInfo),
      listIcons: () => ipc.invoke(IPC_CHANNELS.app.listIcons),
      getIcon: () => ipc.invoke(IPC_CHANNELS.app.getIcon),
      setIcon: (id: string) => ipc.invoke(IPC_CHANNELS.app.setIcon, { id }),
      getShortcutPreferences: () => ipc.invoke(IPC_CHANNELS.app.getShortcutPreferences),
      setShortcutPreferences: (overrides: Record<string, string>) =>
        ipc.invoke(IPC_CHANNELS.app.setShortcutPreferences, { overrides }),
      getAppearancePreferences: () => ipc.invoke(IPC_CHANNELS.app.getAppearancePreferences),
      setAppearancePreferences: (preferences: { reduceTransparency: boolean }) =>
        ipc.invoke(IPC_CHANNELS.app.setAppearancePreferences, preferences),
      getQuitPreferences: () => ipc.invoke(IPC_CHANNELS.app.getQuitPreferences),
      setQuitPreferences: (preferences: { confirmOnQuit?: boolean; quitAction?: "keep" | "stop" }) =>
        ipc.invoke(IPC_CHANNELS.app.setQuitPreferences, preferences),
      getMcpStatus: () => ipc.invoke(IPC_CHANNELS.app.getMcpStatus),
      startMcp: () => ipc.invoke(IPC_CHANNELS.app.startMcp),
      stopMcp: () => ipc.invoke(IPC_CHANNELS.app.stopMcp),
      getCorePreferences: () => ipc.invoke(IPC_CHANNELS.app.getCorePreferences),
      setCorePreferences: (preferences: { idle?: "never" | "10m" | "30m" | "1h"; autoStart?: boolean }) =>
        ipc.invoke(IPC_CHANNELS.app.setCorePreferences, preferences),
      getCoreStatus: () => ipc.invoke(IPC_CHANNELS.app.getCoreStatus),
      startCore: () => ipc.invoke(IPC_CHANNELS.app.startCore),
      stopCore: () => ipc.invoke(IPC_CHANNELS.app.stopCore),
      restartCore: () => ipc.invoke(IPC_CHANNELS.app.restartCore),
      revealCoreLogs: () => ipc.invoke(IPC_CHANNELS.app.revealCoreLogs),
      openExternal: (url: string) => ipc.invoke(IPC_CHANNELS.app.openExternal, { url }),
      selectDirectory: () => ipc.invoke(IPC_CHANNELS.app.selectDirectory),
    },
    commander: {
      hideOverlay: () => ipc.invoke(IPC_CHANNELS.commander.hideOverlay),
      showMainWindow: () => ipc.invoke(IPC_CHANNELS.commander.showMainWindow),
      runCommand: (id: string) => ipc.invoke(IPC_CHANNELS.commander.runCommand, { id }),
      onFocusSearch: (callback: () => void) => {
        const listener = () => callback();
        ipc.on?.(IPC_EVENTS.commander.focusSearch, listener);
        return () => ipc.removeListener?.(IPC_EVENTS.commander.focusSearch, listener);
      },
      onExecuteCommand: (callback: (id: string) => void) => {
        const listener: BridgeListener = (_event, payload) => {
          const id =
            payload && typeof payload === "object" && payload !== null && "id" in payload
              ? String((payload as { id: unknown }).id ?? "").trim()
              : "";
          if (id) callback(id);
        };
        ipc.on?.(IPC_EVENTS.commander.executeCommand, listener);
        return () => ipc.removeListener?.(IPC_EVENTS.commander.executeCommand, listener);
      },
    },
    core: {
      /** Local core lifecycle changes (running, stopped, restarting); returns unsubscribe. */
      onStatusChange: (callback: (status: CoreStatus) => void) => {
        const listener: BridgeListener = (_event, payload) => {
          if (payload && typeof payload === "object") callback(payload as CoreStatus);
        };
        ipc.on?.(IPC_EVENTS.core.statusChanged, listener);
        return () => ipc.removeListener?.(IPC_EVENTS.core.statusChanged, listener);
      },
      /** Store changes from any client (CLI, MCP, other windows); returns unsubscribe. */
      onChange: (callback: (event: CoreChangeEvent) => void) => {
        const listener: BridgeListener = (_event, payload) => {
          if (payload && typeof payload === "object") callback(payload as CoreChangeEvent);
        };
        ipc.on?.(IPC_EVENTS.core.changed, listener);
        return () => ipc.removeListener?.(IPC_EVENTS.core.changed, listener);
      },
      health: {
        check: () => coreCall(ipc, IPC_CHANNELS.core.healthCheck),
        getStoreHealth: () => coreCall(ipc, IPC_CHANNELS.core.getStoreHealth),
        resetLocalStore: () => coreCall(ipc, IPC_CHANNELS.core.resetLocalStore),
      },
      projects: {
        list: (payload?: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listProjects, payload),
        save: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.saveProject, payload),
        archive: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.archiveProject, payload),
        listEnvironments: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listEnvironments, payload),
        saveEnvironment: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.saveEnvironment, payload),
        deleteEnvironment: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.deleteEnvironment, payload),
        getSettings: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.getProjectSettings, payload),
        saveSettings: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.saveProjectSettings, payload),
        listRepos: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listProjectRepos, payload),
        addRepo: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.addProjectRepo, payload),
        removeRepo: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.removeProjectRepo, payload),
      },
      canvas: {
        listCanvases: (payload: JsonObject = {}) => coreCall(ipc, IPC_CHANNELS.core.listCanvases, payload),
        getCanvas: (payload: JsonObject = {}) => coreCall(ipc, IPC_CHANNELS.core.getCanvas, payload),
        createCanvas: (payload: JsonObject = {}) => coreCall(ipc, IPC_CHANNELS.core.createCanvas, payload),
        updateCanvas: (payload: JsonObject = {}) => coreCall(ipc, IPC_CHANNELS.core.updateCanvas, payload),
        setCanvasArchived: (payload: JsonObject = {}) => coreCall(ipc, IPC_CHANNELS.core.setCanvasArchived, payload),
        deleteCanvas: (payload: JsonObject = {}) => coreCall(ipc, IPC_CHANNELS.core.deleteCanvas, payload),
        listCanvasTypes: (payload: JsonObject = {}) => coreCall(ipc, IPC_CHANNELS.core.listCanvasTypes, payload),
      },
      knowledge: {
        list: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listKnowledge, payload),
        save: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.saveKnowledge, payload),
        setArchived: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.setKnowledgeArchived, payload),
        delete: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.deleteKnowledge, payload),
        search: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.searchKnowledge, payload),
        listLinks: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listKnowledgeLinks, payload),
        saveLink: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.saveKnowledgeLink, payload),
        deleteLink: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.deleteKnowledgeLink, payload),
      },
      work: {
        listMilestones: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listMilestones, payload),
        createMilestone: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.createMilestone, payload),
        updateMilestone: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.updateMilestone, payload),
        archiveMilestone: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.archiveMilestone, payload),
        reorderMilestones: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.reorderMilestones, payload),
        listCards: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listWorkCards, payload),
        listStructure: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listStructure, payload),
        listStructureHistory: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listStructureHistory, payload),
        listAgentSessions: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listAgentSessions, payload),
        query: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.queryPolter, payload),
        apply: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.applyPolter, payload),
        listInbox: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listInbox, payload),
        resolveInboxItem: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.resolveInboxItem, payload),
        setScope: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.setScope, payload),
        reviewFeature: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.reviewFeature, payload),
        createFeature: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.createFeature, payload),
        advanceFeature: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.advanceFeature, payload),
      },
      savedFilters: {
        list: ({ projectId, surface }: SavedFilterListInput) =>
          coreCall(ipc, IPC_CHANNELS.core.listSavedFilters, { projectId: projectId ?? "", surface }),
        save: ({ projectId, surface, name, payloadJson }: SavedFilterSaveInput) =>
          coreCall(ipc, IPC_CHANNELS.core.saveSavedFilter, { projectId: projectId ?? "", surface, name, payloadJson }),
        delete: ({ id }: { id: string }) => coreCall(ipc, IPC_CHANNELS.core.deleteSavedFilter, { id }),
      },
      canon: {
        listEntities: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listCanonEntities, payload),
        sync: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.syncProjectModel, payload),
        importSources: (payload: JsonObject) =>
          coreCall(ipc, IPC_CHANNELS.core.importProjectSources, payload),
        listFacts: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listFacts, payload),
        getFact: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.getFact, payload),
        upsertFact: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.upsertFact, payload),
        listEvidence: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listEvidence, payload),
        getEvidence: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.getEvidence, payload),
        upsertEvidence: (payload: JsonObject) =>
          coreCall(ipc, IPC_CHANNELS.core.upsertEvidence, payload),
        linkEvidenceToFact: (payload: JsonObject) =>
          coreCall(ipc, IPC_CHANNELS.core.linkEvidenceToFact, payload),
      },
      context: {
        compile: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.compileContext, payload),
        checkDrift: (payload: JsonObject) =>
          coreCall(ipc, IPC_CHANNELS.core.checkDrift, payload),
        getAgentRun: (payload: JsonObject) =>
          coreCall(ipc, IPC_CHANNELS.core.getAgentRun, payload),
        listChanges: (payload: JsonObject) =>
          coreCall(ipc, IPC_CHANNELS.core.listChanges, payload),
        getAgentSetup: (payload: JsonObject) =>
          coreCall(ipc, IPC_CHANNELS.core.getAgentSetup, payload),
        setHookSwitch: (payload: JsonObject) =>
          coreCall(ipc, IPC_CHANNELS.core.setHookSwitch, payload),
      },
      dispatch: {
        listRuns: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listRuns, payload),
        getRun: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.getRun, payload),
        startRun: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.startRun, payload),
        cancelRun: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.cancelRun, payload),
        result: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.result, payload),
        listWorktrees: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listWorktrees, payload),
        listQuota: (payload?: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listQuota, payload),
        listTiers: (payload?: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listTiers, payload),
        listAgents: (payload?: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listAgents, payload),
        listHistory: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listHistory, payload),
        checkTiers: (payload?: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.checkTiers, payload),
        listModels: (payload?: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listModels, payload),
        replaceTiers: (payload?: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.replaceTiers, payload),
        stats: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.stats, payload),
        getClassifier: (payload?: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.getClassifier, payload),
        capacity: (payload?: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.capacity, payload),
        watchRun: (
          input: string | { id: string; afterSeq?: number },
          callback: (event: DispatchWatchEvent) => void,
        ) => {
          const id = typeof input === "string" ? input.trim() : String(input?.id ?? "").trim();
          const afterSeq =
            typeof input === "object" && input !== null && typeof input.afterSeq === "number"
              ? input.afterSeq
              : 0;
          if (!id) return () => {};
          const subscriptionId = `watch-${++watchRunCounter}`;
          const listener: BridgeListener = (_event, payload) => {
            if (!payload || typeof payload !== "object") return;
            const record = payload as DispatchWatchEvent & { subscriptionId?: string };
            if (record.subscriptionId && record.subscriptionId !== subscriptionId) return;
            if (record.id && record.id !== id) return;
            callback({
              id: String(record.id ?? id),
              seq: Number(record.seq ?? 0),
              kind: String(record.kind ?? ""),
              text: String(record.text ?? ""),
              at: String(record.at ?? ""),
            });
          };
          ipc.on?.(IPC_EVENTS.core.dispatchRunEvent, listener);
          void coreCall(ipc, IPC_CHANNELS.core.watchRun, { subscriptionId, id, afterSeq }).catch(() => {});
          return () => {
            ipc.removeListener?.(IPC_EVENTS.core.dispatchRunEvent, listener);
            void coreCall(ipc, IPC_CHANNELS.core.unwatchRun, { subscriptionId, id }).catch(() => {});
          };
        },
      },
      integrations: {
        listProviders: () => coreCall(ipc, IPC_CHANNELS.core.listCliProviders),
        listConnections: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listIntegrationConnections, payload),
        saveConnection: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.saveIntegrationConnection, payload),
        listResources: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listIntegrationResources, payload),
        listSyncRuns: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listIntegrationSyncRuns, payload),
        saveSyncRun: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.saveIntegrationSyncRun, payload),
        syncConnection: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.syncIntegrationConnection, payload),
        probeProvider: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.probeCliProvider, payload),
        beginAuth: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.beginCliAuth, payload),
      },
      terminals: {
        create: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.createTerminalSession, payload),
        write: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.writeTerminalSession, payload),
        resize: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.resizeTerminalSession, payload),
        close: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.closeTerminalSession, payload),
        read: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.readTerminalOutput, payload),
        list: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listTerminalSessions, payload),
      },
    },
  } as const;
}

const ipcWrapper: BridgeIpc = {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  on: (channel, listener) => {
    ipcRenderer.on(channel, listener);
  },
  removeListener: (channel, listener) => {
    ipcRenderer.removeListener(channel, listener);
  },
};

const polterware = createPolterwareBridge(ipcWrapper);

contextBridge.exposeInMainWorld("polterware", polterware);

export type PolterwareBridge = typeof polterware;
