import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createAppLog, ensureAppLogFile } from "./app-log.js";

describe("Main app log", () => {
  it("writes only allowlisted supervisor fields and never tokens or file content", () => {
    const directory = mkdtempSync(join(tmpdir(), "notes-app-log-"));
    try {
      const log = createAppLog(directory);
      log.write("core.ready", {
        changed: true,
        token: "secret-token",
        body: "SELECT * FROM notes",
        path: "/Users/erick/Library/Application Support/Polterware Notes/notes.db",
      });
      const output = readFileSync(log.path, "utf8");
      expect(output).not.toMatch(/secret-token|SELECT|notes\.db|\/Users\//);
      expect(JSON.parse(output)).toMatchObject({ event: "core.ready", changed: true });
      expect(statSync(log.path).mode & 0o777).toBe(0o600);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("rotates when the log exceeds the size cap", () => {
    const directory = mkdtempSync(join(tmpdir(), "notes-app-log-rot-"));
    try {
      const log = createAppLog(directory);
      writeFileSync(log.path, "x".repeat(300 * 1024), { mode: 0o600 });
      log.write("core.offline", { code: "unavailable" });
      expect(readFileSync(`${log.path}.1`, "utf8").length).toBeGreaterThan(1000);
      expect(readFileSync(log.path, "utf8")).toContain("core.offline");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("creates an empty log file so Finder can reveal it", () => {
    const directory = mkdtempSync(join(tmpdir(), "notes-app-log-reveal-"));
    try {
      const log = createAppLog(directory);
      rmSync(log.path, { force: true });
      expect(ensureAppLogFile(log)).toBe(log.path);
      expect(statSync(log.path).isFile()).toBe(true);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
