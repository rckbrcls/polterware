import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { app, BrowserWindow, dialog, globalShortcut, shell, Menu, nativeTheme } from "electron";
import log from "electron-log/main";
import { getElectronAppIconController } from "./electron-app-icons.js";
import { registerGlobalCommanderShortcut } from "./global-shortcuts.js";
import {
  createMainWindow,
  getMainWindow,
  hideCommanderWindow,
  runCommanderCommand,
  showMainWindow,
  toggleCommanderWindow,
  applyMainWindowAppearance,
} from "./window.js";
import { registerPolterwareIpcHandlers } from "./ipc.js";
import { createCoreClients, waitForHealth, type CoreClients } from "./core/client.js";
import { createCoreDomainControllers } from "./core/controllers/domain.js";
import { ensureCore, readCoreState, resolveUserDatabasePath, stopCore, type CoreProcessHandle } from "./core/process-supervisor.js";
import { createCorePreferencesController } from "./core-preferences.js";
import { idleToFlag } from "../shared/core-preferences.js";
import { createCoreLifecycle } from "./core/core-lifecycle.js";
import { startChangeWatcher } from "./core/change-watcher.js";
import { IPC_EVENTS } from "../shared/ipc.js";
import { createShortcutPreferencesController } from "./shortcut-preferences.js";
import { createAppearancePreferencesController } from "./appearance-preferences.js";
import { createQuitPreferencesController, type QuitPreferencesController } from "./quit-preferences.js";
import { createMcpSupervisor } from "./mcp-supervisor.js";
import { installApplicationMenu } from "./application-menu.js";
import { desktopUpdater } from "./updater.js";

// Keep native controls and windows dark regardless of the system appearance.
nativeTheme.themeSource = "dark";

// Keep userData where it was before the app was named Polterware: <appData>/polterware, the directory shared with the
// CLI database. Deriving it from the app name would move preferences and split them from the core's directory.
app.setPath("userData", join(app.getPath("appData"), "polterware"));

function configureLogging() {
  log.initialize();
  log.transports.file.level = "info";
  log.transports.console.level = app.isPackaged ? "warn" : "debug";
  process.on("uncaughtException", (error) => {
    log.error("Uncaught exception in main process.", error);
  });
  process.on("unhandledRejection", (reason) => {
    log.error("Unhandled rejection in main process.", reason);
  });
}

type QuitChoice = "quit" | "stop-core" | "cancel";

async function confirmQuit(preferences: QuitPreferencesController): Promise<QuitChoice> {
  const options = {
    type: "question" as const,
    title: "Quit Polterware",
    message: "Quit Polterware?",
    detail: "The core stays on for the CLI and MCP.",
    buttons: ["Quit", "Quit & Stop Core", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    checkboxLabel: "Don't ask again",
    checkboxChecked: false,
  };
  const parent = getMainWindow();
  const result = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options);
  if (result.checkboxChecked && result.response !== 2) {
    preferences.setPreferences({
      confirmOnQuit: false,
      quitAction: result.response === 1 ? "stop" : "keep",
    });
  }
  return (["quit", "stop-core", "cancel"] as const)[result.response] ?? "cancel";
}

/** Delays every core domain call until the startup attempt has settled. */
function afterCoreStartup<T extends Record<string, (...args: never[]) => unknown>>(
  controllers: T,
  settled: Promise<void>,
): T {
  const gated: Record<string, unknown> = {};
  for (const [name, call] of Object.entries(controllers)) {
    gated[name] = async (...args: never[]) => {
      await settled;
      return call(...args);
    };
  }
  return gated as T;
}

async function bootstrap() {
  configureLogging();
  desktopUpdater.start();
  installApplicationMenu(
    {
      isPackaged: app.isPackaged,
      platform: process.platform,
      checkForUpdates: desktopUpdater.check,
    },
    Menu,
  );
  const appIcons = getElectronAppIconController();
  appIcons.applySelectedIcon();

  let unregisterCommanderShortcut = () => {};

  const applyGlobalCommanderAccelerator = (accelerator: string) => {
    unregisterCommanderShortcut();
    unregisterCommanderShortcut = registerGlobalCommanderShortcut({
      accelerator,
      log,
      onToggleCommander: () => {
        toggleCommanderWindow();
      },
      shortcuts: globalShortcut,
    });
  };

  const shortcutPreferences = createShortcutPreferencesController({
    userDataDirectory: app.getPath("userData"),
    onGlobalAcceleratorChange: applyGlobalCommanderAccelerator,
  });

  const appearancePreferences = createAppearancePreferencesController({
    userDataDirectory: app.getPath("userData"),
    onChange: (preferences) => {
      applyMainWindowAppearance(preferences.reduceTransparency);
    },
  });

  const quitPreferences = createQuitPreferencesController({
    userDataDirectory: app.getPath("userData"),
  });

  const corePreferences = createCorePreferencesController({
    userDataDirectory: app.getPath("userData"),
  });
  const coreIdleFlag = () => idleToFlag(corePreferences.getPreferences().idle);

  const mcpSupervisor = createMcpSupervisor({
    log: (message) => log.debug(message),
  });

  const shellControllers = {
    appInfo: {
      getInfo: () => ({ name: app.getName(), version: app.getVersion() }),
    },
    appIcons: {
      getIcon: () => appIcons.getIcon(),
      listIcons: () => appIcons.listIcons(),
      setIcon: (id: string) => {
        const selection = appIcons.setIcon(id);
        appIcons.applySelectedIcon();
        return selection;
      },
    },
    shortcutPreferences: {
      getPreferences: () => shortcutPreferences.getPreferences(),
      setPreferences: (overrides: Record<string, string>) =>
        shortcutPreferences.setPreferences(overrides),
    },
    appearancePreferences: {
      getPreferences: () => appearancePreferences.getPreferences(),
      setPreferences: (patch: { reduceTransparency?: boolean }) =>
        appearancePreferences.setPreferences(patch),
    },
    corePreferences: {
      getPreferences: () => corePreferences.getPreferences(),
      setPreferences: (patch: { idle?: "never" | "10m" | "30m" | "1h"; autoStart?: boolean }) =>
        corePreferences.setPreferences(patch),
    },
    quitPreferences: {
      getPreferences: () => quitPreferences.getPreferences(),
      setPreferences: (patch: { confirmOnQuit?: boolean; quitAction?: "keep" | "stop" }) => quitPreferences.setPreferences(patch),
    },
    mcp: {
      getStatus: () => mcpSupervisor.getStatus(),
      start: () => mcpSupervisor.start(),
      stop: () => mcpSupervisor.stop(),
    },
    appShell: {
      openExternal: async (url: string) => {
        if (!/^https?:\/\//i.test(url)) {
          throw new Error("Only http(s) URLs can be opened.");
        }
        await shell.openExternal(url);
        return { ok: true };
      },
      selectDirectory: async () => {
        const parent = getMainWindow();
        const options = {
          title: "Select project directory",
          properties: ["openDirectory", "createDirectory"] as Array<"openDirectory" | "createDirectory">,
        };
        const result = parent
          ? await dialog.showOpenDialog(parent, options)
          : await dialog.showOpenDialog(options);
        const path = result.canceled ? null : (result.filePaths[0] ?? null);
        return { path };
      },
    },
    commander: {
      hideOverlay: hideCommanderWindow,
      showMainWindow,
      runCommand: runCommanderCommand,
    },
  };

  // The core is a shared daemon (Verdict 0007): attach or start it, never stop it
  // on quit. Clients are swapped in place when the core restarts.
  let stopChangeWatcher = () => {};
  const dbPath = resolveUserDatabasePath();
  const coreLog = (message: string) => log.debug(message);
  let handle: CoreProcessHandle | undefined;
  let current: CoreClients | undefined;
  const useHandle = (next: CoreProcessHandle) => {
    handle = next;
    current = createCoreClients(next.endpoint, next.token);
  };
  const coreLifecycle = createCoreLifecycle({
    dbPath,
    log: coreLog,
    getIdle: coreIdleFlag,
    onHandle: useHandle,
    emit: (status) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send(IPC_EVENTS.core.statusChanged, status);
      }
    },
  });
  const clients = new Proxy({} as CoreClients, {
    get: (_target, key) => {
      if (!current) throw new Error("The local core is not running.");
      return current[key as keyof CoreClients];
    },
  });
  const coreLifecycleController = {
    getStatus: () => coreLifecycle.getStatus(),
    start: () => coreLifecycle.start(),
    stop: () => coreLifecycle.stop(),
    restart: () => coreLifecycle.restart(),
    revealLogs: async () => {
      const { logPath } = coreLifecycle.getStatus();
      if (existsSync(logPath)) shell.showItemInFolder(logPath);
      else await shell.openPath(dirname(logPath));
      return { ok: true };
    },
  };
  // Open the window before the core is up so the boot splash paints at once.
  // Core domain calls wait for the startup attempt below, then run as before.
  let markCoreStartupSettled = () => {};
  const coreStartupSettled = new Promise<void>((resolve) => {
    markCoreStartupSettled = resolve;
  });
  registerPolterwareIpcHandlers({
    ...shellControllers,
    coreLifecycle: coreLifecycleController,
    core: afterCoreStartup(createCoreDomainControllers(clients), coreStartupSettled),
  });
  applyGlobalCommanderAccelerator(shortcutPreferences.getGlobalCommanderAccelerator());
  createMainWindow({
    reduceTransparency: appearancePreferences.getPreferences().reduceTransparency,
  });

  try {
    if (corePreferences.getPreferences().autoStart) {
      useHandle(await ensureCore({ dbPath, idle: coreIdleFlag(), log: coreLog }));
    } else {
      // Attach to a core that is already running, but never start one.
      const existing = readCoreState(dbPath);
      if (existing) useHandle({ endpoint: existing.endpoint, token: existing.token, pid: existing.pid });
    }
    if (current) await waitForHealth(current);
  } catch (error) {
    log.error("Failed to start Polterware core.", error);
  } finally {
    markCoreStartupSettled();
  }
  stopChangeWatcher = startChangeWatcher({
    getClients: () => clients,
    reconnect: async () => {
      // A core the user stopped must stay stopped until they start it again.
      if (coreLifecycle.isPaused()) throw new Error("Core stopped by the user.");
      if (!corePreferences.getPreferences().autoStart && !readCoreState(dbPath)) {
        throw new Error("Core is stopped and auto-start is off.");
      }
      const next = await ensureCore({ dbPath, idle: coreIdleFlag(), log: coreLog });
      const replaced = !handle || next.endpoint !== handle.endpoint || next.token !== handle.token;
      if (replaced) useHandle(next);
      return replaced;
    },
    emit: (event) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send(IPC_EVENTS.core.changed, event);
      }
    },
    log: coreLog,
  });

  let quitConfirmed = false;
  app.on("before-quit", (event) => {
    if (desktopUpdater.isInstalling()) quitConfirmed = true;
    if (!quitConfirmed) {
      const quitSettings = quitPreferences.getPreferences();
      if (!quitSettings.confirmOnQuit) {
        quitConfirmed = true;
        if (quitSettings.quitAction === "stop") {
          event.preventDefault();
          void stopCore({ dbPath: resolveUserDatabasePath() })
            .catch((error) => log.error("Failed to stop Polterware core.", error))
            .finally(() => app.quit());
          return;
        }
      } else {
        event.preventDefault();
        void confirmQuit(quitPreferences).then((choice) => {
          if (choice === "cancel") return;
          quitConfirmed = true;
          const stop =
            choice === "stop-core"
              ? stopCore({ dbPath: resolveUserDatabasePath() }).catch((error) =>
                  log.error("Failed to stop Polterware core.", error),
                )
              : Promise.resolve();
          void stop.finally(() => app.quit());
        });
        return;
      }
    }
    unregisterCommanderShortcut();
    void mcpSupervisor.stop();
    stopChangeWatcher();
    coreLifecycle.dispose();
  });
}

app.whenReady().then(() => {
  void bootstrap();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  showMainWindow();
});
