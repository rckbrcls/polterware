// @vitest-environment node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS, IPC_EVENTS } from "../shared/ipc.js";
import { createPolterwareIpcHandlers, registerPolterwareIpcHandlers } from "./ipc.js";

const desktopSrc = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

function leaves(tree: Record<string, Record<string, string>>): string[] {
  return Object.values(tree).flatMap((group) => Object.values(group));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    // Test helpers (a package's test/ folder) are not part of the shipped renderer.
    if (["node_modules", "gen", "dist", "test"].includes(entry)) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

describe("IPC channel parity", () => {
  const channels = leaves(IPC_CHANNELS);

  it("gives every declared channel a handler in the main process", () => {
    const handlers = createPolterwareIpcHandlers() as Record<string, unknown>;
    const missing = channels.filter((channel) => typeof handlers[channel] !== "function");
    expect(missing).toEqual([]);
  });

  it("has no handler for a channel that is not declared", () => {
    const handlers = Object.keys(createPolterwareIpcHandlers());
    expect(handlers.filter((channel) => !channels.includes(channel))).toEqual([]);
  });

  it("registers every handler on ipcMain exactly once", () => {
    const handle = vi.fn();
    registerPolterwareIpcHandlers({}, { handle });
    const registered = handle.mock.calls.map(([channel]) => channel as string);
    expect(new Set(registered).size).toBe(registered.length);
    expect([...registered].sort()).toEqual([...channels].sort());
  });

  it("uses unique <group>:<kebab-case> names for channels and events", () => {
    const names = [...channels, ...leaves(IPC_EVENTS)];
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name, name).toMatch(/^[a-z]+:[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("rejects a channel whose controller is not wired instead of returning undefined", async () => {
    const handlers = createPolterwareIpcHandlers() as Record<string, (event: unknown, payload?: unknown) => Promise<unknown>>;
    await expect(handlers[IPC_CHANNELS.core.listProjects]!({}, undefined)).rejects.toThrow();
    await expect(handlers[IPC_CHANNELS.app.getInfo]!({}, undefined)).rejects.toThrow();
  });

  it("only lets the preload bridge use declared channels and events", () => {
    const bridge = readFileSync(join(desktopSrc, "preload/bridge.ts"), "utf8");
    for (const [, group, key] of bridge.matchAll(/IPC_CHANNELS\.(\w+)\.(\w+)/g)) {
      const tree = IPC_CHANNELS as unknown as Record<string, Record<string, string>>;
      expect(tree[group!]?.[key!], `IPC_CHANNELS.${group}.${key}`).toBeTypeOf("string");
    }
    for (const [, group, key] of bridge.matchAll(/IPC_EVENTS\.(\w+)\.(\w+)/g)) {
      const tree = IPC_EVENTS as unknown as Record<string, Record<string, string>>;
      expect(tree[group!]?.[key!], `IPC_EVENTS.${group}.${key}`).toBeTypeOf("string");
    }
    // Raw channel strings in the bridge would bypass the shared allowlist.
    expect(bridge).not.toMatch(/invoke\(\s*["'`]/);
  });
});

describe("renderer isolation", () => {
  const forbidden = /from\s+["'](?:electron|node:[^"']+|fs|path|child_process|os)["']|require\(\s*["'](?:electron|node:)/;

  it("keeps Electron and Node imports out of the renderer", () => {
    const offenders = sourceFiles(join(desktopSrc, "renderer")).filter((file) => forbidden.test(readFileSync(file, "utf8")));
    expect(offenders.map((file) => file.replace(repoRoot, ""))).toEqual([]);
  });

  it("keeps Electron and Node imports out of the shared UI packages", () => {
    const roots = ["packages/frontend", "packages/features"].map((dir) => join(repoRoot, dir));
    const offenders = roots.flatMap((root) => sourceFiles(root)).filter((file) => forbidden.test(readFileSync(file, "utf8")));
    expect(offenders.map((file) => file.replace(repoRoot, ""))).toEqual([]);
  });
});
