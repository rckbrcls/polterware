import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ dir: "", send: vi.fn(), dark: false }));
vi.mock("electron", () => ({
  app: { getPath: () => mock.dir },
  BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: mock.send } }] },
  nativeTheme: { get shouldUseDarkColors() { return mock.dark; } },
}));
import { getSettings, updateSettings } from "./settings.js";
import { readTheme, writeTheme } from "./theme.js";
import { listKnownHosts, removeKnownHost, setKnownFingerprint, verifyFingerprint } from "./known-hosts.js";
import { DEFAULT_SETTINGS } from "../shared/settings.js";
import { IPC_EVENTS } from "../shared/channels.js";

beforeEach(() => {
  mock.dir = mkdtempSync(join(tmpdir(), "vitals-settings-"));
  mock.send.mockClear();
});
afterEach(() => rmSync(mock.dir, { recursive: true, force: true }));

describe("settings store", () => {
  it("migrates legacy theme once and writes atomically to a single settings file", () => {
    writeFileSync(join(mock.dir, "theme.json"), '{"theme":"light"}');
    expect(getSettings().theme).toBe("light");
    writeFileSync(join(mock.dir, "theme.json"), '{"theme":"dark"}');
    expect(getSettings().theme).toBe("light");
    const updated = updateSettings({ networkUnit: "bits", historyWindowMinutes: 5 });
    expect(JSON.parse(readFileSync(join(mock.dir, "settings.json"), "utf8"))).toEqual(updated);
    expect(existsSync(join(mock.dir, "settings.json.tmp"))).toBe(false);
    expect(mock.send).toHaveBeenCalledWith(IPC_EVENTS.settings.changed, updated);
    expect(updated.theme).toBe("light");
  });
  it("recovers from corrupt settings without reviving stale legacy preferences", () => {
    writeFileSync(join(mock.dir, "settings.json"), "{invalid");
    writeFileSync(join(mock.dir, "theme.json"), '{"theme":"light"}');
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(updateSettings({ confirmBeforeKill: false }).confirmBeforeKill).toBe(false);
  });
  it("routes legacy theme API through settings and resolves system appearance", () => {
    expect(readTheme()).toBe("light");
    mock.dark = true;
    expect(readTheme()).toBe("dark");
    writeTheme("light");
    expect(getSettings().theme).toBe("light");
    expect(readTheme()).toBe("light");
    expect(existsSync(join(mock.dir, "theme.json"))).toBe(false);
  });
});

describe("known hosts", () => {
  it("lists keys and removes only the chosen trust entry", () => {
    setKnownFingerprint("::1", 22, "sha256:first");
    setKnownFingerprint("other", 2222, "sha256:second");
    expect(listKnownHosts()).toHaveLength(2);
    removeKnownHost("::1:22");
    expect(listKnownHosts()).toEqual([{ key: "other:2222", fingerprint: "sha256:second" }]);
    expect(verifyFingerprint("::1", 22, "sha256:first")).toBe("new");
  });
  it("handles malformed stores in the settings listing", () => {
    writeFileSync(join(mock.dir, "known_hosts.json"), "null");
    expect(listKnownHosts()).toEqual([]);
    writeFileSync(join(mock.dir, "known_hosts.json"), '{"bad":null,"good":{"fingerprint":"sha256:ok"}}');
    expect(listKnownHosts()).toEqual([{ key: "good", fingerprint: "sha256:ok" }]);
  });
});
