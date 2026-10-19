import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildId, isNewerBuild, nextCorePollDelay, readCoreState, resolveBinary } from "./process-supervisor.js";
describe("supervisor runstate", () => {
  it("validates database identity, token, permissions and loopback endpoint", () => {
    const temp = mkdtempSync(join(tmpdir(), "notes-state-"));
    try {
      mkdirSync(join(temp, "run")); const db = join(temp, "notes.db"), state = join(temp, "run/core.json"); writeFileSync(db, "");
      const base = { pid: process.pid, dbPath: db, token: "test", endpoint: "http://127.0.0.1:12345" };
      const put = (value: unknown) => { writeFileSync(state, JSON.stringify(value)); chmodSync(state, 0o600); };
      put(base); expect(readCoreState(db)).toMatchObject({ token: "test", pid: process.pid });
      chmodSync(state, 0o644); expect(readCoreState(db)).toBeUndefined();
      for (const patch of [{ token: "" }, { pid: -1 }, { endpoint: "http://example.com:12345" }, { dbPath: "/other.db" }]) {
        put({ ...base, ...patch }); expect(readCoreState(db)).toBeUndefined();
      }
      expect(buildId(db)).toMatch(/^\d+-0$/);
      expect(isNewerBuild("200-5", "100-10")).toBe(true);
      expect(isNewerBuild("100-10", "200-5")).toBe(false);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });
  it("prefers an absolute PWNOTES_CORE_BIN over the bundled path", () => {
    const temp = mkdtempSync(join(tmpdir(), "notes-bin-"));
    const previous = process.env.PWNOTES_CORE_BIN;
    try {
      const binary = join(temp, "pwnotes");
      writeFileSync(binary, "");
      process.env.PWNOTES_CORE_BIN = binary;
      expect(resolveBinary("/app", "/resources", false)).toBe(binary);
      expect(resolveBinary("/app", "/resources", true)).toBe(binary);
      process.env.PWNOTES_CORE_BIN = "relative/pwnotes";
      expect(() => resolveBinary("/app", "/resources", false)).toThrow(/absolute/);
    } finally {
      if (previous === undefined) delete process.env.PWNOTES_CORE_BIN;
      else process.env.PWNOTES_CORE_BIN = previous;
      rmSync(temp, { recursive: true, force: true });
    }
  });
  it("spawns the frozen CLI argv and health-checks build plus dbPath", () => {
    const source = readFileSync(new URL("./process-supervisor.ts", import.meta.url), "utf8");
    expect(source).toContain('["-db", dbPath, "serve", "--listen", "127.0.0.1:0"]');
    expect(source).toContain("run/core.json");
    expect(source).toContain("health.build");
    expect(source).toContain("health.dbPath");
    expect(source).toContain("PWNOTES_CORE_BIN");
    expect(source).toContain("nextCorePollDelay");
    expect(source).toContain("CORE_READY_TIMEOUT_MS");
    const previous = process.env.PWNOTES_CORE_BIN;
    delete process.env.PWNOTES_CORE_BIN;
    try {
      expect(() => resolveBinary("/missing-app", "/missing-resources", false)).toThrow(/build:notes-core/);
      expect(() => resolveBinary("/missing-app", "/missing-resources", true)).toThrow(/build:notes-core/);
    } finally {
      if (previous === undefined) delete process.env.PWNOTES_CORE_BIN;
      else process.env.PWNOTES_CORE_BIN = previous;
    }
  });
});

describe("spawned core poll timing", () => {
  it("uses 25-50 ms backoff for a new child and keeps 200 ms for an existing daemon", () => {
    expect(nextCorePollDelay({ spawnedChild: false, spawnedAttempt: 0 })).toBe(200);
    expect(nextCorePollDelay({ spawnedChild: false, spawnedAttempt: 8 })).toBe(200);
    expect(nextCorePollDelay({ spawnedChild: true, spawnedAttempt: 0 })).toBe(25);
    expect(nextCorePollDelay({ spawnedChild: true, spawnedAttempt: 1 })).toBe(50);
    expect(nextCorePollDelay({ spawnedChild: true, spawnedAttempt: 9 })).toBe(50);
  });
});
