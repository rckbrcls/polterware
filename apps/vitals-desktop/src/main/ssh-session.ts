import { Client, type ClientChannel, type ConnectConfig } from "ssh2";
import { createHash } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { buildSnapshot, type DeltaState } from "../shared/parsers/build-snapshot.js";
import { SectionFrameBuffer } from "../shared/parsers/sections.js";
import type { MetricsSnapshot } from "../shared/metrics-types.js";
import { verifyFingerprint, setKnownFingerprint } from "./known-hosts.js";
import { buildRemoteMetricsCommand } from "./remote-script.js";
import { applySshAuth, type SshAuth } from "./ssh-auth.js";

const RESTART_DELAY_MS = 2000;

export type SessionAuth = SshAuth;

export interface SessionConfig {
  sessionId: string;
  host: string;
  port: number;
  username: string;
  auth: SessionAuth;
  onMetrics: (snapshot: MetricsSnapshot, collectedAt: number) => void;
  onStatus: (status: string, message?: string) => void;
  onHostKeyPrompt: (fingerprint: string) => void;
}

/** A pid reaches a remote shell command, so it must be a plain positive integer. */
export function assertPid(pid: unknown): number {
  if (typeof pid !== "number" || !Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error("Invalid pid");
  }
  return pid;
}

export function assertKillSignal(signal: unknown): "TERM" | "KILL" {
  if (signal !== "TERM" && signal !== "KILL") throw new Error("Invalid signal");
  return signal;
}

function fingerprintSha256(key: Buffer): string {
  return `SHA256:${createHash("sha256").update(key).digest("base64")}`;
}

// Script fallback: one exec runs a sampling loop on the host and streams a
// sample per second. The stream restarts after RESTART_DELAY_MS if it ends.
export class SshSession {
  private client = new Client();
  private stream: ClientChannel | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private frames = new SectionFrameBuffer();
  private delta: DeltaState | null = null;
  private disposed = false;
  private unsupported = false;
  private errored = false;
  private ready = false;
  private remoteCommand = buildRemoteMetricsCommand();
  private approvedFingerprint: string | null = null;

  constructor(private config: SessionConfig) {}

  approveHostKey(fingerprint: string): void {
    setKnownFingerprint(this.config.host, this.config.port, fingerprint);
    this.approvedFingerprint = fingerprint;
  }

  connect(): void {
    this.disposed = false;
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

    // Handlers are bound to this client instance: events from a client that
    // resetClient() already replaced must not drive the new connection.
    const client = this.client;
    const isCurrent = () => client === this.client;

    client
      .on("ready", () => {
        if (!isCurrent()) return;
        this.ready = true;
        this.config.onStatus("connected");
        this.startStream();
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
        this.ready = false;
        this.stopStream();
        if (!this.disposed) {
          this.config.onStatus("disconnected");
        }
      })
      .connect(connectConfig);
  }

  private startStream(): void {
    this.stopStream();
    if (this.disposed || this.unsupported) return;
    const client = this.client;
    const isCurrent = () => client === this.client && !this.disposed;
    client.exec(this.remoteCommand, (err, stream) => {
      if (!isCurrent()) {
        stream?.close();
        return;
      }
      if (err) {
        this.reportError(err.message);
        this.scheduleRestart();
        return;
      }
      this.stream = stream;
      this.frames.reset();
      const decoder = new StringDecoder("utf8");
      stream
        .on("data", (d: Buffer) => {
          if (!isCurrent() || this.stream !== stream) return;
          for (const frame of this.frames.push(decoder.write(d))) {
            this.handleFrame(frame);
            if (this.stream !== stream) return;
          }
        })
        .stderr.on("data", () => {
          /* ignore */
        });
      stream.on("close", () => {
        // stopStream() clears this.stream first, so an intentional close ends here.
        if (this.stream !== stream) return;
        this.stream = null;
        if (!isCurrent() || this.unsupported) return;
        this.reportError("Metrics script stopped");
        this.scheduleRestart();
      });
    });
  }

  private handleFrame(frame: string): void {
    const collectedAt = Date.now();
    const { snapshot, state, supported } = buildSnapshot(frame, this.delta, collectedAt);
    if (!supported) {
      this.unsupported = true;
      this.stopStream();
      this.config.onStatus("error", "Script fallback needs a Linux host with /proc");
      return;
    }
    this.delta = state;
    if (this.errored) {
      this.errored = false;
      this.config.onStatus("connected");
    }
    this.config.onMetrics(snapshot, collectedAt);
  }

  private reportError(message: string): void {
    this.errored = true;
    this.config.onStatus("error", message);
  }

  private scheduleRestart(): void {
    if (this.restartTimer || this.disposed || !this.ready) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.startStream();
    }, RESTART_DELAY_MS);
  }

  private stopStream(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const stream = this.stream;
    this.stream = null;
    if (stream) {
      try {
        stream.close();
      } catch {
        /* ignore */
      }
    }
  }

  killProcess(pid: number, signal: "TERM" | "KILL"): Promise<void> {
    const target = assertPid(pid);
    const cmd = assertKillSignal(signal) === "KILL" ? `kill -9 ${target}` : `kill ${target}`;
    return new Promise((resolve, reject) => {
      this.client.exec(cmd, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        stream.on("close", (code: number) => {
          if (code === 0) resolve();
          else reject(new Error(`kill exited with ${code}`));
        });
      });
    });
  }

  dispose(): void {
    this.disposed = true;
    this.stopStream();
    this.client.end();
  }

  resetClient(): void {
    this.stopStream();
    const old = this.client;
    this.client = new Client();
    old.removeAllListeners();
    old.on("error", () => {});
    old.end();
    this.delta = null;
    this.unsupported = false;
    this.errored = false;
    this.ready = false;
  }
}
