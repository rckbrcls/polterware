import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, IPC_EVENTS } from "../shared/channels.js";
import type {
  ConnectPayload,
  ConnectionStateEvent,
  HostKeyPrompt,
  KillProcessPayload,
  MetricsEvent,
  ShellDataEvent,
  ShellExitEvent,
  VitalsBridge,
} from "../shared/bridge.js";

const c = IPC_CHANNELS;
const e = IPC_EVENTS;

function subscribe<T>(channel: string, callback: (event: T) => void): () => void {
  const listener = (_event: unknown, value: T) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: VitalsBridge = {
  connect: (payload: ConnectPayload) => ipcRenderer.invoke(c.session.connect, payload),
  disconnect: (sessionId: string) => ipcRenderer.invoke(c.session.disconnect, sessionId),
  listServers: () => ipcRenderer.invoke(c.session.listServers),
  deleteServer: (id: string) => ipcRenderer.invoke(c.session.deleteServer, id),
  acceptHostKey: (sessionId: string) => ipcRenderer.invoke(c.session.hostKeyAccept, sessionId),
  rejectHostKey: (sessionId: string) => ipcRenderer.invoke(c.session.hostKeyReject, sessionId),
  killProcess: (payload: KillProcessPayload) => ipcRenderer.invoke(c.session.killProcess, payload),
  shellOpen: (payload) => ipcRenderer.invoke(c.shell.open, payload),
  shellWrite: (payload) => ipcRenderer.invoke(c.shell.write, payload),
  shellResize: (payload) => ipcRenderer.invoke(c.shell.resize, payload),
  shellClose: (sessionId) => ipcRenderer.invoke(c.shell.close, sessionId),
  shellAck: (payload) => ipcRenderer.invoke(c.shell.ack, payload),
  onShellData: (cb) => subscribe<ShellDataEvent>(e.shell.data, cb),
  onShellExit: (cb) => subscribe<ShellExitEvent>(e.shell.exit, cb),
  getSettings: () => ipcRenderer.invoke(c.settings.get),
  updateSettings: (patch) => ipcRenderer.invoke(c.settings.update, patch),
  onSettingsChanged: (cb) => subscribe<import("../shared/settings.js").VitalsSettings>(e.settings.changed, cb),
  listKnownHosts: () => ipcRenderer.invoke(c.knownHosts.list),
  removeKnownHost: (key) => ipcRenderer.invoke(c.knownHosts.remove, key),
  getTheme: () => ipcRenderer.invoke(c.theme.get),
  setTheme: (theme) => ipcRenderer.invoke(c.theme.set, theme),
  onConnectionState: (cb) => subscribe<ConnectionStateEvent>(e.connection.state, cb),
  onMetrics: (cb) => subscribe<MetricsEvent>(e.metrics.snapshot, cb),
  onHostKeyPrompt: (cb) => subscribe<HostKeyPrompt>(e.hostKey.prompt, cb),
};

contextBridge.exposeInMainWorld("vitals", api);
