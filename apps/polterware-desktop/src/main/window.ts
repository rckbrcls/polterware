import { app, BrowserWindow, Menu, screen, shell, type BrowserWindowConstructorOptions } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getSelectedAppIconPath } from "./electron-app-icons.js";
import { attachDesktopContextMenu } from "./desktop-context-menu.js";
import { attachDesktopInputGuards } from "./desktop-input-guards.js";
import {
  canOpenExternalUrl,
  isAllowedRendererUrl,
} from "./desktop-navigation-policy.js";
import { IPC_EVENTS } from "../shared/ipc.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMANDER_WINDOW_WIDTH = 720;
const COMMANDER_WINDOW_HEIGHT = 680;

let mainWindow: BrowserWindow | null = null;
let commanderWindow: BrowserWindow | null = null;
/** Suppress blur-hide briefly while the operator drags the frameless overlay. */
let commanderDragHideUntil = 0;
/** Last known Reduce transparency preference for recreate paths. */
let mainWindowReduceTransparency = false;

function getAppIconWindowOptions(): Pick<BrowserWindowConstructorOptions, "icon"> {
  const icon = getSelectedAppIconPath();
  return icon ? { icon } : {};
}

function getPackagedRendererUrl(): URL {
  return pathToFileURL(join(__dirname, "../renderer/index.html"));
}

function rendererUrlAllowed(rawUrl: string): boolean {
  return isAllowedRendererUrl(rawUrl, {
    isPackaged: app.isPackaged,
    rendererDevUrl: process.env["ELECTRON_RENDERER_URL"] ?? null,
    packagedRendererPathname: getPackagedRendererUrl().pathname,
  });
}

function denyForeignNavigation(event: { preventDefault: () => void }, url: string): void {
  if (rendererUrlAllowed(url)) {
    return;
  }

  event.preventDefault();

  if (canOpenExternalUrl(url)) {
    void shell.openExternal(url);
  }
}

function configureWindowSecurity(window: BrowserWindow): void {
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (canOpenExternalUrl(url)) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    denyForeignNavigation(event, url);
  });

  window.webContents.on("will-redirect", (event, url) => {
    denyForeignNavigation(event, url);
  });

  attachDesktopInputGuards(window.webContents, {
    allowReload: !app.isPackaged,
  });

  attachDesktopContextMenu(window.webContents, Menu, () => window);
}

function loadRenderer(window: BrowserWindow, surface?: "commander"): void {
  const reduceTransparencyParam = mainWindowReduceTransparency ? "1" : "0";
  const rendererUrl = process.env["ELECTRON_RENDERER_URL"];

  if (!app.isPackaged && rendererUrl) {
    const url = new URL(rendererUrl);
    if (surface) {
      url.searchParams.set("surface", surface);
    }
    url.searchParams.set("reduceTransparency", reduceTransparencyParam);
    void window.loadURL(url.toString());
    return;
  }

  const search = new URLSearchParams();
  if (surface) search.set("surface", surface);
  search.set("reduceTransparency", reduceTransparencyParam);
  void window.loadFile(join(__dirname, "../renderer/index.html"), {
    search: search.toString(),
  });
}

export type CreateMainWindowOptions = {
  /** When true, skip macOS vibrancy and use an opaque window fill. */
  reduceTransparency?: boolean;
};

function applyDarwinWindowChrome(window: BrowserWindow, reduceTransparency: boolean): void {
  if (reduceTransparency) {
    window.setVibrancy(null);
    window.setBackgroundColor("#131313");
    return;
  }
  // Fully clear native fill so under-window frost is visible; CSS glass wash keeps it dark.
  window.setBackgroundColor("#00000000");
  window.setVibrancy("under-window");
}

/** Toggle solid vs frosted chrome on the live main window (macOS). */
export function applyMainWindowAppearance(reduceTransparency: boolean): void {
  mainWindowReduceTransparency = reduceTransparency;
  const window = getMainWindow();
  if (window && process.platform === "darwin") {
    applyDarwinWindowChrome(window, reduceTransparency);
  }
}

export function createMainWindow(options: CreateMainWindowOptions = {}): BrowserWindow {
  const isDarwin = process.platform === "darwin";
  const reduceTransparency = Boolean(
    options.reduceTransparency ?? mainWindowReduceTransparency,
  );
  mainWindowReduceTransparency = reduceTransparency;
  const useVibrancy = isDarwin && !reduceTransparency;
  const windowOptions: BrowserWindowConstructorOptions = {
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    title: "Polterware",
    titleBarStyle: "hidden",
    // Clear native fill when vibrant; CSS --color-*-glass keeps the quiet dark cast.
    backgroundColor: useVibrancy ? "#00000000" : "#131313",
    show: false,
    ...getAppIconWindowOptions(),
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  };

  if (isDarwin) {
    windowOptions.transparent = true;
    windowOptions.visualEffectState = "active";
    if (useVibrancy) {
      windowOptions.vibrancy = "under-window";
    }
  } else {
    windowOptions.titleBarOverlay = true;
  }

  const window = new BrowserWindow(windowOptions);

  mainWindow = window;
  configureWindowSecurity(window);

  if (isDarwin) {
    applyDarwinWindowChrome(window, reduceTransparency);
  }

  window.once("ready-to-show", () => {
    if (isDarwin) {
      applyDarwinWindowChrome(window, reduceTransparency);
    }
    window.show();
  });

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }

    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  loadRenderer(window);
  return window;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

function centerCommanderWindow(window: BrowserWindow): void {
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const { height, width, x, y } = display.workArea;
  const nextX = Math.round(x + (width - COMMANDER_WINDOW_WIDTH) / 2);
  const nextY = Math.round(y + Math.max(32, (height - COMMANDER_WINDOW_HEIGHT) * 0.18));

  window.setBounds({
    x: nextX,
    y: nextY,
    width: COMMANDER_WINDOW_WIDTH,
    height: COMMANDER_WINDOW_HEIGHT,
  });
}

function focusCommanderSearch(window: BrowserWindow): void {
  window.webContents.send(IPC_EVENTS.commander.focusSearch);
}

function showAndFocusCommanderWindow(window: BrowserWindow): void {
  centerCommanderWindow(window);
  window.show();
  window.focus();
  focusCommanderSearch(window);
}

export function createCommanderWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: COMMANDER_WINDOW_WIDTH,
    height: COMMANDER_WINDOW_HEIGHT,
    show: false,
    frame: false,
    movable: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: false,
    hasShadow: true,
    backgroundColor: "#161616",
    ...getAppIconWindowOptions(),
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  commanderWindow = window;
  configureWindowSecurity(window);
  window.setAlwaysOnTop(true, "floating");

  window.on("will-move", () => {
    commanderDragHideUntil = Date.now() + 200;
  });
  window.on("moved", () => {
    commanderDragHideUntil = Date.now() + 150;
  });

  window.on("blur", () => {
    if (Date.now() < commanderDragHideUntil) return;
    window.hide();
  });

  window.on("closed", () => {
    if (commanderWindow === window) {
      commanderWindow = null;
    }
  });

  loadRenderer(window, "commander");
  return window;
}

export function getCommanderWindow(): BrowserWindow | null {
  return commanderWindow && !commanderWindow.isDestroyed() ? commanderWindow : null;
}

export function hideCommanderWindow(): void {
  getCommanderWindow()?.hide();
}

export function showCommanderWindow(): void {
  const window = getCommanderWindow() ?? createCommanderWindow();

  if (window.webContents.isLoading()) {
    window.webContents.once("did-finish-load", () => {
      if (!window.isDestroyed()) {
        showAndFocusCommanderWindow(window);
      }
    });
    return;
  }

  showAndFocusCommanderWindow(window);
}

export function toggleCommanderWindow(): void {
  const window = getCommanderWindow();

  if (window?.isVisible()) {
    window.hide();
    return;
  }

  showCommanderWindow();
}

export function showMainWindow(): BrowserWindow {
  const window = getMainWindow() ?? createMainWindow();

  if (window.isMinimized()) {
    window.restore();
  }

  window.show();
  window.focus();
  return window;
}

/** Hide the overlay, focus the main window, and ask it to run a palette command. */
export function runCommanderCommand(id: string): void {
  hideCommanderWindow();
  const window = showMainWindow();
  const send = () => {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_EVENTS.commander.executeCommand, { id });
    }
  };
  if (window.webContents.isLoading()) {
    window.webContents.once("did-finish-load", send);
    return;
  }
  send();
}
