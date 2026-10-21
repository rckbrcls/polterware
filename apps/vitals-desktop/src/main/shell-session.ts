import { createHash } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { Client, type ClientChannel, type ConnectConfig } from "ssh2";
import { applySshAuth, type SshAuth } from "./ssh-auth.js";

// Shell SSH is a separate client from metrics collection. Assumptions:
// - The metrics session has already stored the host key; this client only accepts "ok".
// - A PTY merges stderr into the channel, so stderr is not read separately.
// - Keystrokes typed while the channel is down are dropped.
// - Reconnect backoff starts at 1s and doubles, capped at 30s.

export const SHELL_BATCH_INTERVAL_MS = 16;
export const SHELL_BATCH_MAX_BYTES = 64 * 1024;
export const SHELL_FLOW_HIGH_WATER_BYTES = 256 * 1024;
export const SHELL_FLOW_LOW_WATER_BYTES = 64 * 1024;
export const SHELL_MAX_WRITE_BYTES = 1024 * 1024;
export const SHELL_MAX_ACK_BYTES = 8 * 1024 * 1024;
export const SHELL_MIN_DIMENSION = 1;
export const SHELL_MAX_DIMENSION = 500;

const KEEPALIVE_MS = 10_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const SHELL_EXIT_GRACE_MS = 50;
const MAX_SESSION_ID_LENGTH = 128;

export class ShellInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShellInputError";
  }
}

export type ShellAuth = SshAuth;

export interface ShellSessionOptions {
  host: string;
  port: number;
  username: string;
  auth: ShellAuth;
  onData: (data: string) => void;
  onExit: () => void;
}

export function assertSessionId(sessionId: unknown): string {
  if (typeof sessionId !== "string" || sessionId.length === 0 || sessionId.length > MAX_SESSION_ID_LENGTH) {
    throw new ShellInputError("sessionId must be a non-empty string");
  }
  if (sessionId.includes("\0")) throw new ShellInputError("sessionId is invalid");
  return sessionId;
}

export function assertDimensions(cols: unknown, rows: unknown): { cols: number; rows: number } {
  if (!isDimension(cols) || !isDimension(rows)) {
    throw new ShellInputError("cols and rows must be integers between 1 and 500");
  }
  return { cols, rows };
}

function isDimension(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= SHELL_MIN_DIMENSION &&
    value <= SHELL_MAX_DIMENSION
  );
}

export function assertShellData(data: unknown): string {
  if (typeof data !== "string") throw new ShellInputError("data must be a string");
  if (Buffer.byteLength(data) > SHELL_MAX_WRITE_BYTES) {
    throw new ShellInputError("data exceeds 1 MB");
  }
  return data;
}

export function assertAckBytes(bytes: unknown): number {
  if (
    typeof bytes !== "number" ||
    !Number.isInteger(bytes) ||
    bytes < 0 ||
    bytes > SHELL_MAX_ACK_BYTES
  ) {
    throw new ShellInputError("ack bytes must be an integer between 0 and 8388608");
  }
  return bytes;
}

function asRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") throw new ShellInputError("Expected an object payload");
  return payload as Record<string, unknown>;
}

export function parseShellOpen(payload: unknown): { sessionId: string; cols: number; rows: number } {
  const record = asRecord(payload);
  const dims = assertDimensions(record.cols, record.rows);
  return { sessionId: assertSessionId(record.sessionId), ...dims };
}

export function parseShellWrite(payload: unknown): { sessionId: string; data: string } {
  const record = asRecord(payload);
  return { sessionId: assertSessionId(record.sessionId), data: assertShellData(record.data) };
}

export function parseShellResize(payload: unknown): { sessionId: string; cols: number; rows: number } {
  return parseShellOpen(payload);
}

export function parseShellAck(payload: unknown): { sessionId: string; bytes: number } {
  const record = asRecord(payload);
  return { sessionId: assertSessionId(record.sessionId), bytes: assertAckBytes(record.bytes) };
}

export class Utf8ChunkDecoder {
  private decoder = new StringDecoder("utf8");

  write(chunk: Buffer): string {
    return this.decoder.write(chunk);
  }

  end(): string {
    return this.decoder.end();
  }
}

export function takeUtf8Bytes(value: string, maxBytes: number): { head: string; rest: string } {
  if (maxBytes <= 0) return { head: "", rest: value };
  if (Buffer.byteLength(value) <= maxBytes) return { head: value, rest: "" };
  let bytes = 0;
  let index = 0;
  while (index < value.length) {
    const code = value.codePointAt(index);
    if (code === undefined) break;
    const width = code > 0xffff ? 2 : 1;
    const charBytes = utf8Length(code);
    if (bytes + charBytes > maxBytes) break;
    bytes += charBytes;
    index += width;
  }
  return { head: value.slice(0, index), rest: value.slice(index) };
}

function utf8Length(code: number): number {
  if (code <= 0x7f) return 1;
  if (code <= 0x7ff) return 2;
  if (code <= 0xffff) return 3;
  return 4;
}

export class ShellOutputBatcher {
  private pending = "";
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly onFlush: (data: string) => void,
    private readonly intervalMs = SHELL_BATCH_INTERVAL_MS,
    private readonly maxBytes = SHELL_BATCH_MAX_BYTES,
  ) {}

  push(chunk: string): void {
    if (!chunk) return;
    this.pending += chunk;
    this.drain(false);
    if (this.pending && !this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.drain(true);
      }, this.intervalMs);
    }
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.drain(true);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = "";
  }

  private drain(all: boolean): void {
    while (this.pending && Buffer.byteLength(this.pending) >= this.maxBytes) {
      const parts = takeUtf8Bytes(this.pending, this.maxBytes);
      if (!parts.head) break;
      this.pending = parts.rest;
      this.onFlush(parts.head);
    }
    if (all && this.pending) {
      const data = this.pending;
      this.pending = "";
      this.onFlush(data);
    }
  }
}

export class ShellFlowControl {
  private outstanding = 0;
  private paused = false;

  constructor(
    private readonly opts: {
      highWaterBytes: number;
      lowWaterBytes: number;
      pause: () => void;
      resume: () => void;
    },
  ) {}

  pendingBytes(): number {
    return this.outstanding;
  }

  isPaused(): boolean {
    return this.paused;
  }

  sent(bytes: number): void {
    if (bytes <= 0) return;
    this.outstanding += bytes;
    this.sync();
  }

  ack(bytes: number): void {
    if (bytes <= 0) return;
    this.outstanding = Math.max(0, this.outstanding - bytes);
    this.sync();
  }

  reset(): void {
    this.outstanding = 0;
    this.paused = false;
  }

  private sync(): void {
    if (!this.paused && this.outstanding >= this.opts.highWaterBytes) {
      this.paused = true;
      this.opts.pause();
    } else if (this.paused && this.outstanding <= this.opts.lowWaterBytes) {
      this.paused = false;
      this.opts.resume();
    }
  }
}

function fingerprintSha256(key: Buffer): string {
  return `SHA256:${createHash("sha256").update(key).digest("base64")}`;
}

export class ShellSession {
  private client: Client | null = null;
  private stream: ClientChannel | null = null;
  private decoder = new Utf8ChunkDecoder();
  private cols = 80;
  private rows = 24;
  private wantOpen = false;
  private localClose = false;
  private disposed = false;
  private giveUp = false;
  private connected = false;
  private shellWasOpen = false;
  private attempt = 0;
  private inflight: Promise<void> | null = null;
  private settleReject: ((err: Error) => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private exitTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly batcher: ShellOutputBatcher;
  private readonly flow: ShellFlowControl;

  constructor(private readonly options: ShellSessionOptions) {
    this.flow = new ShellFlowControl({
      highWaterBytes: SHELL_FLOW_HIGH_WATER_BYTES,
      lowWaterBytes: SHELL_FLOW_LOW_WATER_BYTES,
      pause: () => this.stream?.pause(),
      resume: () => this.stream?.resume(),
    });
    this.batcher = new ShellOutputBatcher((data) => {
      this.flow.sent(Buffer.byteLength(data));
      this.options.onData(data);
    });
  }

  async open(cols: number, rows: number): Promise<void> {
    const dims = assertDimensions(cols, rows);
    this.cols = dims.cols;
    this.rows = dims.rows;
    this.localClose = false;
    this.giveUp = false;
    this.disposed = false;
    this.wantOpen = true;
    this.clearReconnect();
    if (this.inflight) {
      await this.inflight;
      return;
    }
    if (this.connected && this.client) {
      await this.openPty(false);
      return;
    }
    await this.ensureClient(false);
  }

  write(data: string): void {
    const text = assertShellData(data);
    this.stream?.write(text);
  }

  resize(cols: number, rows: number): void {
    const dims = assertDimensions(cols, rows);
    this.cols = dims.cols;
    this.rows = dims.rows;
    this.stream?.setWindow(dims.rows, dims.cols, 0, 0);
  }

  ack(bytes: number): void {
    this.flow.ack(assertAckBytes(bytes));
  }

  close(): void {
    this.localClose = true;
    this.wantOpen = false;
    this.shellWasOpen = false;
    this.clearReconnect();
    if (this.exitTimer) {
      clearTimeout(this.exitTimer);
      this.exitTimer = null;
    }
    this.batcher.dispose();
    this.flow.reset();
    this.dropStream();
    this.rejectInflight(new Error("SSH shell closed"));
    this.endClient();
  }

  dispose(): void {
    this.disposed = true;
    this.close();
  }

  private ensureClient(notice: boolean): Promise<void> {
    if (this.inflight) return this.inflight;
    if (this.connected && this.client) return this.openPty(notice);
    this.inflight = this.beginConnect(notice).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async beginConnect(notice: boolean): Promise<void> {
    const { verifyFingerprint } = await import("./known-hosts.js");
    if (this.disposed || this.localClose || !this.wantOpen) {
      throw new Error("SSH shell closed");
    }
    this.endClient();
    const client = new Client();
    this.client = client;
    const isCurrent = () => this.client === client;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        this.settleReject = null;
        if (err) reject(err);
        else resolve();
      };
      this.settleReject = (err) => finish(err);

      client
        .on("ready", () => {
          if (!isCurrent()) return;
          this.connected = true;
          this.attempt = 0;
          void this.openPty(notice).then(
            () => finish(),
            (err: unknown) => {
              const error = err instanceof Error ? err : new Error(String(err));
              finish(error);
              if (isCurrent() && this.wantOpen && !this.localClose && !this.disposed && !this.giveUp) {
                this.scheduleReconnect();
              }
            },
          );
        })
        .on("error", (err: Error) => {
          if (!isCurrent()) return;
          this.connected = false;
          if (err.message.toLowerCase().includes("host verification failed")) {
            this.giveUp = true;
            this.wantOpen = false;
            this.batcher.push("\r\n[Host verification failed]\r\n");
            this.batcher.flush();
            this.options.onExit();
          }
          finish(err);
          if (!this.disposed && !this.localClose && this.wantOpen && !this.giveUp) {
            this.scheduleReconnect();
          }
        })
        .on("close", () => {
          if (!isCurrent()) return;
          this.connected = false;
          if (this.exitTimer) {
            clearTimeout(this.exitTimer);
            this.exitTimer = null;
          }
          finish(new Error("SSH shell connection closed"));
          if (!this.disposed && !this.localClose && this.wantOpen && !this.giveUp) {
            this.scheduleReconnect();
          }
        });

      try {
        client.connect(this.connectConfig(verifyFingerprint));
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.giveUp = true;
        this.wantOpen = false;
        finish(error);
      }
    });
  }

  private connectConfig(
    verifyFingerprint: (host: string, port: number, fingerprint: string) => "new" | "ok" | "mismatch",
  ): ConnectConfig {
    const config: ConnectConfig = {
      host: this.options.host,
      port: this.options.port,
      username: this.options.username,
      readyTimeout: 20_000,
      keepaliveInterval: KEEPALIVE_MS,
      keepaliveCountMax: 3,
      hostVerifier: (key: Buffer) => {
        const fingerprint = fingerprintSha256(key);
        return verifyFingerprint(this.options.host, this.options.port, fingerprint) === "ok";
      },
    };
    return applySshAuth(config, this.options.auth);
  }

  private openPty(notice: boolean): Promise<void> {
    const client = this.client;
    if (!client || !this.connected) return Promise.reject(new Error("SSH shell is not connected"));
    this.dropStream();
    return new Promise((resolve, reject) => {
      client.shell({ term: "xterm-256color", cols: this.cols, rows: this.rows }, (err, stream) => {
        if (this.client !== client) {
          stream?.close();
          reject(new Error("SSH shell client replaced"));
          return;
        }
        if (err || !stream) {
          reject(err ?? new Error("SSH shell failed"));
          return;
        }
        this.bindStream(stream, client);
        if (this.flow.isPaused()) stream.pause();
        if (notice) {
          this.batcher.push("\r\n[reconnected]\r\n");
          this.batcher.flush();
        }
        resolve();
      });
    });
  }

  private bindStream(stream: ClientChannel, client: Client): void {
    this.stream = stream;
    this.shellWasOpen = true;
    this.decoder = new Utf8ChunkDecoder();
    stream.on("data", (chunk: Buffer | string) => {
      if (this.stream !== stream) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const text = this.decoder.write(buffer);
      if (text) this.batcher.push(text);
    });
    stream.on("error", () => {
      /* close follows */
    });
    stream.on("close", () => {
      if (this.stream !== stream) return;
      this.stream = null;
      const tail = this.decoder.end();
      if (tail) this.batcher.push(tail);
      this.batcher.flush();
      this.armShellExit(client);
    });
  }

  private armShellExit(client: Client): void {
    if (this.exitTimer) clearTimeout(this.exitTimer);
    this.exitTimer = setTimeout(() => {
      this.exitTimer = null;
      if (this.disposed || this.localClose || !this.wantOpen) return;
      if (this.client !== client || !this.connected) return;
      this.wantOpen = false;
      this.options.onExit();
    }, SHELL_EXIT_GRACE_MS);
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.localClose || !this.wantOpen || this.giveUp || this.reconnectTimer) return;
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.attempt);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.disposed || this.localClose || !this.wantOpen || this.giveUp) return;
      void this.ensureClient(this.shellWasOpen).catch(() => {
        /* the client close handler schedules the next attempt */
      });
    }, delay);
  }

  private clearReconnect(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private rejectInflight(err: Error): void {
    const reject = this.settleReject;
    this.settleReject = null;
    reject?.(err);
  }

  private dropStream(): void {
    const stream = this.stream;
    this.stream = null;
    if (!stream) return;
    stream.removeAllListeners();
    stream.on("error", () => {});
    stream.close();
  }

  private endClient(): void {
    const old = this.client;
    this.client = null;
    this.connected = false;
    if (!old) return;
    old.removeAllListeners();
    old.on("error", () => {});
    old.end();
  }
}
