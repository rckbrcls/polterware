import { Client, type ClientChannel, type ConnectConfig } from "ssh2";
import { createHash, randomUUID } from "node:crypto";
import { app } from "electron";
import type { AgentFrame, KillResultFrame } from "../shared/agent-protocol.js";
import { installAgent } from "./agent-installer.js";
import {
  assertHelloFrame,
  emptySlowCache,
  metricsFrameToSnapshot,
  NdjsonLineBuffer,
  parseAgentFrame,
  type SlowMetricsCache,
} from "./agent-frames.js";
import { setKnownFingerprint, verifyFingerprint } from "./known-hosts.js";
import { applySshAuth } from "./ssh-auth.js";
import type { SessionConfig } from "./ssh-session.js";

export type { SessionConfig };
export {
  assertHelloFrame,
  emptySlowCache,
  metricsFrameToSnapshot,
  NdjsonLineBuffer,
  parseAgentFrame,
  ProtocolVersionError,
} from "./agent-frames.js";

export interface AgentSessionConfig extends SessionConfig {
  /** Called once when agent install/exec cannot start; session-manager should fall back. */
  onFallback: (reason: string) => void;
}

function fingerprintSha256(key: Buffer): string {
  return `SHA256:${createHash("sha256").update(key).digest("base64")}`;
}

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 10_000;
const FAILURES_BEFORE_ERROR = 3;

export class AgentSession {
  private client = new Client();
  private shell: ClientChannel | null = null;
  private agentStream: ClientChannel | null = null;
  private streamEpoch = 0;
  private disposed = false;
  private approvedFingerprint: string | null = null;
  private agentCommand: string | null = null;
  private lineBuf = new NdjsonLineBuffer();
  private slow: SlowMetricsCache = emptySlowCache();
  private awaitingHello = false;
  private agentReady = false;
  private consecutiveFailures = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingKills = new Map<
    string,
    { resolve: () => void; reject: (err: Error) => void }
  >();
  private fellBack = false;

  constructor(private config: AgentSessionConfig) {}

  approveHostKey(fingerprint: string): void {
    setKnownFingerprint(this.config.host, this.config.port, fingerprint);
    this.approvedFingerprint = fingerprint;
  }

  connect(): void {
    this.disposed = false;
    this.fellBack = false;
    const connectConfig: ConnectConfig = {
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      readyTimeout: 20000,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
      hostVerifier: (key: Buffer) => {
        const fp = fingerprintSha256(key);
        const verdict = verifyFingerprint(this.config.host, this.config.port, fp);
        if (verdict === "mismatch") {
          this.config.onStatus("error", "Host key changed — connection refused");
          return false;
        }
        if (verdict === "ok") return true;
        if (fp === this.approvedFingerprint) return true;
        this.config.onHostKeyPrompt(fp);
        return false;
      },
    };

    applySshAuth(connectConfig, this.config.auth);

    const client = this.client;
    const isCurrent = () => client === this.client;

    client
      .on("ready", () => {
        if (!isCurrent()) return;
        this.config.onStatus("connecting", "Installing metrics agent…");
        void this.bootstrapAgent(isCurrent);
      })
      .on("error", (err) => {
        if (!isCurrent()) return;
        if (err.message.includes("Host verification failed")) {
          this.config.onStatus("connecting", "Waiting for host key approval");
          return;
        }
        this.config.onStatus("error", err.message);
      })
      .on("close", () => {
        if (!isCurrent()) return;
        this.stopAgentStream();
        this.clearRestartTimer();
        if (!this.disposed && !this.fellBack) {
          this.config.onStatus("disconnected");
        }
      })
      .connect(connectConfig);
  }

  private async bootstrapAgent(isCurrent: () => boolean): Promise<void> {
    try {
      const installed = await installAgent(this.client, {
        appPath: app.getAppPath(),
        resourcesPath: process.resourcesPath,
        packaged: app.isPackaged,
      });
      if (!isCurrent() || this.disposed) return;
      this.agentCommand = installed.command;
      this.startAgentStream(isCurrent);
    } catch (e) {
      if (!isCurrent() || this.disposed || this.fellBack) return;
      const msg = e instanceof Error ? e.message : "Agent install failed";
      this.triggerFallback(msg);
    }
  }

  private triggerFallback(reason: string): void {
    if (this.fellBack || this.disposed) return;
    this.fellBack = true;
    this.stopAgentStream();
    this.clearRestartTimer();
    this.config.onFallback(reason);
  }

  private startAgentStream(isCurrent: () => boolean): void {
    if (!this.agentCommand || this.disposed || !isCurrent()) return;
    this.stopAgentStream();
    this.lineBuf.reset();
    this.awaitingHello = true;
    const epoch = ++this.streamEpoch;

    this.client.exec(this.agentCommand, (err, stream) => {
      if (!isCurrent() || this.disposed || epoch !== this.streamEpoch) {
        stream?.close();
        return;
      }
      if (err) {
        this.handleStreamFailure(err.message, isCurrent, /*fromStart*/ true);
        return;
      }
      this.agentStream = stream;

      stream
        .on("data", (d: Buffer) => {
          if (!isCurrent() || this.disposed || epoch !== this.streamEpoch) return;
          this.onStdout(d.toString("utf8"), isCurrent);
        })
        .stderr.on("data", () => {
          /* ignore agent stderr */
        });

      stream.on("close", () => {
        if (!isCurrent() || epoch !== this.streamEpoch) return;
        if (this.agentStream === stream) this.agentStream = null;
        if (this.disposed || this.fellBack) return;
        this.handleStreamFailure("Agent stream closed", isCurrent, !this.agentReady);
      });

      stream.on("error", (streamErr: Error) => {
        if (!isCurrent() || this.disposed || this.fellBack || epoch !== this.streamEpoch) return;
        this.handleStreamFailure(streamErr.message, isCurrent, !this.agentReady);
      });
    });
  }

  private onStdout(chunk: string, isCurrent: () => boolean): void {
    for (const line of this.lineBuf.push(chunk)) {
      if (!isCurrent() || this.disposed) return;
      try {
        this.handleFrame(parseAgentFrame(line), isCurrent);
      } catch (e) {
        if (this.awaitingHello) {
          const msg = e instanceof Error ? e.message : "Invalid agent hello";
          this.handleStreamFailure(msg, isCurrent, true);
          return;
        }
        // Ignore bad lines after hello; keep the stream.
      }
    }
  }

  private handleFrame(frame: AgentFrame, isCurrent: () => boolean): void {
    if (this.awaitingHello) {
      try {
        assertHelloFrame(frame);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Invalid agent hello";
        this.handleStreamFailure(msg, isCurrent, true);
        return;
      }
      this.awaitingHello = false;
      this.agentReady = true;
      this.consecutiveFailures = 0;
      this.config.onStatus("connected");
      return;
    }

    if (frame.type === "metrics") {
      this.consecutiveFailures = 0;
      const { snapshot, slow } = metricsFrameToSnapshot(frame, this.slow);
      this.slow = slow;
      this.config.onMetrics(snapshot, Date.now());
      return;
    }

    if (frame.type === "kill_result") {
      this.resolveKill(frame);
      return;
    }

    // pong / warn: ignore for metrics path
  }

  private resolveKill(frame: KillResultFrame): void {
    const pending = this.pendingKills.get(frame.id);
    if (!pending) return;
    this.pendingKills.delete(frame.id);
    if (frame.ok) pending.resolve();
    else pending.reject(new Error(frame.error || "kill failed"));
  }

  private handleStreamFailure(
    message: string,
    isCurrent: () => boolean,
    fromStart: boolean,
  ): void {
    this.stopAgentStream();
    if (!isCurrent() || this.disposed || this.fellBack) return;

    if (fromStart && !this.agentReady) {
      this.triggerFallback(message);
      return;
    }

    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= FAILURES_BEFORE_ERROR) {
      this.config.onStatus("error", message);
    }

    this.clearRestartTimer();
    const delay = Math.min(
      MAX_BACKOFF_MS,
      INITIAL_BACKOFF_MS * 2 ** Math.max(0, this.consecutiveFailures - 1),
    );
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!isCurrent() || this.disposed || this.fellBack) return;
      this.startAgentStream(isCurrent);
    }, delay);
  }

  private stopAgentStream(): void {
    const stream = this.agentStream;
    this.agentStream = null;
    this.awaitingHello = false;
    // Invalidate in-flight stream handlers so an intentional close does not
    // look like an unexpected stream death.
    this.streamEpoch += 1;
    if (stream) {
      try {
        stream.close();
      } catch {
        /* ignore */
      }
    }
    for (const [, pending] of this.pendingKills) {
      pending.reject(new Error("Agent stream closed"));
    }
    this.pendingKills.clear();
  }

  private clearRestartTimer(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  killProcess(pid: number, signal: "TERM" | "KILL"): Promise<void> {
    const stream = this.agentStream;
    if (!stream || this.awaitingHello || !this.agentReady) {
      return Promise.reject(new Error("Agent is not ready"));
    }
    const id = randomUUID();
    const line = JSON.stringify({ cmd: "kill", pid, signal, id }) + "\n";
    return new Promise((resolve, reject) => {
      this.pendingKills.set(id, { resolve, reject });
      stream.write(line, (err) => {
        if (err) {
          this.pendingKills.delete(id);
          reject(err);
        }
      });
    });
  }

  openShell(
    cols: number,
    rows: number,
    onData: (data: string) => void,
    onClose: () => void,
  ): Promise<void> {
    this.closeShell();
    return new Promise((resolve, reject) => {
      this.client.shell({ term: "xterm-256color", cols, rows }, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        this.shell = stream;
        stream.on("data", (d: Buffer) => onData(d.toString("utf8")));
        stream.stderr.on("data", (d: Buffer) => onData(d.toString("utf8")));
        stream.on("close", () => {
          if (this.shell === stream) this.shell = null;
          onClose();
        });
        resolve();
      });
    });
  }

  writeShell(data: string): void {
    this.shell?.write(data);
  }

  resizeShell(cols: number, rows: number): void {
    this.shell?.setWindow(rows, cols, 0, 0);
  }

  closeShell(): void {
    const s = this.shell;
    this.shell = null;
    s?.close();
  }

  dispose(): void {
    this.disposed = true;
    this.clearRestartTimer();
    this.stopAgentStream();
    this.closeShell();
    this.client.end();
  }

  resetClient(): void {
    this.clearRestartTimer();
    this.stopAgentStream();
    this.shell = null;
    const old = this.client;
    this.client = new Client();
    old.removeAllListeners();
    old.on("error", () => {});
    old.end();
    this.agentCommand = null;
    this.agentReady = false;
    this.slow = emptySlowCache();
    this.lineBuf.reset();
    this.consecutiveFailures = 0;
    this.fellBack = false;
  }
}
