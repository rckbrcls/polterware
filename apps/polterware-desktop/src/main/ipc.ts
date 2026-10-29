import { ipcMain, type IpcMain, type IpcMainInvokeEvent } from "electron";
import type { AppIconOption, AppIconSelection } from "../shared/app-icons.js";
import {
  IPC_CHANNELS,
  type AppInfo,
  type AppIpcRequests,
  type AppIpcResponses,
  type JsonObject,
  type JsonValue,
} from "../shared/ipc.js";
import type {
  AppearancePreferencesPatch,
  StoredAppearancePreferences,
} from "../shared/appearance-preferences.js";
import { isCoreIdleOption, type CorePreferencesPatch, type StoredCorePreferences } from "../shared/core-preferences.js";
import type { QuitPreferencesPatch, StoredQuitPreferences } from "../shared/quit-preferences.js";
import type {
  StoredShortcutOverrides,
  StoredShortcutPreferences,
} from "../shared/shortcut-preferences.js";
import type { CoreStatus } from "../shared/core-status.js";
import type { McpServerStatus } from "../shared/mcp-status.js";
import type { CoreDomainControllers } from "./core/controllers/domain.js";

type Handler<K extends keyof AppIpcRequests> = (
  event?: IpcMainInvokeEvent,
  payload?: AppIpcRequests[K],
) => AppIpcResponses[K] | Promise<AppIpcResponses[K]>;

export interface PolterwareIpcControllers {
  appInfo?: {
    getInfo(): AppInfo;
  };
  appIcons?: {
    getIcon(): AppIconSelection;
    listIcons(): AppIconOption[];
    setIcon(id: string): AppIconSelection;
  };
  shortcutPreferences?: {
    getPreferences(): StoredShortcutPreferences;
    setPreferences(overrides: StoredShortcutOverrides): StoredShortcutPreferences;
  };
  quitPreferences?: {
    getPreferences(): StoredQuitPreferences;
    setPreferences(patch: QuitPreferencesPatch): StoredQuitPreferences;
  };
  appearancePreferences?: {
    getPreferences(): StoredAppearancePreferences;
    setPreferences(patch: AppearancePreferencesPatch): StoredAppearancePreferences;
  };
  mcp?: {
    getStatus(): McpServerStatus;
    start(): Promise<McpServerStatus> | McpServerStatus;
    stop(): Promise<McpServerStatus> | McpServerStatus;
  };
  corePreferences?: {
    getPreferences(): StoredCorePreferences;
    setPreferences(patch: CorePreferencesPatch): StoredCorePreferences;
  };
  coreLifecycle?: {
    getStatus(): CoreStatus;
    start(): Promise<CoreStatus>;
    stop(): Promise<CoreStatus>;
    restart(): Promise<CoreStatus>;
    revealLogs(): Promise<{ ok: boolean }> | { ok: boolean };
  };
  appShell?: {
    openExternal(url: string): Promise<{ ok: boolean }> | { ok: boolean };
    selectDirectory(): Promise<{ path: string | null }> | { path: string | null };
  };
  commander?: {
    hideOverlay(): void;
    showMainWindow(): void;
    runCommand(id: string): void;
  };
  core?: CoreDomainControllers;
}

function missing(channel: string): never {
  throw new Error(`Polterware IPC channel is not connected: ${channel}`);
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && !Array.isArray(value) && Object(value) === value;
}

function parseAppIconSelectionPayload(payload: JsonValue | undefined): string {
  if (!payload || !isJsonObject(payload)) {
    throw new Error("App icon id is required.");
  }
  const id = payload.id;
  if (Object.prototype.toString.call(id) !== "[object String]") {
    throw new Error("App icon id is required.");
  }
  const parsedId = String(id);
  if (!parsedId.trim()) {
    throw new Error("App icon id is required.");
  }
  return parsedId;
}

function parseShortcutPreferencesPayload(
  payload: JsonValue | undefined,
): StoredShortcutOverrides {
  if (!payload || !isJsonObject(payload)) {
    throw new Error("Shortcut preferences are required.");
  }
  const overridesValue = payload.overrides;
  if (
    overridesValue === null
    || overridesValue === undefined
    || Array.isArray(overridesValue)
    || Object(overridesValue) !== overridesValue
  ) {
    throw new Error("Shortcut overrides are required.");
  }

  const overrides: StoredShortcutOverrides = {};
  for (const [id, chord] of Object.entries(overridesValue as JsonObject)) {
    if (Object.prototype.toString.call(chord) !== "[object String]") {
      throw new Error(`Shortcut override for ${id} must be a string.`);
    }
    const trimmed = String(chord).trim();
    if (!trimmed) {
      throw new Error(`Shortcut override for ${id} is empty.`);
    }
    overrides[id] = trimmed.toLowerCase();
  }
  return overrides;
}

function parseAppearancePreferencesPayload(
  payload: JsonValue | undefined,
): AppearancePreferencesPatch {
  if (!payload || !isJsonObject(payload)) {
    throw new Error("Appearance preferences are required.");
  }
  if (!("reduceTransparency" in payload)) {
    throw new Error("reduceTransparency is required.");
  }
  const value = payload.reduceTransparency;
  if (Object.prototype.toString.call(value) !== "[object Boolean]") {
    throw new Error("reduceTransparency must be a boolean.");
  }
  return { reduceTransparency: value === true };
}

function parseQuitPreferencesPayload(payload: JsonValue | undefined): QuitPreferencesPatch {
  if (!payload || !isJsonObject(payload)) {
    throw new Error("Quit preferences are required.");
  }
  const patch: QuitPreferencesPatch = {};
  if (payload.confirmOnQuit !== undefined) {
    if (Object.prototype.toString.call(payload.confirmOnQuit) !== "[object Boolean]") {
      throw new Error("confirmOnQuit must be a boolean.");
    }
    patch.confirmOnQuit = payload.confirmOnQuit === true;
  }
  if (payload.quitAction !== undefined) {
    if (payload.quitAction !== "keep" && payload.quitAction !== "stop") {
      throw new Error("quitAction must be keep or stop.");
    }
    patch.quitAction = payload.quitAction;
  }
  return patch;
}

function parseCorePreferencesPayload(payload: JsonValue | undefined): CorePreferencesPatch {
  if (!payload || !isJsonObject(payload)) {
    throw new Error("Core preferences are required.");
  }
  const patch: CorePreferencesPatch = {};
  if (payload.idle !== undefined) {
    if (!isCoreIdleOption(payload.idle)) throw new Error("idle must be never, 10m, 30m, or 1h.");
    patch.idle = payload.idle;
  }
  if (payload.autoStart !== undefined) {
    if (Object.prototype.toString.call(payload.autoStart) !== "[object Boolean]") {
      throw new Error("autoStart must be a boolean.");
    }
    patch.autoStart = payload.autoStart === true;
  }
  return patch;
}

function coreHandler(
  controllers: PolterwareIpcControllers,
  key: keyof CoreDomainControllers,
): Handler<keyof AppIpcRequests> {
  return async (_event, payload) => {
    const core = controllers.core;
    if (!core) missing(key);
    return (await core[key](payload as JsonObject | undefined)) as JsonObject;
  };
}

export function createPolterwareIpcHandlers(controllers: PolterwareIpcControllers = {}) {
  const handlers = {
    [IPC_CHANNELS.app.getInfo]: async () => controllers.appInfo?.getInfo() ?? missing(IPC_CHANNELS.app.getInfo),
    [IPC_CHANNELS.app.listIcons]: async () => controllers.appIcons?.listIcons() ?? missing(IPC_CHANNELS.app.listIcons),
    [IPC_CHANNELS.app.getIcon]: async () => controllers.appIcons?.getIcon() ?? missing(IPC_CHANNELS.app.getIcon),
    [IPC_CHANNELS.app.setIcon]: async (_event, payload) => {
      if (!controllers.appIcons) missing(IPC_CHANNELS.app.setIcon);
      return controllers.appIcons.setIcon(parseAppIconSelectionPayload(payload));
    },
    [IPC_CHANNELS.app.getShortcutPreferences]: async () =>
      controllers.shortcutPreferences?.getPreferences()
      ?? missing(IPC_CHANNELS.app.getShortcutPreferences),
    [IPC_CHANNELS.app.setShortcutPreferences]: async (_event, payload) => {
      if (!controllers.shortcutPreferences) {
        missing(IPC_CHANNELS.app.setShortcutPreferences);
      }
      return controllers.shortcutPreferences.setPreferences(
        parseShortcutPreferencesPayload(payload),
      );
    },
    [IPC_CHANNELS.app.getQuitPreferences]: async () =>
      controllers.quitPreferences?.getPreferences()
      ?? missing(IPC_CHANNELS.app.getQuitPreferences),
    [IPC_CHANNELS.app.setQuitPreferences]: async (_event, payload) => {
      if (!controllers.quitPreferences) {
        missing(IPC_CHANNELS.app.setQuitPreferences);
      }
      return controllers.quitPreferences.setPreferences(parseQuitPreferencesPayload(payload));
    },
    [IPC_CHANNELS.app.getAppearancePreferences]: async () =>
      controllers.appearancePreferences?.getPreferences()
      ?? missing(IPC_CHANNELS.app.getAppearancePreferences),
    [IPC_CHANNELS.app.setAppearancePreferences]: async (_event, payload) => {
      if (!controllers.appearancePreferences) {
        missing(IPC_CHANNELS.app.setAppearancePreferences);
      }
      return controllers.appearancePreferences.setPreferences(
        parseAppearancePreferencesPayload(payload),
      );
    },
    [IPC_CHANNELS.app.getMcpStatus]: async () =>
      controllers.mcp?.getStatus() ?? missing(IPC_CHANNELS.app.getMcpStatus),
    [IPC_CHANNELS.app.startMcp]: async () => {
      if (!controllers.mcp) missing(IPC_CHANNELS.app.startMcp);
      return controllers.mcp.start();
    },
    [IPC_CHANNELS.app.stopMcp]: async () => {
      if (!controllers.mcp) missing(IPC_CHANNELS.app.stopMcp);
      return controllers.mcp.stop();
    },
    [IPC_CHANNELS.app.getCorePreferences]: async () =>
      controllers.corePreferences?.getPreferences() ?? missing(IPC_CHANNELS.app.getCorePreferences),
    [IPC_CHANNELS.app.setCorePreferences]: async (_event, payload) => {
      if (!controllers.corePreferences) missing(IPC_CHANNELS.app.setCorePreferences);
      return controllers.corePreferences.setPreferences(parseCorePreferencesPayload(payload));
    },
    [IPC_CHANNELS.app.getCoreStatus]: async () =>
      controllers.coreLifecycle?.getStatus() ?? missing(IPC_CHANNELS.app.getCoreStatus),
    [IPC_CHANNELS.app.startCore]: async () => {
      if (!controllers.coreLifecycle) missing(IPC_CHANNELS.app.startCore);
      return controllers.coreLifecycle.start();
    },
    [IPC_CHANNELS.app.stopCore]: async () => {
      if (!controllers.coreLifecycle) missing(IPC_CHANNELS.app.stopCore);
      return controllers.coreLifecycle.stop();
    },
    [IPC_CHANNELS.app.restartCore]: async () => {
      if (!controllers.coreLifecycle) missing(IPC_CHANNELS.app.restartCore);
      return controllers.coreLifecycle.restart();
    },
    [IPC_CHANNELS.app.revealCoreLogs]: async () => {
      if (!controllers.coreLifecycle) missing(IPC_CHANNELS.app.revealCoreLogs);
      return controllers.coreLifecycle.revealLogs();
    },
    [IPC_CHANNELS.app.openExternal]: async (_event, payload) => {
      if (!controllers.appShell) missing(IPC_CHANNELS.app.openExternal);
      const url = payload && isJsonObject(payload as JsonValue) ? String((payload as JsonObject).url ?? "") : "";
      if (!url.trim()) throw new Error("External URL is required.");
      return controllers.appShell.openExternal(url);
    },
    [IPC_CHANNELS.app.selectDirectory]: async () => {
      if (!controllers.appShell) missing(IPC_CHANNELS.app.selectDirectory);
      return controllers.appShell.selectDirectory();
    },
    [IPC_CHANNELS.commander.hideOverlay]: async () => {
      if (!controllers.commander) missing(IPC_CHANNELS.commander.hideOverlay);
      controllers.commander.hideOverlay();
    },
    [IPC_CHANNELS.commander.showMainWindow]: async () => {
      if (!controllers.commander) missing(IPC_CHANNELS.commander.showMainWindow);
      controllers.commander.showMainWindow();
    },
    [IPC_CHANNELS.commander.runCommand]: async (_event, payload) => {
      if (!controllers.commander) missing(IPC_CHANNELS.commander.runCommand);
      const id = typeof payload?.id === "string" ? payload.id.trim() : "";
      if (!id) {
        throw new Error("Commander command id is required.");
      }
      controllers.commander.runCommand(id);
    },
    [IPC_CHANNELS.core.healthCheck]: coreHandler(controllers, "healthCheck"),
    [IPC_CHANNELS.core.getStoreHealth]: coreHandler(controllers, "getStoreHealth"),
    [IPC_CHANNELS.core.resetLocalStore]: coreHandler(controllers, "resetLocalStore"),
    [IPC_CHANNELS.core.listProjects]: coreHandler(controllers, "listProjects"),
    [IPC_CHANNELS.core.saveProject]: coreHandler(controllers, "saveProject"),
    [IPC_CHANNELS.core.archiveProject]: coreHandler(controllers, "archiveProject"),
    [IPC_CHANNELS.core.listEnvironments]: coreHandler(controllers, "listEnvironments"),
    [IPC_CHANNELS.core.saveEnvironment]: coreHandler(controllers, "saveEnvironment"),
    [IPC_CHANNELS.core.deleteEnvironment]: coreHandler(controllers, "deleteEnvironment"),
    [IPC_CHANNELS.core.getProjectSettings]: coreHandler(controllers, "getProjectSettings"),
    [IPC_CHANNELS.core.saveProjectSettings]: coreHandler(controllers, "saveProjectSettings"),
    [IPC_CHANNELS.core.setAgentsSync]: coreHandler(controllers, "setAgentsSync"),
    [IPC_CHANNELS.core.listProjectRepos]: coreHandler(controllers, "listProjectRepos"),
    [IPC_CHANNELS.core.addProjectRepo]: coreHandler(controllers, "addProjectRepo"),
    [IPC_CHANNELS.core.removeProjectRepo]: coreHandler(controllers, "removeProjectRepo"),
    [IPC_CHANNELS.core.listCanvases]: coreHandler(controllers, "listCanvases"),
    [IPC_CHANNELS.core.getCanvas]: coreHandler(controllers, "getCanvas"),
    [IPC_CHANNELS.core.createCanvas]: coreHandler(controllers, "createCanvas"),
    [IPC_CHANNELS.core.updateCanvas]: coreHandler(controllers, "updateCanvas"),
    [IPC_CHANNELS.core.setCanvasArchived]: coreHandler(controllers, "setCanvasArchived"),
    [IPC_CHANNELS.core.deleteCanvas]: coreHandler(controllers, "deleteCanvas"),
    [IPC_CHANNELS.core.listCanvasTypes]: coreHandler(controllers, "listCanvasTypes"),
    [IPC_CHANNELS.core.listKnowledge]: coreHandler(controllers, "listKnowledge"),
    [IPC_CHANNELS.core.saveKnowledge]: coreHandler(controllers, "saveKnowledge"),
    [IPC_CHANNELS.core.setKnowledgeArchived]: coreHandler(controllers, "setKnowledgeArchived"),
    [IPC_CHANNELS.core.deleteKnowledge]: coreHandler(controllers, "deleteKnowledge"),
    [IPC_CHANNELS.core.searchKnowledge]: coreHandler(controllers, "searchKnowledge"),
    [IPC_CHANNELS.core.listKnowledgeLinks]: coreHandler(controllers, "listKnowledgeLinks"),
    [IPC_CHANNELS.core.saveKnowledgeLink]: coreHandler(controllers, "saveKnowledgeLink"),
    [IPC_CHANNELS.core.deleteKnowledgeLink]: coreHandler(controllers, "deleteKnowledgeLink"),
    [IPC_CHANNELS.core.listMilestones]: coreHandler(controllers, "listMilestones"),
    [IPC_CHANNELS.core.createMilestone]: coreHandler(controllers, "createMilestone"),
    [IPC_CHANNELS.core.updateMilestone]: coreHandler(controllers, "updateMilestone"),
    [IPC_CHANNELS.core.archiveMilestone]: coreHandler(controllers, "archiveMilestone"),
    [IPC_CHANNELS.core.reorderMilestones]: coreHandler(controllers, "reorderMilestones"),
    [IPC_CHANNELS.core.listSavedFilters]: coreHandler(controllers, "listSavedFilters"),
    [IPC_CHANNELS.core.saveSavedFilter]: coreHandler(controllers, "saveSavedFilter"),
    [IPC_CHANNELS.core.deleteSavedFilter]: coreHandler(controllers, "deleteSavedFilter"),
    [IPC_CHANNELS.core.listWorkCards]: coreHandler(controllers, "listWorkCards"),
    [IPC_CHANNELS.core.listStructure]: coreHandler(controllers, "listStructure"),
    [IPC_CHANNELS.core.listStructureHistory]: coreHandler(controllers, "listStructureHistory"),
    [IPC_CHANNELS.core.listAgentSessions]: coreHandler(controllers, "listAgentSessions"),
    [IPC_CHANNELS.core.queryPolter]: coreHandler(controllers, "queryPolter"),
    [IPC_CHANNELS.core.applyPolter]: coreHandler(controllers, "applyPolter"),
    [IPC_CHANNELS.core.listInbox]: coreHandler(controllers, "listInbox"),
    [IPC_CHANNELS.core.resolveInboxItem]: coreHandler(controllers, "resolveInboxItem"),
    [IPC_CHANNELS.core.setScope]: coreHandler(controllers, "setScope"),
    [IPC_CHANNELS.core.reviewFeature]: coreHandler(controllers, "reviewFeature"),
    [IPC_CHANNELS.core.createFeature]: coreHandler(controllers, "createFeature"),
    [IPC_CHANNELS.core.advanceFeature]: coreHandler(controllers, "advanceFeature"),
    [IPC_CHANNELS.core.listCanonEntities]: coreHandler(controllers, "listCanonEntities"),
    [IPC_CHANNELS.core.syncProjectModel]: coreHandler(controllers, "syncProjectModel"),
    [IPC_CHANNELS.core.importProjectSources]: coreHandler(controllers, "importProjectSources"),
    [IPC_CHANNELS.core.listFacts]: coreHandler(controllers, "listFacts"),
    [IPC_CHANNELS.core.getFact]: coreHandler(controllers, "getFact"),
    [IPC_CHANNELS.core.upsertFact]: coreHandler(controllers, "upsertFact"),
    [IPC_CHANNELS.core.listEvidence]: coreHandler(controllers, "listEvidence"),
    [IPC_CHANNELS.core.getEvidence]: coreHandler(controllers, "getEvidence"),
    [IPC_CHANNELS.core.upsertEvidence]: coreHandler(controllers, "upsertEvidence"),
    [IPC_CHANNELS.core.linkEvidenceToFact]: coreHandler(controllers, "linkEvidenceToFact"),
    [IPC_CHANNELS.core.getAgentRun]: coreHandler(controllers, "getAgentRun"),
    [IPC_CHANNELS.core.listChanges]: coreHandler(controllers, "listChanges"),
    [IPC_CHANNELS.core.getAgentSetup]: coreHandler(controllers, "getAgentSetup"),
    [IPC_CHANNELS.core.setHookSwitch]: coreHandler(controllers, "setHookSwitch"),
    [IPC_CHANNELS.core.listRuns]: coreHandler(controllers, "listRuns"),
    [IPC_CHANNELS.core.getRun]: coreHandler(controllers, "getRun"),
    [IPC_CHANNELS.core.startRun]: coreHandler(controllers, "startRun"),
    [IPC_CHANNELS.core.cancelRun]: coreHandler(controllers, "cancelRun"),
    [IPC_CHANNELS.core.verifyRun]: coreHandler(controllers, "verifyRun"),
    [IPC_CHANNELS.core.mergeRun]: coreHandler(controllers, "mergeRun"),
    [IPC_CHANNELS.core.result]: coreHandler(controllers, "result"),
    [IPC_CHANNELS.core.watchRun]: coreHandler(controllers, "watchRun"),
    [IPC_CHANNELS.core.unwatchRun]: coreHandler(controllers, "unwatchRun"),
    [IPC_CHANNELS.core.listWorktrees]: coreHandler(controllers, "listWorktrees"),
    [IPC_CHANNELS.core.listQuota]: coreHandler(controllers, "listQuota"),
    [IPC_CHANNELS.core.listTiers]: coreHandler(controllers, "listTiers"),
    [IPC_CHANNELS.core.listAgents]: coreHandler(controllers, "listAgents"),
    [IPC_CHANNELS.core.listHistory]: coreHandler(controllers, "listHistory"),
    [IPC_CHANNELS.core.checkTiers]: coreHandler(controllers, "checkTiers"),
    [IPC_CHANNELS.core.listModels]: coreHandler(controllers, "listModels"),
    [IPC_CHANNELS.core.replaceTiers]: coreHandler(controllers, "replaceTiers"),
    [IPC_CHANNELS.core.stats]: coreHandler(controllers, "stats"),
    [IPC_CHANNELS.core.getClassifier]: coreHandler(controllers, "getClassifier"),
    [IPC_CHANNELS.core.capacity]: coreHandler(controllers, "capacity"),
    [IPC_CHANNELS.core.listCliProviders]: coreHandler(controllers, "listCliProviders"),
    [IPC_CHANNELS.core.listIntegrationConnections]: coreHandler(controllers, "listIntegrationConnections"),
    [IPC_CHANNELS.core.saveIntegrationConnection]: coreHandler(controllers, "saveIntegrationConnection"),
    [IPC_CHANNELS.core.listIntegrationResources]: coreHandler(controllers, "listIntegrationResources"),
    [IPC_CHANNELS.core.listIntegrationSyncRuns]: coreHandler(controllers, "listIntegrationSyncRuns"),
    [IPC_CHANNELS.core.saveIntegrationSyncRun]: coreHandler(controllers, "saveIntegrationSyncRun"),
    [IPC_CHANNELS.core.syncIntegrationConnection]: coreHandler(controllers, "syncIntegrationConnection"),
    [IPC_CHANNELS.core.probeCliProvider]: coreHandler(controllers, "probeCliProvider"),
    [IPC_CHANNELS.core.beginCliAuth]: coreHandler(controllers, "beginCliAuth"),
    [IPC_CHANNELS.core.createTerminalSession]: coreHandler(controllers, "createTerminalSession"),
    [IPC_CHANNELS.core.writeTerminalSession]: coreHandler(controllers, "writeTerminalSession"),
    [IPC_CHANNELS.core.resizeTerminalSession]: coreHandler(controllers, "resizeTerminalSession"),
    [IPC_CHANNELS.core.closeTerminalSession]: coreHandler(controllers, "closeTerminalSession"),
    [IPC_CHANNELS.core.readTerminalOutput]: coreHandler(controllers, "readTerminalOutput"),
    [IPC_CHANNELS.core.listTerminalSessions]: coreHandler(controllers, "listTerminalSessions"),
  } as { [K in keyof AppIpcRequests]: Handler<K> };

  return handlers;
}

export function registerPolterwareIpcHandlers(
  controllers: PolterwareIpcControllers = {},
  target: Pick<IpcMain, "handle"> = ipcMain,
) {
  const handlers = createPolterwareIpcHandlers(controllers);
  for (const [channel, handler] of Object.entries(handlers)) {
    target.handle(channel, (event, payload) =>
      (handler as Handler<keyof AppIpcRequests>)(event, payload as never),
    );
  }
  return handlers;
}
