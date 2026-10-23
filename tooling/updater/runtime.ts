import { createRequire } from "node:module";
import { join } from "node:path";

type NativeUpdater = {
  start(): boolean;
  check(): void;
  isInstalling(): boolean;
};

/** Main-process only. Sparkle owns its native dialogs, scheduling, and signed installation. */
export function createDesktopUpdater(options: {
  isPackaged: boolean;
  resourcesPath: string;
  showError: (title: string, message: string) => void;
}) {
  let bridge: NativeUpdater | undefined;
  let started = false;
  let error = "Updates are available in packaged macOS builds only.";
  const status = (): "enabled" | "disabled" | "unavailable" =>
    bridge ? "enabled" : options.isPackaged && process.platform === "darwin" ? "unavailable" : "disabled";

  function start() {
    if (started || !options.isPackaged || process.platform !== "darwin") return;
    started = true;
    try {
      const require = createRequire(join(options.resourcesPath, "updater", "bridge.cjs"));
      const candidate = require(join(options.resourcesPath, "updater", "updater.node")) as NativeUpdater;
      if (!candidate.start()) throw new Error("Sparkle could not start.");
      bridge = candidate;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "The updater could not be loaded.";
      console.error("Desktop updater unavailable:", error);
    }
  }

  function check() {
    start();
    if (!bridge) {
      options.showError("Updates unavailable", error);
      return;
    }
    try { bridge.check(); }
    catch (cause) { options.showError("Update check failed", cause instanceof Error ? cause.message : "Try again later."); }
  }

  return {
    start,
    check,
    status,
    isInstalling: () => bridge?.isInstalling() ?? false,
    menuItem: () => ({ label: "Check for Updates…", enabled: options.isPackaged && process.platform === "darwin", click: check }),
  };
}
