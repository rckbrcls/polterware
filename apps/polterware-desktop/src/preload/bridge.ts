import { contextBridge, ipcRenderer } from "electron";
import type { CoreStatus } from "../shared/core-status.js";
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  type AppIpcRequests,
  type AppIpcResponses,
  type CoreChangeEvent,
  type JsonObject,
} from "../shared/ipc.js";

type BridgeListener = (...args: unknown[]) => void;
type BridgeIpc = {
  invoke<K extends keyof AppIpcRequests>(channel: K, payload?: AppIpcRequests[K]): Promise<AppIpcResponses[K]>;
  on?(channel: string, listener: BridgeListener): void;
  removeListener?(channel: string, listener: BridgeListener): void;
};

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
      architecture: {
        getLayout: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.getLayout, payload),
        updateLayout: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.updateLayout, payload),
        listViews: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listViews, payload),
        saveView: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.saveView, payload),
        deleteView: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.deleteView, payload),
      },
      knowledge: {
        list: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listKnowledge, payload),
        save: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.saveKnowledge, payload),
        delete: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.deleteKnowledge, payload),
        search: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.searchKnowledge, payload),
        listLinks: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listKnowledgeLinks, payload),
        saveLink: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.saveKnowledgeLink, payload),
        deleteLink: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.deleteKnowledgeLink, payload),
      },
      work: {
        listCards: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listWorkCards, payload),
        listAtlas: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listAtlas, payload),
        listAtlasHistory: (payload: JsonObject) => coreCall(ipc, IPC_CHANNELS.core.listAtlasHistory, payload),
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
