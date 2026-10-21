import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { ConnectPayload, KillProcessPayload } from "../shared/bridge.js";
import { IPC_CHANNELS } from "../shared/channels.js";
import type { SessionManager } from "./session-manager.js";
import { assertSessionId, parseShellAck, parseShellOpen, parseShellResize, parseShellWrite } from "./shell-session.js";
import { getSettings, updateSettings } from "./settings.js";
import { listKnownHosts, removeKnownHost } from "./known-hosts.js";
import { readTheme, writeTheme } from "./theme.js";
import { applyReduceTransparency } from "./window.js";

type IpcHandle = (event: IpcMainInvokeEvent, payload?: unknown) => unknown | Promise<unknown>;

export type VitalsSessionService = Pick<
  SessionManager,
  | "connect"
  | "disconnect"
  | "listServers"
  | "deleteServer"
  | "acceptHostKey"
  | "rejectHostKey"
  | "killProcess"
  | "shellOpen"
  | "shellWrite"
  | "shellResize"
  | "shellClose"
  | "shellAck"
>;

export function createVitalsIpcHandlers(deps: {
  sessions: VitalsSessionService;
}): Record<string, IpcHandle> {
  const { sessions } = deps;
  const c = IPC_CHANNELS;
  return {
    [c.session.connect]: (_e, payload) => sessions.connect(payload as ConnectPayload),
    [c.session.disconnect]: (_e, sessionId) => {
      sessions.disconnect(sessionId as string);
    },
    [c.session.listServers]: () => sessions.listServers(),
    [c.session.deleteServer]: (_e, id) => {
      sessions.deleteServer(id as string);
    },
    [c.session.hostKeyAccept]: (_e, sessionId) => {
      sessions.acceptHostKey(sessionId as string);
    },
    [c.session.hostKeyReject]: (_e, sessionId) => {
      sessions.rejectHostKey(sessionId as string);
    },
    [c.session.killProcess]: (_e, payload) => {
      const p = payload as KillProcessPayload;
      return sessions.killProcess(p.sessionId, p.pid, p.signal ?? getSettings().defaultKillSignal);
    },
    [c.shell.open]: (_e, payload) => {
      const p = parseShellOpen(payload);
      return sessions.shellOpen(p.sessionId, p.cols, p.rows);
    },
    [c.shell.write]: (_e, payload) => {
      const p = parseShellWrite(payload);
      sessions.shellWrite(p.sessionId, p.data);
    },
    [c.shell.resize]: (_e, payload) => {
      const p = parseShellResize(payload);
      sessions.shellResize(p.sessionId, p.cols, p.rows);
    },
    [c.shell.close]: (_e, sessionId) => {
      sessions.shellClose(assertSessionId(sessionId));
    },
    [c.shell.ack]: (_e, payload) => {
      const p = parseShellAck(payload);
      sessions.shellAck(p.sessionId, p.bytes);
    },
    [c.settings.get]: () => getSettings(),
    [c.settings.update]: (_e, patch) => {
      const before = getSettings().reduceTransparency;
      const settings = updateSettings(patch);
      if (settings.reduceTransparency !== before) applyReduceTransparency(settings.reduceTransparency);
      return settings;
    },
    [c.knownHosts.list]: () => listKnownHosts(),
    [c.knownHosts.remove]: (_e, key) => removeKnownHost(key as string),
    [c.theme.get]: () => readTheme(),
    [c.theme.set]: (_e, theme) => {
      writeTheme(theme as "dark" | "light");
    },
  };
}

export function registerVitalsIpcHandlers(
  deps: { sessions: VitalsSessionService },
  ipcMain: Pick<IpcMain, "handle">,
): void {
  const handlers = createVitalsIpcHandlers(deps);
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler);
  }
}
