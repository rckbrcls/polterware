import type { AppIconOption, AppIconSelection } from "./app-icons.js";
import type { CoreStatus } from "./core-status.js";
import type { StoredCorePreferences } from "./core-preferences.js";
import type { McpServerStatus } from "./mcp-status.js";
import type { StoredAppearancePreferences } from "./appearance-preferences.js";
import type { StoredQuitPreferences } from "./quit-preferences.js";
import type { StoredShortcutPreferences } from "./shortcut-preferences.js";

export interface AppInfo {
  name: string;
  version: string;
}

export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export const IPC_CHANNELS = {
  app: {
    getInfo: "app:get-info",
    listIcons: "app:list-icons",
    getIcon: "app:get-icon",
    setIcon: "app:set-icon",
    getShortcutPreferences: "app:get-shortcut-preferences",
    setShortcutPreferences: "app:set-shortcut-preferences",
    getAppearancePreferences: "app:get-appearance-preferences",
    setAppearancePreferences: "app:set-appearance-preferences",
    getQuitPreferences: "app:get-quit-preferences",
    setQuitPreferences: "app:set-quit-preferences",
    getMcpStatus: "app:get-mcp-status",
    startMcp: "app:start-mcp",
    stopMcp: "app:stop-mcp",
    getCorePreferences: "app:get-core-preferences",
    setCorePreferences: "app:set-core-preferences",
    getCoreStatus: "app:get-core-status",
    startCore: "app:start-core",
    stopCore: "app:stop-core",
    restartCore: "app:restart-core",
    revealCoreLogs: "app:reveal-core-logs",
    openExternal: "app:open-external",
    selectDirectory: "app:select-directory",
  },
  commander: {
    hideOverlay: "commander:hide-overlay",
    showMainWindow: "commander:show-main-window",
    runCommand: "commander:run-command",
  },
  core: {
    healthCheck: "core:health-check",
    getStoreHealth: "core:get-store-health",
    resetLocalStore: "core:reset-local-store",
    listProjects: "core:list-projects",
    saveProject: "core:save-project",
    archiveProject: "core:archive-project",
    listEnvironments: "core:list-environments",
    saveEnvironment: "core:save-environment",
    deleteEnvironment: "core:delete-environment",
    getProjectSettings: "core:get-project-settings",
    saveProjectSettings: "core:save-project-settings",
    setAgentsSync: "core:set-agents-sync",
    listProjectRepos: "core:list-project-repos",
    addProjectRepo: "core:add-project-repo",
    removeProjectRepo: "core:remove-project-repo",
    listCanvases: "core:list-canvases",
    getCanvas: "core:get-canvas",
    createCanvas: "core:create-canvas",
    updateCanvas: "core:update-canvas",
    setCanvasArchived: "core:set-canvas-archived",
    deleteCanvas: "core:delete-canvas",
    listCanvasTypes: "core:list-canvas-types",
    listKnowledge: "core:list-knowledge",
    saveKnowledge: "core:save-knowledge",
    setKnowledgeArchived: "core:set-knowledge-archived",
    deleteKnowledge: "core:delete-knowledge",
    searchKnowledge: "core:search-knowledge",
    listKnowledgeLinks: "core:list-knowledge-links",
    saveKnowledgeLink: "core:save-knowledge-link",
    deleteKnowledgeLink: "core:delete-knowledge-link",
    listMilestones: "core:list-milestones",
    createMilestone: "core:create-milestone",
    updateMilestone: "core:update-milestone",
    archiveMilestone: "core:archive-milestone",
    reorderMilestones: "core:reorder-milestones",
    listSavedFilters: "core:list-saved-filters",
    saveSavedFilter: "core:save-saved-filter",
    deleteSavedFilter: "core:delete-saved-filter",
    listWorkCards: "core:list-work-cards",
    listStructure: "core:list-structure",
    listStructureHistory: "core:list-structure-history",
    listAgentSessions: "core:list-agent-sessions",
    queryPolter: "core:query-polter",
    applyPolter: "core:apply-polter",
    listInbox: "core:list-inbox",
    resolveInboxItem: "core:resolve-inbox-item",
    setScope: "core:set-scope",
    reviewFeature: "core:review-feature",
    createFeature: "core:create-feature",
    advanceFeature: "core:advance-feature",
    verifyFeature: "core:verify-feature",
    listCanonEntities: "core:list-canon-entities",
    syncProjectModel: "core:sync-project-model",
    importProjectSources: "core:import-project-sources",
    listFacts: "core:list-facts",
    getFact: "core:get-fact",
    upsertFact: "core:upsert-fact",
    listEvidence: "core:list-evidence",
    getEvidence: "core:get-evidence",
    upsertEvidence: "core:upsert-evidence",
    linkEvidenceToFact: "core:link-evidence-to-fact",
    getAgentRun: "core:get-agent-run",
    listChanges: "core:list-changes",
    getAgentSetup: "core:get-agent-setup",
    setHookSwitch: "core:set-hook-switch",
    listRuns: "core:list-runs",
    getRun: "core:get-run",
    startRun: "core:start-run",
    cancelRun: "core:cancel-run",
    verifyRun: "core:verify-run",
    mergeRun: "core:merge-run",
    result: "core:result",
    watchRun: "core:watch-run",
    unwatchRun: "core:unwatch-run",
    listWorktrees: "core:list-worktrees",
    listQuota: "core:list-quota",
    listTiers: "core:list-tiers",
    listAgents: "core:list-agents",
    listHistory: "core:list-history",
    checkTiers: "core:check-tiers",
    listModels: "core:list-models",
    replaceTiers: "core:replace-tiers",
    stats: "core:stats",
    getClassifier: "core:get-classifier",
    capacity: "core:capacity",
    listCliProviders: "core:list-cli-providers",
    listIntegrationConnections: "core:list-integration-connections",
    saveIntegrationConnection: "core:save-integration-connection",
    listIntegrationResources: "core:list-integration-resources",
    listIntegrationSyncRuns: "core:list-integration-sync-runs",
    saveIntegrationSyncRun: "core:save-integration-sync-run",
    syncIntegrationConnection: "core:sync-integration-connection",
    probeCliProvider: "core:probe-cli-provider",
    beginCliAuth: "core:begin-cli-auth",
    createTerminalSession: "core:create-terminal-session",
    writeTerminalSession: "core:write-terminal-session",
    resizeTerminalSession: "core:resize-terminal-session",
    closeTerminalSession: "core:close-terminal-session",
    readTerminalOutput: "core:read-terminal-output",
    listTerminalSessions: "core:list-terminal-sessions",
  },
} as const;

export type IpcChannelTree = typeof IPC_CHANNELS;

export const IPC_EVENTS = {
  commander: {
    focusSearch: "commander:focus-search",
    executeCommand: "commander:execute-command",
  },
  core: {
    changed: "core:changed",
    statusChanged: "core:status-changed",
    dispatchRunEvent: "core:dispatch-run-event",
  },
} as const;

export type DispatchWatchEvent = {
  id: string;
  seq: number;
  kind: string;
  text: string;
  at: string;
};

/** A coalesced store change from the core (Decision 0007). */
export type CoreChangeEvent = {
  seq: number;
  projectIds: string[];
  kinds: string[];
  /** Clients whose calls caused the change ("desktop", "cli", "mcp", "tui", "core"). */
  origins: string[];
  resync: boolean;
};

export type IpcEventTree = typeof IPC_EVENTS;

export type CoreIpcChannel = (typeof IPC_CHANNELS.core)[keyof typeof IPC_CHANNELS.core];

export type AppIpcRequests = {
  [IPC_CHANNELS.app.getInfo]: undefined;
  [IPC_CHANNELS.app.listIcons]: undefined;
  [IPC_CHANNELS.app.getIcon]: undefined;
  [IPC_CHANNELS.app.setIcon]: JsonValue;
  [IPC_CHANNELS.app.getShortcutPreferences]: undefined;
  [IPC_CHANNELS.app.setShortcutPreferences]: JsonValue;
  [IPC_CHANNELS.app.getAppearancePreferences]: undefined;
  [IPC_CHANNELS.app.setAppearancePreferences]: JsonValue;
  [IPC_CHANNELS.app.getQuitPreferences]: undefined;
  [IPC_CHANNELS.app.setQuitPreferences]: JsonValue;
  [IPC_CHANNELS.app.getMcpStatus]: undefined;
  [IPC_CHANNELS.app.startMcp]: undefined;
  [IPC_CHANNELS.app.stopMcp]: undefined;
  [IPC_CHANNELS.app.getCorePreferences]: undefined;
  [IPC_CHANNELS.app.setCorePreferences]: JsonValue;
  [IPC_CHANNELS.app.getCoreStatus]: undefined;
  [IPC_CHANNELS.app.startCore]: undefined;
  [IPC_CHANNELS.app.stopCore]: undefined;
  [IPC_CHANNELS.app.restartCore]: undefined;
  [IPC_CHANNELS.app.revealCoreLogs]: undefined;
  [IPC_CHANNELS.app.openExternal]: { url: string };
  [IPC_CHANNELS.app.selectDirectory]: undefined;
  [IPC_CHANNELS.commander.hideOverlay]: undefined;
  [IPC_CHANNELS.commander.showMainWindow]: undefined;
  [IPC_CHANNELS.commander.runCommand]: { id: string };
} & Record<CoreIpcChannel, JsonObject | undefined>;

export type AppIpcResponses = {
  [IPC_CHANNELS.app.getInfo]: AppInfo;
  [IPC_CHANNELS.app.listIcons]: AppIconOption[];
  [IPC_CHANNELS.app.getIcon]: AppIconSelection;
  [IPC_CHANNELS.app.setIcon]: AppIconSelection;
  [IPC_CHANNELS.app.getShortcutPreferences]: StoredShortcutPreferences;
  [IPC_CHANNELS.app.setShortcutPreferences]: StoredShortcutPreferences;
  [IPC_CHANNELS.app.getAppearancePreferences]: StoredAppearancePreferences;
  [IPC_CHANNELS.app.setAppearancePreferences]: StoredAppearancePreferences;
  [IPC_CHANNELS.app.getQuitPreferences]: StoredQuitPreferences;
  [IPC_CHANNELS.app.setQuitPreferences]: StoredQuitPreferences;
  [IPC_CHANNELS.app.getMcpStatus]: McpServerStatus;
  [IPC_CHANNELS.app.startMcp]: McpServerStatus;
  [IPC_CHANNELS.app.stopMcp]: McpServerStatus;
  [IPC_CHANNELS.app.getCorePreferences]: StoredCorePreferences;
  [IPC_CHANNELS.app.setCorePreferences]: StoredCorePreferences;
  [IPC_CHANNELS.app.getCoreStatus]: CoreStatus;
  [IPC_CHANNELS.app.startCore]: CoreStatus;
  [IPC_CHANNELS.app.stopCore]: CoreStatus;
  [IPC_CHANNELS.app.restartCore]: CoreStatus;
  [IPC_CHANNELS.app.revealCoreLogs]: { ok: boolean };
  [IPC_CHANNELS.app.openExternal]: { ok: boolean };
  [IPC_CHANNELS.app.selectDirectory]: { path: string | null };
  [IPC_CHANNELS.commander.hideOverlay]: void;
  [IPC_CHANNELS.commander.showMainWindow]: void;
  [IPC_CHANNELS.commander.runCommand]: void;
} & Record<CoreIpcChannel, JsonObject>;
