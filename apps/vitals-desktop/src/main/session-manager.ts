import { randomUUID } from "node:crypto";
import { accessSync, constants } from "node:fs";
import type { BrowserWindow } from "electron";
import type {
  ConnectPayload,
  ConnectionMetricsMode,
  ConnectionStateEvent,
  HostKeyPrompt,
  MetricsEvent,
  ShellDataEvent,
  ShellExitEvent,
} from "../shared/bridge.js";
import { IPC_EVENTS } from "../shared/channels.js";
import { AgentSession } from "./agent-session.js";
import {
  deleteServer,
  getServerById,
  getServerSecrets,
  listServersPublic,
  upsertServer,
} from "./storage.js";
import {
  ShellInputError,
  ShellSession,
  assertAckBytes,
  assertDimensions,
  assertSessionId,
  assertShellData,
} from "./shell-session.js";
import { resolveAgentSocket } from "./ssh-auth.js";
import { assertKillSignal, assertPid, SshSession, type SessionAuth } from "./ssh-session.js";

import { getSettings } from "./settings.js";

type MetricsSession = AgentSession | SshSession;

interface ManagedSession {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  auth: SessionAuth;
  ssh: MetricsSession;
  mode: ConnectionMetricsMode;
  shell: ShellSession | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  pendingFingerprint: string | null;
  allowReconnect: boolean;
  /** A session that never authenticated fails for good instead of retrying. */
  everConnected: boolean;
}

export class SessionManager {
  private sessions = new Map<string, ManagedSession>();
  private window: BrowserWindow | null = null;

  /**
   * Sessions belong to the renderer that opened them: a reload or a closed
   * window loses its tabs, so its SSH sessions and remote agents end too.
   */
  setWindow(win: BrowserWindow): void {
    this.window = win;
    win.webContents.on("did-start-navigation", (details) => {
      if (details.isMainFrame && !details.isSameDocument) this.disconnectAll();
    });
    win.on("closed", () => {
      if (this.window === win) this.window = null;
      this.disconnectAll();
    });
  }

  disconnectAll(): void {
    for (const sessionId of [...this.sessions.keys()]) this.disconnect(sessionId);
  }

  listServers() {
    return listServersPublic();
  }

  deleteServer(id: string) {
    deleteServer(id);
  }

  private emit(channel: string, payload: unknown): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send(channel, payload);
  }

  connect(payload: ConnectPayload): { sessionId: string } {
    const sessionId = payload.sessionId ?? randomUUID();
    if (this.sessions.has(sessionId)) throw new Error("Session already exists");
    let auth: SessionAuth = {
      password: payload.password,
      privateKeyPath: payload.privateKeyPath,
      privateKeyPassphrase: payload.privateKeyPassphrase,
    };
    let authMode = payload.authMode;

    if (payload.serverId) {
      const pub = getServerById(payload.serverId);
      const secrets = getServerSecrets(payload.serverId);
      if (pub && secrets) {
        authMode = pub.authMode;
        auth = {
          password: secrets.password,
          privateKeyPath: pub.privateKeyPath,
          privateKeyPassphrase: secrets.privateKeyPassphrase,
        };
      }
    }

    const issues: string[] = [];
    if (authMode === "agent") {
      const agent = resolveAgentSocket();
      if (!agent) issues.push("No SSH agent found: SSH_AUTH_SOCK is not set");
      else auth = { agent };
    }
    if (authMode === "privateKey") {
      if (!auth.privateKeyPath) issues.push("Private key path is required");
      else {
        try {
          accessSync(auth.privateKeyPath, constants.R_OK);
        } catch {
          issues.push(`Private key file is not readable: ${auth.privateKeyPath}`);
        }
      }
    }
    if (issues.length > 0) throw new Error(issues.join("\n"));

    const label = payload.label || payload.host || `${payload.username}@${payload.host}`;

    const managed: ManagedSession = {
      id: sessionId,
      label,
      host: payload.host,
      port: payload.port,
      username: payload.username,
      auth,
      ssh: null as unknown as MetricsSession,
      mode: "agent",
      shell: null,
      reconnectTimer: null,
      pendingFingerprint: null,
      allowReconnect: true,
      everConnected: false,
    };

    const sendState = (status: ConnectionStateEvent["status"], message?: string) => {
      this.emit(IPC_EVENTS.connection.state, {
        sessionId,
        status,
        message,
        label,
        host: payload.host,
        mode: managed.mode,
      } satisfies ConnectionStateEvent);
    };

    const onMetrics = (snapshot: MetricsEvent["snapshot"], collectedAt: number) => {
      this.emit(IPC_EVENTS.metrics.snapshot, {
        sessionId,
        snapshot,
        collectedAt,
      } satisfies MetricsEvent);
    };

    // Only a server that authenticated is worth keeping.
    const saveServer = () => {
      if (!payload.save) return;
      upsertServer(
        {
          id: payload.serverId,
          label,
          host: payload.host,
          port: payload.port,
          username: payload.username,
          authMode: payload.authMode,
          privateKeyPath: payload.authMode === "privateKey" ? payload.privateKeyPath : undefined,
        },
        {
          password: payload.password,
          privateKeyPassphrase: payload.privateKeyPassphrase,
        },
      );
    };

    const onStatus = (status: string, message?: string) => {
      const mapped =
        status === "connected"
          ? "connected"
          : status === "connecting"
            ? "connecting"
            : status === "disconnected"
              ? "disconnected"
              : status === "error"
                ? "error"
                : "connecting";
      const current = this.sessions.get(sessionId);
      if (mapped === "connected" && current && !current.everConnected) {
        current.everConnected = true;
        saveServer();
      }
      sendState(mapped as ConnectionStateEvent["status"], message);

      if (mapped === "disconnected" && current && current.everConnected && current.allowReconnect && getSettings().autoReconnect && !current.reconnectTimer) {
        const delay = getSettings().reconnectDelaySeconds;
        sendState("reconnecting", "Reconnecting in " + delay + "s…");
        current.reconnectTimer = setTimeout(() => {
          current.reconnectTimer = null;
          if (!this.sessions.has(sessionId) || !getSettings().autoReconnect) {
            sendState("disconnected");
            return;
          }
          current.ssh.resetClient();
          sendState("reconnecting");
          current.ssh.connect();
        }, delay * 1000);
      }
    };

    const onHostKeyPrompt = (fingerprint: string) => {
      const current = this.sessions.get(sessionId);
      if (current) current.pendingFingerprint = fingerprint;
      this.emit(IPC_EVENTS.hostKey.prompt, {
        sessionId,
        host: payload.host,
        port: payload.port,
        fingerprint,
      } satisfies HostKeyPrompt);
    };

    const startFallback = (reason: string) => {
      const current = this.sessions.get(sessionId);
      if (!current || current.mode === "fallback") return;
      current.mode = "fallback";
      try {
        current.ssh.dispose();
      } catch {
        /* ignore */
      }
      const fallback = new SshSession({
        sessionId,
        host: payload.host,
        port: payload.port,
        username: payload.username,
        auth,
        onMetrics,
        onStatus,
        onHostKeyPrompt,
      });
      current.ssh = fallback;
      sendState("connecting", `Agent unavailable; using script fallback (${reason})`);
      fallback.connect();
    };

    const agent = new AgentSession({
      sessionId,
      host: payload.host,
      port: payload.port,
      username: payload.username,
      auth,
      onMetrics,
      onStatus,
      onHostKeyPrompt,
      onFallback: startFallback,
    });

    managed.ssh = agent;
    this.sessions.set(sessionId, managed);

    sendState("connecting");
    agent.connect();

    return { sessionId };
  }

  disconnect(sessionId: string): void {
    const managed = this.sessions.get(sessionId);
    if (!managed) return;
    managed.allowReconnect = false;
    if (managed.reconnectTimer) clearTimeout(managed.reconnectTimer);
    managed.shell?.dispose();
    managed.ssh.dispose();
    this.sessions.delete(sessionId);
    this.emit(IPC_EVENTS.connection.state, {
      sessionId,
      status: "disconnected",
      label: managed.label,
      host: managed.host,
      mode: managed.mode,
    } satisfies ConnectionStateEvent);
  }

  acceptHostKey(sessionId: string): void {
    const managed = this.sessions.get(sessionId);
    if (!managed || !managed.pendingFingerprint) return;
    managed.ssh.approveHostKey(managed.pendingFingerprint);
    managed.pendingFingerprint = null;
    managed.ssh.resetClient();
    managed.ssh.connect();
  }

  rejectHostKey(sessionId: string): void {
    this.disconnect(sessionId);
  }

  async shellOpen(sessionId: string, cols: number, rows: number): Promise<void> {
    const id = assertSessionId(sessionId);
    const dims = assertDimensions(cols, rows);
    const shell = this.ensureShell(this.requireSession(id));
    await shell.open(dims.cols, dims.rows);
  }

  shellWrite(sessionId: string, data: string): void {
    const id = assertSessionId(sessionId);
    const text = assertShellData(data);
    this.requireSession(id).shell?.write(text);
  }

  shellResize(sessionId: string, cols: number, rows: number): void {
    const id = assertSessionId(sessionId);
    const dims = assertDimensions(cols, rows);
    this.requireSession(id).shell?.resize(dims.cols, dims.rows);
  }

  shellAck(sessionId: string, bytes: number): void {
    const id = assertSessionId(sessionId);
    const count = assertAckBytes(bytes);
    this.requireSession(id).shell?.ack(count);
  }

  shellClose(sessionId: string): void {
    const id = assertSessionId(sessionId);
    this.requireSession(id).shell?.close();
  }

  private requireSession(sessionId: string): ManagedSession {
    const managed = this.sessions.get(sessionId);
    if (!managed) throw new ShellInputError("Session not found");
    return managed;
  }

  private ensureShell(managed: ManagedSession): ShellSession {
    if (!managed.shell) {
      const sessionId = managed.id;
      managed.shell = new ShellSession({
        host: managed.host,
        port: managed.port,
        username: managed.username,
        auth: managed.auth,
        onData: (data) => {
          this.emit(IPC_EVENTS.shell.data, { sessionId, data } satisfies ShellDataEvent);
        },
        onExit: () => {
          this.emit(IPC_EVENTS.shell.exit, { sessionId } satisfies ShellExitEvent);
        },
      });
    }
    return managed.shell;
  }

  async killProcess(sessionId: string, pid: number, signal: "TERM" | "KILL"): Promise<void> {
    const target = assertPid(pid);
    const sig = assertKillSignal(signal);
    const managed = this.sessions.get(sessionId);
    if (!managed) throw new Error("Session not found");
    await managed.ssh.killProcess(target, sig);
  }
}
