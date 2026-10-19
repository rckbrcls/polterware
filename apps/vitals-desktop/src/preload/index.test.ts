import { describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS, IPC_EVENTS } from "../shared/channels.js";

const mock = vi.hoisted(() => ({
  expose: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: mock.expose },
  ipcRenderer: { invoke: mock.invoke, on: mock.on, removeListener: mock.remove },
}));

import "./index.js";
import type { VitalsBridge } from "../shared/bridge.js";

const exposedName = mock.expose.mock.calls[0]![0];
const bridge = mock.expose.mock.calls[0]![1] as VitalsBridge;

describe("sandbox bridge", () => {
  it("exposes only the typed Vitals API", () => {
    expect(exposedName).toBe("vitals");
    expect(bridge).not.toHaveProperty("ipcRenderer");
    expect(bridge).not.toHaveProperty("invoke");
  });

  it("uses fixed channels for invoke", async () => {
    await bridge.getSettings();
    expect(mock.invoke).toHaveBeenCalledWith(IPC_CHANNELS.settings.get);
    await bridge.updateSettings({ defaultKillSignal: "KILL" });
    expect(mock.invoke).toHaveBeenCalledWith(IPC_CHANNELS.settings.update, { defaultKillSignal: "KILL" });
    await bridge.listKnownHosts();
    expect(mock.invoke).toHaveBeenCalledWith(IPC_CHANNELS.knownHosts.list);
    await bridge.removeKnownHost("host:22");
    expect(mock.invoke).toHaveBeenCalledWith(IPC_CHANNELS.knownHosts.remove, "host:22");
    await bridge.listServers();
    expect(mock.invoke).toHaveBeenCalledWith(IPC_CHANNELS.session.listServers);
    await bridge.connect({
      host: "h",
      port: 22,
      username: "u",
      authMode: "password",
    });
    expect(mock.invoke).toHaveBeenCalledWith(IPC_CHANNELS.session.connect, {
      host: "h",
      port: 22,
      username: "u",
      authMode: "password",
    });
  });

  it("subscribes to settings without exposing Electron events", () => {
    const callback = vi.fn();
    const unsubscribe = bridge.onSettingsChanged(callback);
    const [channel, listener] = mock.on.mock.calls.at(-1)!;
    expect(channel).toBe(IPC_EVENTS.settings.changed);
    listener({ sender: "secret" }, { theme: "system" });
    expect(callback).toHaveBeenCalledWith({ theme: "system" });
    unsubscribe();
    expect(mock.remove).toHaveBeenCalledWith(channel, listener);
  });

  it("subscribes to events and unsubscribes exactly its listener", () => {
    const callback = vi.fn();
    const unsubscribe = bridge.onMetrics(callback);
    const [event, listener] = mock.on.mock.calls.at(-1)!;
    expect(event).toBe(IPC_EVENTS.metrics.snapshot);
    listener({ sender: "secret" }, { sessionId: "s", snapshot: {}, collectedAt: 1 });
    expect(callback).toHaveBeenCalledWith({ sessionId: "s", snapshot: {}, collectedAt: 1 });
    unsubscribe();
    expect(mock.remove).toHaveBeenCalledWith(event, listener);
  });
});
