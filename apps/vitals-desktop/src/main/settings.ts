import { app, BrowserWindow } from "electron";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeSettings, type VitalsSettings } from "../shared/settings.js";
import { IPC_EVENTS } from "../shared/channels.js";

function readJson(path: string): unknown {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function save(settings: VitalsSettings): void {
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "settings.json");
  writeFileSync(path + ".tmp", JSON.stringify(settings, null, 2), "utf8");
  renameSync(path + ".tmp", path);
}

export function getSettings(): VitalsSettings {
  const dir = app.getPath("userData");
  const path = join(dir, "settings.json");
  if (existsSync(path)) return normalizeSettings(readJson(path));
  const settings = normalizeSettings(readJson(join(dir, "theme.json")));
  save(settings);
  return settings;
}

export function updateSettings(patch: unknown): VitalsSettings {
  const current = getSettings();
  const settings = normalizeSettings({ ...current, ...(patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {}) });
  save(settings);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC_EVENTS.settings.changed, settings);
  }
  return settings;
}
