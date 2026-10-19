import { app, BrowserWindow, nativeImage } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAppIconController,
  type AppIconController,
} from "./app-icons.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let appIconController: AppIconController | null = null;

function unique(paths: string[]): string[] {
  return [...new Set(paths)];
}

export interface ElectronAppIconAdapter {
  getAppPath(): string;
  getUserDataPath(): string;
  applyIcon(iconPath: string): void;
}

export const defaultElectronAdapter: ElectronAppIconAdapter = {
  getAppPath: () => app.getAppPath(),
  getUserDataPath: () => app.getPath("userData"),
  applyIcon: (iconPath) => {
    const icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) return;
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.setIcon(icon);
    }
    app.dock?.setIcon(icon);
  },
};

export function getAppIconResourceDirectories(adapter: ElectronAppIconAdapter = defaultElectronAdapter): string[] {
  return unique([
    join(process.resourcesPath, "resources", "app-icons"),
    join(adapter.getAppPath(), "resources", "app-icons"),
    join(process.cwd(), "resources", "app-icons"),
    join(process.cwd(), "apps", "desktop", "resources", "app-icons"),
    join(__dirname, "..", "..", "resources", "app-icons"),
  ]);
}

export function applyElectronIcon(iconPath: string, adapter: ElectronAppIconAdapter = defaultElectronAdapter): void {
  adapter.applyIcon(iconPath);
}

export function getElectronAppIconController(adapter: ElectronAppIconAdapter = defaultElectronAdapter): AppIconController {
  appIconController ??= createAppIconController({
    applyIcon: (iconPath) => adapter.applyIcon(iconPath),
    resourceDirectories: getAppIconResourceDirectories(adapter),
    userDataDirectory: adapter.getUserDataPath(),
  });

  return appIconController;
}

export function getSelectedAppIconPath(adapter: ElectronAppIconAdapter = defaultElectronAdapter): string | undefined {
  try {
    return getElectronAppIconController(adapter).getSelectedIconPath();
  } catch {
    return undefined;
  }
}
