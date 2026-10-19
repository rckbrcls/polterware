import { batch, createSignal } from "solid-js";
import { browserBridge } from "./bridge";
import { testMcpConnection, type McpTestResult } from "./mcp-test";
import {
  DEFAULT_SETTINGS,
  errorText,
  formatBytes,
  isAgentActor,
  patchFor,
  type ActivityJSON,
  type AgentInfoJSON,
  type AppInfo,
  type DoctorCheckJSON,
  type Honesty,
  type ReminderStatusJSON,
  type SearchStatusJSON,
  type SettingKey,
  type SettingsBridge,
  type SettingsJSON,
} from "./model";
import { mcpSnippets } from "./snippets";

export type ReindexState = Honesty | "progress";

export function createSettingsStore(getBridge: () => SettingsBridge = browserBridge) {
  const [settings, setSettings] = createSignal<SettingsJSON>({ ...DEFAULT_SETTINGS });
  const [loadState, setLoadState] = createSignal<Honesty>("queued");
  const [loadError, setLoadError] = createSignal("");
  const [saveState, setSaveState] = createSignal<Honesty>("live");
  const [saveError, setSaveError] = createSignal("");
  const [keyError, setKeyError] = createSignal("");
  const [savingKey, setSavingKey] = createSignal("");
  const [reduceTransparency, setReduceTransparencyValue] = createSignal<boolean | undefined>();
  const [appearanceState, setAppearanceState] = createSignal<Honesty>("queued");
  const [appearanceError, setAppearanceError] = createSignal("");
  const [advancedState, setAdvancedState] = createSignal<Honesty>("live");
  const [advancedDetail, setAdvancedDetail] = createSignal("");
  const [appInfo, setAppInfo] = createSignal<AppInfo | undefined>();
  const [reminders, setReminders] = createSignal<ReminderStatusJSON | undefined>();
  const [search, setSearch] = createSignal<SearchStatusJSON | undefined>();
  const [reindexState, setReindexState] = createSignal<ReindexState>("live");
  const [reindexError, setReindexError] = createSignal("");
  const [agent, setAgent] = createSignal<AgentInfoJSON | undefined>();
  const [revealedToken, setRevealedToken] = createSignal(false);
  const [previousToken, setPreviousToken] = createSignal("");
  const [tokenInvalidated, setTokenInvalidated] = createSignal(false);
  const [mcpTest, setMcpTest] = createSignal<McpTestResult | undefined>();
  const [mcpTestState, setMcpTestState] = createSignal<Honesty>("live");
  const [activity, setActivity] = createSignal<ActivityJSON[]>([]);
  const [activityState, setActivityState] = createSignal<Honesty>("queued");
  const [activityError, setActivityError] = createSignal("");
  const [doctor, setDoctor] = createSignal<DoctorCheckJSON[]>([]);
  const [doctorOk, setDoctorOk] = createSignal<boolean | undefined>();
  const [doctorState, setDoctorState] = createSignal<Honesty>("queued");
  const [doctorError, setDoctorError] = createSignal("");
  const [exportState, setExportState] = createSignal<Honesty>("live");
  const [exportDetail, setExportDetail] = createSignal("");
  const [backupState, setBackupState] = createSignal<Honesty>("live");
  const [backupDetail, setBackupDetail] = createSignal("");
  const [resetState, setResetState] = createSignal<Honesty>("unavailable");
  const [resetError, setResetError] = createSignal("Reset is not available in this build. No data was changed.");
  const [authState, setAuthState] = createSignal<Honesty>("live");
  const [authError, setAuthError] = createSignal("");
  let unsubscribe: (() => void) | undefined;
  let users = 0;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;

  function applySettings(next: SettingsJSON | undefined) {
    if (next) setSettings({ ...DEFAULT_SETTINGS, ...next });
  }

  async function loadSettings() {
    const result = await getBridge().settings.get({});
    applySettings(result.settings);
  }

  async function loadSide() {
    const bridge = getBridge();
    const results = await Promise.allSettled([
      bridge.app.getInfo(),
      bridge.reminders.status({}),
      bridge.search.status({}),
      bridge.agents.getInfo({}),
      bridge.app.getReduceTransparency(),
    ]);
    batch(() => {
      if (results[0].status === "fulfilled") setAppInfo(results[0].value);
      if (results[1].status === "fulfilled") setReminders(results[1].value);
      if (results[2].status === "fulfilled") setSearch(results[2].value);
      if (results[3].status === "fulfilled") setAgent(results[3].value);
      if (results[4].status === "fulfilled") {
        setReduceTransparencyValue(results[4].value); setAppearanceState("live"); setAppearanceError("");
      } else {
        setReduceTransparencyValue(undefined); setAppearanceState("failed"); setAppearanceError(errorText(results[4].reason));
      }
    });
  }

  async function refresh() {
    setLoadState("queued");
    setLoadError("");
    try {
      await loadSettings();
      await loadSide();
      setLoadState("live");
    } catch (error) {
      setLoadState("unavailable");
      setLoadError(errorText(error));
    }
  }

  async function set(key: SettingKey, value: SettingsJSON[keyof SettingsJSON]) {
    setSavingKey(key);
    setSaveState("queued");
    setSaveError("");
    setKeyError("");
    try {
      const result = await getBridge().settings.set({ keys: [key], settings: patchFor(key, value) });
      applySettings(result.settings);
      if (key === "agents.mcpEnabled" || key === "agents.mcpPort" || key === "agents.allowFileAttach") {
        const info = await getBridge().agents.getInfo({});
        setAgent(info);
      }
      setSaveState("live");
    } catch (error) {
      const message = errorText(error);
      batch(() => {
        setSaveState("failed");
        setSaveError(message);
        setKeyError(message);
      });
      try { await loadSettings(); } catch { /* Keep the last known document. */ }
    }
  }

  async function rotateToken() {
    const current = agent()?.token ?? "";
    setSaveState("queued");
    setSaveError("");
    try {
      const result = await getBridge().agents.rotateToken({});
      const next = result.token ?? "";
      batch(() => {
        setPreviousToken(current);
        setTokenInvalidated(Boolean(current) && current !== next);
        setRevealedToken(false);
        setAgent(value => ({ ...value, token: next, tokenPresent: Boolean(next) }));
        setSaveState("live");
      });
      const info = await getBridge().agents.getInfo({});
      setAgent(info);
    } catch (error) {
      setSaveState("failed");
      setSaveError(errorText(error));
    }
  }

  async function requestNotifications() {
    setAuthState("queued");
    setAuthError("");
    try {
      await getBridge().app.requestNotificationAuthorization();
      setReminders(await getBridge().reminders.status({}));
      setAuthState("live");
    } catch (error) {
      setAuthState("failed");
      setAuthError(errorText(error));
    }
  }

  async function reindex() {
    setReindexState("progress");
    setReindexError("");
    try {
      const result = await getBridge().search.reindex({});
      setSearch({ ftsDocuments: result.notes });
      setReindexState("live");
    } catch (error) {
      setReindexState("failed");
      setReindexError(errorText(error));
    }
  }

  async function testConnection() {
    setMcpTestState("queued");
    const result = await testMcpConnection(getBridge().app);
    setMcpTest(result);
    setMcpTestState(result.ok ? "live" : "failed");
  }

  async function setReduceTransparency(enabled: boolean) {
    setAppearanceState("queued"); setAppearanceError("");
    try {
      const applied = await getBridge().app.setReduceTransparency(enabled);
      setReduceTransparencyValue(applied);
      setAppearanceState(applied === enabled ? "live" : "failed");
      if (applied !== enabled) setAppearanceError("The requested transparency preference was not applied.");
    } catch (error) {
      setAppearanceState("failed"); setAppearanceError(errorText(error));
    }
  }

  async function reveal(kind: "log" | "data") {
    setAdvancedState("queued"); setAdvancedDetail("");
    try {
      const app = getBridge().app;
      if (kind === "log") await app.openLog(); else await app.openDataFolder();
      setAdvancedState("live"); setAdvancedDetail(kind === "log" ? "Log revealed in Finder." : "Data folder revealed in Finder.");
    } catch (error) {
      setAdvancedState("failed"); setAdvancedDetail(errorText(error));
    }
  }

  async function loadActivity() {
    setActivityState("queued");
    setActivityError("");
    try {
      const result = await getBridge().activity.list({ limit: 100 });
      setActivity((result.events ?? []).filter(event => isAgentActor(event.actor)));
      setActivityState("live");
    } catch (error) {
      setActivityState("failed");
      setActivityError(errorText(error));
    }
  }

  async function loadDoctor() {
    setDoctorState("queued");
    setDoctorError("");
    try {
      const result = await getBridge().maintenance.doctor({});
      setDoctor(result.checks ?? []);
      setDoctorOk(result.ok);
      setDoctorState("live");
    } catch (error) {
      setDoctorState("failed");
      setDoctorError(errorText(error));
    }
  }

  async function exportZip() {
    setExportState("queued");
    setExportDetail("");
    try {
      const path = await getBridge().app.saveZip();
      if (!path) { setExportState("live"); setExportDetail("Export cancelled."); return; }
      const result = await getBridge().maintenance.export({ zipPath: path });
      setExportState("live");
      setExportDetail(`Exported ${formatBytes(result.bytes)} to ${result.zipPath || path}.`);
    } catch (error) {
      setExportState("failed");
      setExportDetail(errorText(error));
    }
  }

  async function backup() {
    setBackupState("queued");
    setBackupDetail("");
    try {
      const path = await getBridge().app.saveBackup();
      if (!path) { setBackupState("live"); setBackupDetail("Backup cancelled."); return; }
      const result = await getBridge().maintenance.backup({ destPath: path });
      setBackupState("live");
      setBackupDetail(`Backed up ${formatBytes(result.bytes)} to ${result.path || path}.`);
    } catch (error) {
      setBackupState("failed");
      setBackupDetail(errorText(error));
    }
  }

  function resetLocalData(_confirmation: string) {
    setResetState("unavailable");
    setResetError("Reset is not available in this build. No data was changed.");
  }

  function snippets() {
    const current = agent();
    return mcpSnippets({
      port: current?.mcpPort ?? settings().agentsMcpPort ?? 47600,
      token: current?.token ?? "",
    });
  }

  function connect() {
    users++;
    if (!unsubscribe) {
      try {
        unsubscribe = getBridge().onChange(event => {
          if (!event.resync && !event.changes.some(change => ["settings", "agent", "search", "activity"].includes(change.entity))) return;
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => { void refresh(); }, 80);
        });
        void refresh();
      } catch (error) {
        setLoadState("unavailable");
        setLoadError(errorText(error));
      }
    }
    return () => {
      users--;
      if (users === 0) {
        unsubscribe?.();
        unsubscribe = undefined;
        if (refreshTimer) clearTimeout(refreshTimer);
      }
    };
  }

  function dispose() {
    unsubscribe?.();
    unsubscribe = undefined;
    users = 0;
    if (refreshTimer) clearTimeout(refreshTimer);
  }

  function reset() {
    dispose();
    batch(() => {
      setSettings({ ...DEFAULT_SETTINGS });
      setLoadState("queued"); setLoadError(""); setSaveState("live"); setSaveError(""); setKeyError(""); setSavingKey("");
      setReduceTransparencyValue(undefined); setAppearanceState("queued"); setAppearanceError("");
      setAdvancedState("live"); setAdvancedDetail("");
      setAppInfo(undefined); setReminders(undefined); setSearch(undefined); setReindexState("live"); setReindexError("");
      setAgent(undefined); setRevealedToken(false); setPreviousToken(""); setTokenInvalidated(false);
      setMcpTest(undefined); setMcpTestState("live"); setActivity([]); setActivityState("queued"); setActivityError("");
      setDoctor([]); setDoctorOk(undefined); setDoctorState("queued"); setDoctorError("");
      setExportState("live"); setExportDetail(""); setBackupState("live"); setBackupDetail("");
      setResetState("unavailable"); setResetError("Reset is not available in this build. No data was changed.");
      setAuthState("live"); setAuthError("");
    });
  }

  return {
    settings, loadState, loadError, saveState, saveError, keyError, savingKey,
    appInfo, reminders, search, reindexState, reindexError,
    agent, revealedToken, setRevealedToken, previousToken, tokenInvalidated,
    mcpTest, mcpTestState, activity, activityState, activityError,
    doctor, doctorOk, doctorState, doctorError,
    exportState, exportDetail, backupState, backupDetail, resetState, resetError,
    authState, authError, reduceTransparency, appearanceState, appearanceError, advancedState, advancedDetail, setReduceTransparency, reveal,
    refresh, set, rotateToken, requestNotifications, reindex, testConnection,
    loadActivity, loadDoctor, exportZip, backup, resetLocalData, snippets, connect, dispose, reset,
  };
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
export const settingsStore = createSettingsStore();
