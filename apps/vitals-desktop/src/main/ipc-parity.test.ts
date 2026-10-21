// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS, IPC_EVENTS } from "../shared/channels.js";
import { createVitalsIpcHandlers, registerVitalsIpcHandlers } from "./ipc.js";

const vitalsSrc = fileURLToPath(new URL("../", import.meta.url));

function leaves(tree: Record<string, Record<string, string>>): string[] {
  return Object.values(tree).flatMap((group) => Object.values(group));
}

describe("IPC channel parity", () => {
  const channels = leaves(IPC_CHANNELS);

  it("gives every declared channel a handler in the main process", () => {
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
    const handlers = createVitalsIpcHandlers({ sessions }) as Record<string, unknown>;
    const missing = channels.filter((channel) => typeof handlers[channel] !== "function");
    expect(missing).toEqual([]);
  });

  it("has no handler for a channel that is not declared", () => {
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
    const handlers = Object.keys(createVitalsIpcHandlers({ sessions }));
    expect(handlers.filter((channel) => !channels.includes(channel))).toEqual([]);
  });

  it("registers every handler on ipcMain exactly once", () => {
    const handle = vi.fn();
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
    registerVitalsIpcHandlers({ sessions }, { handle });
    const registered = handle.mock.calls.map(([channel]) => channel as string);
    expect(new Set(registered).size).toBe(registered.length);
    expect([...registered].sort()).toEqual([...channels].sort());
  });

  it("uses unique vitals names for channels and events", () => {
    const names = [...channels, ...leaves(IPC_EVENTS)];
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name, name).toMatch(/^vitals:[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("only lets the preload bridge use declared channels and events", () => {
    const bridge = readFileSync(join(vitalsSrc, "preload/index.ts"), "utf8");
    for (const [, group, key] of bridge.matchAll(/IPC_CHANNELS\.(\w+)\.(\w+)/g)) {
      const tree = IPC_CHANNELS as unknown as Record<string, Record<string, string>>;
      expect(tree[group!]?.[key!], `IPC_CHANNELS.${group}.${key}`).toBeTypeOf("string");
    }
    for (const [, group, key] of bridge.matchAll(/IPC_EVENTS\.(\w+)\.(\w+)/g)) {
      const tree = IPC_EVENTS as unknown as Record<string, Record<string, string>>;
      expect(tree[group!]?.[key!], `IPC_EVENTS.${group}.${key}`).toBeTypeOf("string");
    }
    expect(bridge).not.toMatch(/invoke\(\s*["'`]vitals:/);
    expect(bridge).not.toMatch(/\.on\(\s*["'`]vitals:/);
  });
});
