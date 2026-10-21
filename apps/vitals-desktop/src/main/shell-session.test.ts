// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/vitals-shell-test" },
  safeStorage: { isEncryptionAvailable: () => false },
}));

import { IPC_CHANNELS } from "../shared/channels.js";
import { createVitalsIpcHandlers } from "./ipc.js";
import { SessionManager } from "./session-manager.js";
import {
  ShellInputError,
  SHELL_BATCH_MAX_BYTES,
  SHELL_FLOW_HIGH_WATER_BYTES,
  SHELL_FLOW_LOW_WATER_BYTES,
  SHELL_MAX_WRITE_BYTES,
  ShellFlowControl,
  ShellOutputBatcher,
  Utf8ChunkDecoder,
  assertDimensions,
  assertShellData,
  parseShellAck,
  parseShellOpen,
  parseShellWrite,
} from "./shell-session.js";

describe("UTF-8 chunk decoder", () => {
  it("keeps a multibyte character split across chunks", () => {
    const decoder = new Utf8ChunkDecoder();
    const bytes = Buffer.from("é👍", "utf8");
    expect(bytes.length).toBe(6);
    expect(decoder.write(bytes.subarray(0, 1))).toBe("");
    expect(decoder.write(bytes.subarray(1, 3))).toBe("é");
    expect(decoder.write(bytes.subarray(3, 5))).toBe("");
    expect(decoder.write(bytes.subarray(5))).toBe("👍");
    expect(decoder.end()).toBe("");
  });

  it("flushes an incomplete sequence as a replacement on end", () => {
    const decoder = new Utf8ChunkDecoder();
    expect(decoder.write(Buffer.from([0xc3]))).toBe("");
    expect(decoder.end()).toBe("\uFFFD");
  });
});

describe("shell output batcher", () => {
  it("flushes short output on the batch interval", () => {
    vi.useFakeTimers();
    const flushed: string[] = [];
    const batcher = new ShellOutputBatcher((data) => flushed.push(data));
    batcher.push("hello");
    batcher.push(" there");
    expect(flushed).toEqual([]);
    vi.advanceTimersByTime(16);
    expect(flushed).toEqual(["hello there"]);
    batcher.dispose();
    vi.useRealTimers();
  });

  it("caps each flush at 64 KB and does not split a code point", () => {
    const flushed: string[] = [];
    const batcher = new ShellOutputBatcher((data) => flushed.push(data), 16, SHELL_BATCH_MAX_BYTES);
    const prefix = "a".repeat(SHELL_BATCH_MAX_BYTES - 2);
    batcher.push(`${prefix}€`);
    expect(Buffer.byteLength(flushed[0]!)).toBe(SHELL_BATCH_MAX_BYTES - 2);
    expect(flushed[0]).toBe(prefix);
    batcher.flush();
    expect(flushed[1]).toBe("€");
    expect(Buffer.byteLength(flushed[0]!) + Buffer.byteLength(flushed[1]!)).toBe(SHELL_BATCH_MAX_BYTES + 1);
  });
});

describe("shell flow control", () => {
  it("pauses at the high watermark and resumes at the low watermark", () => {
    const pause = vi.fn();
    const resume = vi.fn();
    const flow = new ShellFlowControl({
      highWaterBytes: SHELL_FLOW_HIGH_WATER_BYTES,
      lowWaterBytes: SHELL_FLOW_LOW_WATER_BYTES,
      pause,
      resume,
    });
    const batcher = new ShellOutputBatcher((data) => flow.sent(Buffer.byteLength(data)), 16, SHELL_BATCH_MAX_BYTES);
    batcher.push("a".repeat(SHELL_FLOW_HIGH_WATER_BYTES));
    expect(pause).toHaveBeenCalledOnce();
    expect(flow.isPaused()).toBe(true);
    expect(flow.pendingBytes()).toBe(SHELL_FLOW_HIGH_WATER_BYTES);

    flow.ack(SHELL_FLOW_HIGH_WATER_BYTES - SHELL_FLOW_LOW_WATER_BYTES - 1);
    expect(resume).not.toHaveBeenCalled();
    expect(flow.isPaused()).toBe(true);

    flow.ack(1);
    expect(resume).toHaveBeenCalledOnce();
    expect(flow.isPaused()).toBe(false);
    expect(flow.pendingBytes()).toBe(SHELL_FLOW_LOW_WATER_BYTES);

    flow.ack(SHELL_FLOW_LOW_WATER_BYTES + 10);
    expect(flow.pendingBytes()).toBe(0);
  });
});

describe("shell input validation", () => {
  it("accepts in-range dimensions and rejects everything else", () => {
    expect(assertDimensions(80, 24)).toEqual({ cols: 80, rows: 24 });
    expect(parseShellOpen({ sessionId: "s", cols: 1, rows: 500 })).toEqual({
      sessionId: "s",
      cols: 1,
      rows: 500,
    });
    for (const cols of [0, 501, 1.5, Number.NaN, "80"]) {
      expect(() => assertDimensions(cols, 24)).toThrow(ShellInputError);
    }
    expect(() => parseShellOpen({ sessionId: "", cols: 80, rows: 24 })).toThrow(ShellInputError);
    expect(() => parseShellOpen(null)).toThrow(ShellInputError);
  });

  it("rejects writes over 1 MB and non-strings", () => {
    expect(assertShellData("ok")).toBe("ok");
    expect(() => assertShellData(1)).toThrow(ShellInputError);
    expect(() => parseShellWrite({ sessionId: "s", data: "x".repeat(SHELL_MAX_WRITE_BYTES + 1) })).toThrow(
      /1 MB/,
    );
    expect(parseShellAck({ sessionId: "s", bytes: 0 })).toEqual({ sessionId: "s", bytes: 0 });
    expect(() => parseShellAck({ sessionId: "s", bytes: -1 })).toThrow(ShellInputError);
    expect(() => parseShellAck({ sessionId: "s", bytes: 1.2 })).toThrow(ShellInputError);
  });

  it("rejects invalid IPC payloads before the session service runs", () => {
    const sessions = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      listServers: vi.fn(),
      deleteServer: vi.fn(),
      acceptHostKey: vi.fn(),
      rejectHostKey: vi.fn(),
      killProcess: vi.fn(),
      shellOpen: vi.fn(),
      shellWrite: vi.fn(),
      shellResize: vi.fn(),
      shellClose: vi.fn(),
      shellAck: vi.fn(),
    };
    const handlers = createVitalsIpcHandlers({ sessions });
    const event = {} as never;
    expect(() => handlers[IPC_CHANNELS.shell.open]!(event, { sessionId: "s", cols: 0, rows: 24 })).toThrow(
      ShellInputError,
    );
    expect(() => handlers[IPC_CHANNELS.shell.write]!(event, { sessionId: "s", data: 12 })).toThrow(ShellInputError);
    expect(() => handlers[IPC_CHANNELS.shell.resize]!(event, { sessionId: "s", cols: 80, rows: 501 })).toThrow(
      ShellInputError,
    );
    expect(() => handlers[IPC_CHANNELS.shell.close]!(event, "")).toThrow(ShellInputError);
    expect(() => handlers[IPC_CHANNELS.shell.ack]!(event, { sessionId: "s", bytes: -5 })).toThrow(ShellInputError);
    expect(sessions.shellOpen).not.toHaveBeenCalled();
    expect(sessions.shellWrite).not.toHaveBeenCalled();
    expect(sessions.shellResize).not.toHaveBeenCalled();
    expect(sessions.shellClose).not.toHaveBeenCalled();
    expect(sessions.shellAck).not.toHaveBeenCalled();

    handlers[IPC_CHANNELS.shell.write]!(event, { sessionId: "s", data: "ls\n" });
    expect(sessions.shellWrite).toHaveBeenCalledWith("s", "ls\n");
  });

  it("rejects a shell call when the session does not exist", async () => {
    const manager = new SessionManager();
    expect(() => manager.shellWrite("missing", "ls\n")).toThrow(ShellInputError);
    expect(() => manager.shellResize("missing", 80, 24)).toThrow(/Session not found/);
    expect(() => manager.shellAck("missing", 4)).toThrow(ShellInputError);
    expect(() => manager.shellClose("missing")).toThrow(ShellInputError);
    await expect(manager.shellOpen("missing", 80, 24)).rejects.toThrow(/Session not found/);
  });
});
