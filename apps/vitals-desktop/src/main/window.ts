import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { canOpenExternalUrl, isAllowedRendererUrl } from "./navigation-policy.js";

const OPAQUE_FILL = "#131313";
/** Fully clear native fill so the under-window frost shows; the CSS glass wash keeps it dark. */
const CLEAR_FILL = "#00000000";
let reduceTransparencyPref = false;

export function rendererDocument(): string {
  return !app.isPackaged && process.env.ELECTRON_RENDERER_URL
    ? process.env.ELECTRON_RENDERER_URL
    : pathToFileURL(join(__dirname, "../renderer/index.html")).href;
}

/** Only macOS has vibrancy; everywhere else the renderer paints solid chrome. */
function solidChrome(reduceTransparency: boolean): boolean {
  return reduceTransparency || process.platform !== "darwin";
}

function rendererLoadUrl(
  reduceTransparency: boolean,
): { kind: "url"; value: string } | { kind: "file"; path: string; search: string } {
  const flag = solidChrome(reduceTransparency) ? "1" : "0";
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL);
    url.searchParams.set("reduceTransparency", flag);
    return { kind: "url", value: url.href };
  }
  return {
    kind: "file",
    path: join(__dirname, "../renderer/index.html"),
    search: `reduceTransparency=${flag}`,
  };
}

export function applyDarwinWindowChrome(window: BrowserWindow, reduceTransparency: boolean): void {
  if (process.platform !== "darwin") return;
  if (reduceTransparency) {
    window.setVibrancy(null);
    window.setBackgroundColor(OPAQUE_FILL);
    return;
  }
  window.setBackgroundColor(CLEAR_FILL);
  window.setVibrancy("under-window");
}

function applyRendererChrome(window: BrowserWindow, reduceTransparency: boolean): void {
  const mode = solidChrome(reduceTransparency) ? "solid" : "vibrancy";
  void window.webContents
    .executeJavaScript(`document.documentElement.dataset.shellChrome=${JSON.stringify(mode)}`)
    .catch(() => undefined);
}

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
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: "Polterware Vitals",
    show: false,
    titleBarStyle: "hidden",
    backgroundColor: useVibrancy ? CLEAR_FILL : OPAQUE_FILL,
    ...(process.platform === "darwin"
      ? {
          transparent: true,
          visualEffectState: "active" as const,
          // Sits the 12px buttons 1px above center on the 44px tab strip, which reads level with its 24px controls.
          trafficLightPosition: { x: 14, y: 15 },
          ...(useVibrancy ? { vibrancy: "under-window" as const } : {}),
        }
      : {}),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      preload: join(__dirname, "../preload/index.cjs"),
    },
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
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
}
