import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, protocol, session, shell, systemPreferences, nativeTheme } from "electron";
import { dirname, isAbsolute, join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { createCoreClients, type CoreClients } from "./core/client.js";
import { ensureCore, resolveBinary, type CoreHandle } from "./core/process-supervisor.js";
import { createStartupClock, startupTimingEnabled, type StartupClock } from "./core/startup-timing.js";
import { startChangeWatcher } from "./core/change-watcher.js";
import { createRpcHandlers, assertTrustedSender, validateAppInput, channel, handleRequestNotificationAuthorization } from "./ipc.js";
import { publicIpcError } from "./ipc-error.js";
import { applyReduceTransparency, createWindow, rendererDocument } from "./window.js";
import { contentSecurityPolicy, isAllowedRendererUrl, parseDeepLink } from "./navigation-policy.js";
import { rendererFileResponse } from "./renderer-protocol.js";
import { attachmentResponse, resolveAttachmentUrl } from "./attachment-protocol.js";
import { grantImportPaths, resetTempImportDirectory, tempImportDirectory, writeGrantedTempFile } from "./import-paths.js";
import { matchSoundPath, resolveSoundsRoot, soundResponse } from "./sounds-protocol.js";
import { matchCharacterPath, resolveCharactersRoot, characterResponse } from "./characters-protocol.js";
import { createAppLog, ensureAppLogFile, type AppLog } from "./app-log.js";
import { readReduceTransparency, writeReduceTransparency } from "./appearance.js";
import { mcpProbePublicResult, probeMcpConnection } from "./mcp-probe.js";
import { APP_METHODS, EVENTS, type DeepLink } from "../shared/bridge.js";
import { desktopUpdater } from "./updater.js";
import { installReminders, runNotifyInspect } from "./reminders/index.js";

// Keep native controls and windows dark regardless of the system appearance.
nativeTheme.themeSource = "dark";

const e2eEnv = process.argv.find(arg => arg.startsWith("--notes-e2e-env="))?.slice("--notes-e2e-env=".length);
if (e2eEnv) {
  if (!isAbsolute(e2eEnv)) throw new Error("pwnotes e2e env path must be absolute");
  const parsed = JSON.parse(readFileSync(e2eEnv, "utf8")) as Record<string, unknown>;
  for (const [key, value] of Object.entries(parsed)) {
    if (key.startsWith("PWNOTES_") && typeof value === "string") process.env[key] = value;
  }
  if (process.env.PWNOTES_NOTIFY_E2E === "1") {
    const isolated = process.env.PWNOTES_CORE_DB || "";
    if (!isAbsolute(isolated) || !isolated.includes("notes-w1-native-notify")) {
      throw new Error("e2e PWNOTES_CORE_DB must be an isolated temp database");
    }
  }
  writeFileSync(join(dirname(e2eEnv), "main-started.json"), JSON.stringify({ argv: process.argv, db: process.env.PWNOTES_CORE_DB }));
}

const remoteDebuggingPort = process.env.REMOTE_DEBUGGING_PORT?.trim();
if (remoteDebuggingPort && /^[1-9]\d{0,4}$/.test(remoteDebuggingPort) && Number(remoteDebuggingPort) <= 65535) {
  app.commandLine.appendSwitch("remote-debugging-port", remoteDebuggingPort);
}

// W1-NATIVE-NOTIFY registers its notification delegate here, before app readiness.
protocol.registerSchemesAsPrivileged([{ scheme: "pwnotes-file", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.setName("Polterware Notes");
const hiddenLaunch = process.argv.includes("--background-replan");
if (hiddenLaunch) app.dock?.hide();
applyDevDockIcon();
const dbPath = process.env.PWNOTES_CORE_DB || join(app.getPath("appData"), "Polterware Notes", "notes.db");
if (!isAbsolute(dbPath)) throw new Error("PWNOTES_CORE_DB must be absolute");
const data = dirname(dbPath);
const tempImportDir = tempImportDirectory(data);
let win: BrowserWindow | null = null;
let clients: CoreClients | undefined;
let core: CoreHandle | undefined;
let stopWatcher: (() => void) | undefined;
let pendingLink: DeepLink | null = null;
let mapGeocoding = false;
let logs: AppLog | undefined;
let suppressWindow = hiddenLaunch;
let markCoreStartupSettled = () => {};
const coreStartupSettled = new Promise<void>(resolve => { markCoreStartupSettled = resolve; });
const grants = { import: new Set<string>(), export: new Set<string>(), backup: new Set<string>() };
function getClients(): CoreClients {
  if (!clients) throw new Error("Core offline");
  return clients;
}
function getLogs(): AppLog {
  if (!logs) logs = createAppLog(app.getPath("logs"));
  return logs;
}
function userDataDirectory(): string {
  return app.getPath("userData");
}
function emit(event: string, value: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(event, value);
}
// Packaged builds take the icon from the bundle; the dev Electron binary needs it set explicitly,
// and after every dock.show() because showing the dock restores the default icon.
function applyDevDockIcon(): void {
  if (app.isPackaged) return;
  const icon = nativeImage.createFromPath(join(app.getAppPath(), "resources/app-icons/dock.png"));
  if (icon.isEmpty()) return;
  for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.setIcon(icon);
  app.dock?.setIcon(icon);
}
function showWindow(): void {
  app.dock?.show();
  applyDevDockIcon();
  if (!win || win.isDestroyed()) {
    win = createWindow({ reduceTransparency: readReduceTransparency(userDataDirectory()) });
    win.on("closed", () => { win = null; });
  }
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
  applyDevDockIcon();
}
function routeDeepLink(raw: string): void {
  const link = parseDeepLink(raw);
  if (!link) return;
  pendingLink = link;
  if (!app.isReady()) return;
  showWindow();
  if (win!.webContents.isLoading()) win!.webContents.once("did-finish-load", () => emit(EVENTS.deepLink, link));
  else emit(EVENTS.deepLink, link);
}
async function attachCore(): Promise<boolean> {
  const next = await ensureCore({ dbPath, binary: resolveBinary(app.getAppPath(), process.resourcesPath, app.isPackaged) });
  const changed = next.pid !== core?.pid || next.token !== core?.token || next.endpoint !== core?.endpoint;
  core = next;
  clients = createCoreClients(next.endpoint, next.token);
  return changed;
}
async function reconnect(clock?: StartupClock): Promise<boolean> {
  try {
    const changed = await attachCore();
    clock?.mark("core-attach");
    await refreshMapPolicy();
    clock?.mark("policy-rpc");
    getLogs().write("core.ready", { changed });
    return changed;
  } catch (error) {
    getLogs().write("core.offline", { code: "unavailable" });
    throw error;
  }
}
async function refreshMapPolicy(): Promise<void> {
  const previousGeocoding = mapGeocoding;
  try {
    const settings = (await getClients().settings.get({}, { timeoutMs: 2000 })).settings;
    mapGeocoding = Boolean(settings?.mapGeocoding);
  } catch { mapGeocoding = false; }
  // Reload only when the separately opted-in geocoding origin changes.
  if (previousGeocoding !== mapGeocoding && win && !win.isDestroyed()) win.webContents.reload();
}
function registerIpc(reminders: { requestAuthorization(): Promise<boolean> }): void {
  const handlers = createRpcHandlers({ getClients, whenReady: coreStartupSettled, authorizePath: (purpose, path) => grants[purpose].has(path),
    settingsChanged: () => { void refreshMapPolicy(); } });
  const appHandlers: Record<typeof APP_METHODS[number], (input: unknown) => unknown> = {
    openDeepLink: input => { if (typeof input !== "string" || !parseDeepLink(input)) throw new Error("Invalid deep link"); routeDeepLink(input); },
    getDeepLink: () => { const link = pendingLink; pendingLink = null; return link; },
    pickFiles: async () => {
      const result = await dialog.showOpenDialog(win!, { properties: ["openFile", "multiSelections"] });
      const paths = result.canceled ? [] : result.filePaths;
      paths.forEach(path => grants.import.add(path)); return paths;
    },
    pathsForDroppedFiles: input => grantImportPaths(input, grants.import),
    writeTempFile: input => {
      const payload = input as { bytes: Uint8Array; name: string };
      return writeGrantedTempFile(payload.bytes, payload.name, tempImportDir, grants.import);
    },
    saveZip: () => chooseDestination("export"), saveBackup: () => chooseDestination("backup"),
    revealInFinder: async input => {
      if (typeof input !== "string") throw new Error("Invalid attachment URL");
      shell.showItemInFolder(await resolveAttachmentUrl(input, join(data, "attachments")));
    },
    startMicrophone: async () => process.platform === "darwin" && systemPreferences.askForMediaAccess("microphone"),
    getInfo: () => ({ name: "Polterware Notes", version: app.getVersion(), updates: desktopUpdater.status() }),
    requestNotificationAuthorization: () => handleRequestNotificationAuthorization(reminders),
    openLog: () => { shell.showItemInFolder(ensureAppLogFile(getLogs())); },
    openDataFolder: async () => { await shell.openPath(data); },
    getReduceTransparency: () => readReduceTransparency(userDataDirectory()),
    setReduceTransparency: input => {
      const enabled = writeReduceTransparency(userDataDirectory(), input === true);
      applyReduceTransparency(enabled);
      return enabled;
    },
    testMcpConnection: async () => {
      try {
        const [info, health] = await Promise.all([
          getClients().agents.getInfo({}, { timeoutMs: 2000 }),
          getClients().health.check({}, { timeoutMs: 2000 }),
        ]);
        return mcpProbePublicResult(await probeMcpConnection({
          enabled: Boolean(info.enabled), port: Number(health.mcp?.port), token: String(info.token ?? ""),
        }));
      } catch {
        return { ok: false, error: "Core is offline. MCP cannot be tested." };
      }
    },
  };
  for (const [name, handler] of Object.entries(appHandlers)) handlers[channel("app", name)] = async input => {
    validateAppInput(name, input);
    return handler(input) as never;
  };
  for (const [name, handler] of Object.entries(handlers)) {
    ipcMain.handle(name, async (event, ...args) => {
      try {
        if (!win || win.isDestroyed()) throw new Error("No renderer window");
        assertTrustedSender(event, win.webContents);
        if (args.length > 1) throw new Error("Invalid IPC arguments");
        return await handler(args[0]);
      } catch (error) {
        throw publicIpcError(error);
      }
    });
  }
}
async function chooseDestination(purpose: "export" | "backup"): Promise<string | null> {
  const result = await dialog.showSaveDialog(win!, { defaultPath: purpose === "export" ? "Polterware Notes.zip" : "Polterware Notes.db",
    filters: [{ name: purpose === "export" ? "ZIP archive" : "SQLite database", extensions: [purpose === "export" ? "zip" : "db"] }] });
  const path = !result.canceled && result.filePath ? result.filePath : null;
  if (path) grants[purpose].add(path);
  return path;
}
function installSessionSecurity(): void {
  const trusted = (url: string) => isAllowedRendererUrl(url, rendererDocument());
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) =>
    contents === win?.webContents && permission === "media" && trusted(details.requestingUrl ?? "") && details.mediaType === "audio" &&
    process.platform === "darwin" && systemPreferences.getMediaAccessStatus("microphone") === "granted");
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(contents === win?.webContents && permission === "media" && trusted(details.requestingUrl) &&
      "mediaTypes" in details && details.mediaTypes?.length === 1 && details.mediaTypes[0] === "audio" && process.platform === "darwin" &&
      systemPreferences.getMediaAccessStatus("microphone") === "granted");
  });
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: {
    ...details.responseHeaders, "Content-Security-Policy": [contentSecurityPolicy(true, !app.isPackaged, mapGeocoding)],
  } }));
  void protocol.handle("pwnotes-file", request => attachmentResponse(request.url, join(data, "attachments")));
  if (!process.env.ELECTRON_RENDERER_URL) {
    const soundsRoot = resolveSoundsRoot(app.getAppPath(), process.resourcesPath, app.isPackaged);
    const charactersRoot = resolveCharactersRoot(app.getAppPath(), process.resourcesPath, app.isPackaged);
    session.defaultSession.protocol.handle("file", request => {
      let pathname = "";
      try { pathname = decodeURIComponent(new URL(request.url).pathname); } catch { return new Response(null, { status: 404 }); }
      if (matchSoundPath(pathname)) return soundResponse(pathname, soundsRoot);
      if (matchCharacterPath(pathname)) return characterResponse(pathname, charactersRoot);
      return rendererFileResponse(request.url, join(__dirname, "../renderer"));
    });
  }
}
function installMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Polterware Notes", submenu: [{ role: "about" }, desktopUpdater.menuItem(), { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }] },
    { label: "File", submenu: [{ label: "Open Polterware Notes", click: showWindow }, { role: "close" }] },
    { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" },
    { role: "help", submenu: [
      { label: "Open Data Folder", click: () => { void shell.openPath(data); } },
      { label: "Reveal Core Log", click: () => shell.showItemInFolder(join(data, "run/core.log")) },
    ] },
  ]));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  const inspectCommand = process.env.PWNOTES_NOTIFY_INSPECT;
  if (inspectCommand) {
    const inspectResult = process.env.PWNOTES_NOTIFY_INSPECT_RESULT || join(app.getPath("temp"), "notes-notify-inspect.json");
    app.on("ready", () => { void runNotifyInspect(inspectCommand, inspectResult).finally(() => app.quit()); });
  } else {
  const reminders = installReminders({
    dataDirectory: data,
    ensureCore: async () => { await reconnect(); return getClients(); },
    openNote: url => {
      suppressWindow = false;
      app.setActivationPolicy("regular");
      reminders.setBackgroundLaunch(false);
      routeDeepLink(url);
    },
    hasWindow: () => Boolean(win && !win.isDestroyed()),
    quit: () => app.quit(),
  });
  app.on("open-url", (event, url) => { event.preventDefault(); routeDeepLink(url); });
  app.on("second-instance", (_event, argv) => {
    const link = argv.find(arg => arg.startsWith("pwnotes://"));
    if (link) routeDeepLink(link);
    else if (argv.includes("--background-replan")) reminders.requestRefresh("core-write");
    else {
      suppressWindow = false;
      reminders.setBackgroundLaunch(false);
      app.setActivationPolicy("regular");
      if (app.isReady()) showWindow(); else app.once("ready", showWindow);
    }
  });
  const startupLink = process.argv.find(arg => arg.startsWith("pwnotes://"));
  if (startupLink) routeDeepLink(startupLink);
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
  app.on("before-quit", () => {
    reminders.close();
    stopWatcher?.();
    try { resetTempImportDirectory(tempImportDir); } catch { /* Best-effort temp cleanup on quit. */ }
  });
  app.on("activate", () => { if (!suppressWindow || win) showWindow(); });
  app.on("ready", (_event, launchInfo) => {
    void (async () => {
      const clock = createStartupClock({ enabled: startupTimingEnabled() });
      clock.mark("electron-ready");
      suppressWindow = reminders.prepareLaunch(launchInfo) || hiddenLaunch;
      applyDevDockIcon();
      if (app.isPackaged) app.setAsDefaultProtocolClient("pwnotes");
      else app.setAsDefaultProtocolClient("pwnotes", process.execPath, [app.getAppPath()]);
      try { resetTempImportDirectory(tempImportDir); } catch { /* Recreated on the first granted write. */ }
      desktopUpdater.start();
      registerIpc(reminders); installSessionSecurity(); installMenu();
      // Open the window before the core is up so the boot splash paints at once; RPC calls wait on coreStartupSettled.
      let windowShown = false;
      if (!suppressWindow || pendingLink) {
        clock.mark("window-show");
        showWindow();
        windowShown = true;
      }
      try {
        logs = createAppLog(app.getPath("logs"));
        applyReduceTransparency(readReduceTransparency(userDataDirectory()));
        await reconnect(clock);
        stopWatcher = startChangeWatcher({ getClients, reconnect, emit: event => {
          emit(EVENTS.change, event);
          reminders.onChanges({ snapshot: event.resync, changes: event.changes });
          if (event.resync || event.changes.some(change => change.entity === "settings" || change.entity === "setting")) void refreshMapPolicy();
        } });
      } catch { console.error("Polterware Notes core offline; inspect the core log"); }
      finally { markCoreStartupSettled(); }
      reminders.start();
      if (!windowShown && (!suppressWindow || pendingLink)) {
        clock.mark("window-show");
        showWindow();
        windowShown = true;
      }
      if (startupTimingEnabled()) console.log(clock.format());
      if (!windowShown) return;
      if (process.env.PWNOTES_NOTIFY_E2E === "1") {
        setTimeout(() => { void reminders.requestAuthorization().catch(() => {}); }, 1500);
      }
      if (pendingLink) routeDeepLink(pendingLink.url);
    })().catch(() => { console.error("Polterware Notes startup failed"); app.quit(); });
  });
  }
}
