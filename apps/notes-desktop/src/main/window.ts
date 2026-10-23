import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { canOpenExternalUrl, isAllowedRendererUrl } from "./navigation-policy.js";

const OPAQUE_FILL = "#131313";
let reduceTransparencyPref = false;

export function rendererDocument(): string {
  return !app.isPackaged && process.env.ELECTRON_RENDERER_URL
    ? process.env.ELECTRON_RENDERER_URL : pathToFileURL(join(__dirname, "../renderer/index.html")).href;
}

function rendererLoadUrl(reduceTransparency: boolean): { kind: "url"; value: string } | { kind: "file"; path: string; search: string } {
  const flag = reduceTransparency ? "1" : "0";
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL);
    url.searchParams.set("reduceTransparency", flag);
    return { kind: "url", value: url.href };
  }
  return { kind: "file", path: join(__dirname, "../renderer/index.html"), search: `reduceTransparency=${flag}` };
}

export function applyDarwinWindowChrome(window: BrowserWindow, reduceTransparency: boolean): void {
  if (process.platform !== "darwin") return;
  if (reduceTransparency) {
    window.setVibrancy(null);
    window.setBackgroundColor(OPAQUE_FILL);
    return;
  }
  window.setVibrancy("under-window");
}

function applyRendererChrome(window: BrowserWindow, reduceTransparency: boolean): void {
  const mode = reduceTransparency ? "solid" : "vibrancy";
  void window.webContents.executeJavaScript(`document.documentElement.dataset.shellChrome=${JSON.stringify(mode)}`).catch(() => undefined);
}

/** Toggle solid vs frosted chrome on every open window (macOS vibrancy). */
export function applyReduceTransparency(enabled: boolean): void {
  reduceTransparencyPref = enabled;
  for (const window of BrowserWindow.getAllWindows()) {
    applyDarwinWindowChrome(window, enabled);
    applyRendererChrome(window, enabled);
  }
}

export function createWindow(options: { reduceTransparency?: boolean } = {}): BrowserWindow {
  const reduceTransparency = options.reduceTransparency ?? reduceTransparencyPref;
  reduceTransparencyPref = reduceTransparency;
  const useVibrancy = process.platform === "darwin" && !reduceTransparency;
  const win = new BrowserWindow({ width: 1200, height: 800, minWidth: 800, minHeight: 560, title: "Polterware Notes", show: false,
    titleBarStyle: "hidden", ...(reduceTransparency ? { backgroundColor: OPAQUE_FILL } : {}),
    ...(process.platform === "darwin" ? { visualEffectState: "active" as const, ...(useVibrancy ? { vibrancy: "under-window" as const } : {}) } : {}),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true,
      preload: join(__dirname, "../preload/index.cjs") },
  });
  configureWindowSecurity(win);
  win.once("ready-to-show", () => {
    applyDarwinWindowChrome(win, reduceTransparency);
    win.show();
  });
  const load = rendererLoadUrl(reduceTransparency);
  if (load.kind === "url") void win.loadURL(load.value);
  else void win.loadFile(load.path, { search: load.search });
  return win;
}
export function configureWindowSecurity(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (canOpenExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  const denyForeign = (navigation: { preventDefault(): void }, url: string) => {
    if (!isAllowedRendererUrl(url, rendererDocument())) navigation.preventDefault();
  };
  win.webContents.on("will-navigate", denyForeign);
  win.webContents.on("will-redirect", denyForeign);
  win.webContents.on("will-attach-webview", event => event.preventDefault());
}
