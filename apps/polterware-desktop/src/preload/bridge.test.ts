import { describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../shared/ipc.js";

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: { invoke: electron.invoke, on: electron.on, removeListener: electron.removeListener },
}));

const { createPolterwareBridge } = await import("./bridge.js");

// Importing the preload script exposes the API once; read it before any test can reset the mock.
const exposeCalls = [...electron.exposeInMainWorld.mock.calls];

describe("createPolterwareBridge", () => {
  it("routes local chrome calls through the expected IPC channels", async () => {
    const invoke = vi.fn().mockResolvedValue([]);
    const bridge = createPolterwareBridge({ invoke });

    await bridge.app.listIcons();
    await bridge.app.getIcon();
    await bridge.app.setIcon("black");
    await bridge.app.getShortcutPreferences();
    await bridge.app.setShortcutPreferences({ "shell.toggle_commander": "mod+p" });
    await bridge.app.getAppearancePreferences();
    await bridge.app.setAppearancePreferences({ reduceTransparency: true });
    await bridge.app.selectDirectory();
    await bridge.commander.hideOverlay();
    await bridge.commander.showMainWindow();
    await bridge.commander.runCommand("nav.architecture");

    expect(invoke).toHaveBeenNthCalledWith(1, IPC_CHANNELS.app.listIcons);
    expect(invoke).toHaveBeenNthCalledWith(2, IPC_CHANNELS.app.getIcon);
    expect(invoke).toHaveBeenNthCalledWith(3, IPC_CHANNELS.app.setIcon, {
      id: "black",
    });
    expect(invoke).toHaveBeenNthCalledWith(4, IPC_CHANNELS.app.getShortcutPreferences);
    expect(invoke).toHaveBeenNthCalledWith(5, IPC_CHANNELS.app.setShortcutPreferences, {
      overrides: { "shell.toggle_commander": "mod+p" },
    });
    expect(invoke).toHaveBeenNthCalledWith(6, IPC_CHANNELS.app.getAppearancePreferences);
    expect(invoke).toHaveBeenNthCalledWith(7, IPC_CHANNELS.app.setAppearancePreferences, {
      reduceTransparency: true,
    });
    expect(invoke).toHaveBeenNthCalledWith(8, IPC_CHANNELS.app.selectDirectory);
    expect(invoke).toHaveBeenNthCalledWith(
      9,
      IPC_CHANNELS.commander.hideOverlay,
    );
    expect(invoke).toHaveBeenNthCalledWith(
      10,
      IPC_CHANNELS.commander.showMainWindow,
    );
    expect(invoke).toHaveBeenNthCalledWith(
      11,
      IPC_CHANNELS.commander.runCommand,
      { id: "nav.architecture" },
    );
  });

  it("routes core calls through namespaced IPC channels", async () => {
    const invoke = vi.fn().mockResolvedValue({});
    const bridge = createPolterwareBridge({ invoke });

    await bridge.core.projects.list();
    await bridge.core.health.getStoreHealth();

    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.core.listProjects, undefined);
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.core.getStoreHealth, undefined);
  });

  it("subscribes to Commander focus events and returns an unsubscribe function", () => {
    const invoke = vi.fn().mockResolvedValue([]);
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const on = vi.fn(
      (channel: string, listener: (...args: unknown[]) => void) => {
        listeners.set(channel, listener);
      },
    );
    const removeListener = vi.fn();
    const bridge = createPolterwareBridge({ invoke, on, removeListener });
    const callback = vi.fn();

    const unsubscribe = bridge.commander.onFocusSearch(callback);
    listeners.get("commander:focus-search")?.();
    unsubscribe();

    expect(callback).toHaveBeenCalledOnce();
    expect(removeListener).toHaveBeenCalledWith(
      "commander:focus-search",
      listeners.get("commander:focus-search"),
    );
  });

  it("subscribes to Commander execute events and returns an unsubscribe function", () => {
    const invoke = vi.fn().mockResolvedValue([]);
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const on = vi.fn(
      (channel: string, listener: (...args: unknown[]) => void) => {
        listeners.set(channel, listener);
      },
    );
    const removeListener = vi.fn();
    const bridge = createPolterwareBridge({ invoke, on, removeListener });
    const callback = vi.fn();

    const unsubscribe = bridge.commander.onExecuteCommand(callback);
    listeners.get("commander:execute-command")?.(undefined, { id: "nav.architecture" });
    unsubscribe();

    expect(callback).toHaveBeenCalledWith("nav.architecture");
    expect(removeListener).toHaveBeenCalledWith(
      "commander:execute-command",
      listeners.get("commander:execute-command"),
    );
  });

  it("exposes only window.polterware, never the raw ipcRenderer", () => {
    expect(exposeCalls).toHaveLength(1);
    const [name, api] = exposeCalls[0] as [string, Record<string, unknown>];
    expect(name).toBe("polterware");
    expect(Object.keys(api)).not.toContain("ipcRenderer");
    expect(JSON.stringify(Object.keys(api))).not.toMatch(/ipc|electron|require|process/i);
  });

  it("forwards the real ipcRenderer through the wrapper", async () => {
    electron.invoke.mockResolvedValueOnce([]);
    const [, api] = exposeCalls[0] as [string, ReturnType<typeof createPolterwareBridge>];
    await api.app.listIcons();
    expect(electron.invoke).toHaveBeenCalledWith(IPC_CHANNELS.app.listIcons, undefined);
  });
});
