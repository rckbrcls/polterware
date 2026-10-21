import { afterEach, describe, expect, it, vi } from "vitest";
import { createSettingsBridge, type SettingsWireBridge } from "./bridge";
import { createSettingsStore, type SettingsStore } from "./store";
import { fakeSettingsBridge } from "./fake-bridge";

const stores: SettingsStore[] = [];
function setup(seed?: Parameters<typeof fakeSettingsBridge>[0]) {
  const fake = fakeSettingsBridge(seed);
  const store = createSettingsStore(() => createSettingsBridge(fake.bridge as unknown as SettingsWireBridge));
  stores.push(store);
  return { ...fake, store };
}
afterEach(() => { stores.splice(0).forEach(store => store.dispose()); });

describe("settings store", () => {
  it("round-trips each change through SettingsService.Set with one key", async () => {
    const { store, bridge } = setup();
    await store.refresh();
    await store.set("app.keepRunningInBackground", false);
    expect(bridge.settings.set).toHaveBeenCalledWith({ keys: ["app.keepRunningInBackground"], settings: { appKeepRunningInBackground: false } });
    expect(store.settings().appKeepRunningInBackground).toBe(false);
    expect(store.saveState()).toBe("live");
    await store.set("calendar.weekStart", "sun");
    expect(bridge.settings.set).toHaveBeenLastCalledWith({ keys: ["calendar.weekStart"], settings: { calendarWeekStart: "sun" } });
    expect(store.settings().calendarWeekStart).toBe("sun");
  });

  it.each(["light", "system"])("keeps legacy %s preferences dark without changing other settings", async (appearanceTheme) => {
    const { store, settings } = setup({ appearanceTheme, focusWorkMin: 45 });
    await store.refresh();
    expect(store.settings().appearanceTheme).toBe("dark");
    await store.set("appearance.theme", appearanceTheme);
    expect(store.settings().appearanceTheme).toBe("dark");
    expect(settings.appearanceTheme).toBe("dark");
    expect(store.settings().focusWorkMin).toBe(45);
  });

  it("shows the core validation error text and does not keep an invalid value", async () => {
    const { store, settings } = setup();
    await store.refresh();
    await store.set("notifications.allDayTime", "9:00");
    expect(store.saveState()).toBe("failed");
    expect(store.keyError()).toBe("notifications.allDayTime: must be HH:MM");
    expect(store.settings().notificationsAllDayTime).toBe("09:00");
    expect(settings.notificationsAllDayTime).toBe("09:00");
  });

  it("invalidates the previous token after rotation", async () => {
    const { store, valid, token } = setup();
    await store.refresh();
    const previous = token();
    expect(valid.has(previous)).toBe(true);
    await store.rotateToken();
    expect(store.agent()?.token).not.toBe(previous);
    expect(store.previousToken()).toBe(previous);
    expect(store.tokenInvalidated()).toBe(true);
    expect(valid.has(previous)).toBe(false);
    expect(valid.has(store.agent()?.token ?? "")).toBe(true);
  });

  it("reports Test connection failure when MCP is off", async () => {
    const { store, bridge } = setup({ agentsMcpEnabled: false });
    await store.refresh();
    await store.testConnection();
    expect(store.mcpTest()?.ok).toBe(false);
    expect(store.mcpTest()?.detail).toContain("MCP is off");
    expect(bridge.app.testMcpConnection).toHaveBeenCalledWith();
    expect(store.mcpTestState()).toBe("failed");
  });

  it("reindexes with a progress state then a live document count", async () => {
    const { store } = setup();
    await store.refresh();
    expect(store.search()?.ftsDocuments).toBe(12);
    const task = store.reindex();
    expect(store.reindexState()).toBe("progress");
    await task;
    expect(store.reindexState()).toBe("live");
    expect(store.search()?.ftsDocuments).toBe(24);
  });

  it("keeps reset unavailable and does not invent a destructive RPC", async () => {
    const { store, bridge } = setup();
    store.resetLocalData("RESET");
    expect(store.resetState()).toBe("unavailable");
    expect(store.resetError()).toContain("No data was changed");
    expect(bridge.maintenance.export).not.toHaveBeenCalled();
  });

  it("exports and backs up through the save dialog paths", async () => {
    const { store, bridge } = setup();
    await store.exportZip();
    expect(bridge.app.saveZip).toHaveBeenCalled();
    expect(bridge.maintenance.export).toHaveBeenCalledWith({ zipPath: "/tmp/notes-export.zip" });
    await store.backup();
    expect(bridge.maintenance.backup).toHaveBeenCalledWith({ destPath: "/tmp/notes-backup.db" });
    expect(store.exportDetail()).toContain("Exported");
    expect(store.backupDetail()).toContain("Backed up");
  });

  it("lists only MCP-attributed activity", async () => {
    const { store } = setup();
    await store.loadActivity();
    expect(store.activity()).toEqual([expect.objectContaining({ actor: "mcp:Claude Code", summary: "Updated note title" })]);
  });
  it("reveals logs and data through Main and reports failures", async () => {
    const { store, bridge } = setup();
    await store.reveal("log");
    expect(bridge.app.openLog).toHaveBeenCalledWith();
    expect(store.advancedDetail()).toBe("Log revealed in Finder.");
    await store.reveal("data");
    expect(bridge.app.openDataFolder).toHaveBeenCalledWith();
    vi.mocked(bridge.app.openLog).mockRejectedValueOnce(new Error("Log unavailable"));
    await store.reveal("log");
    expect(store.advancedState()).toBe("failed");
    expect(store.advancedDetail()).toBe("Log unavailable");
  });

  it("uses the applied transparency value and keeps an honest failure", async () => {
    const { store, bridge } = setup();
    await store.refresh();
    expect(store.reduceTransparency()).toBe(false);
    await store.setReduceTransparency(true);
    expect(bridge.app.setReduceTransparency).toHaveBeenCalledWith(true);
    expect(store.reduceTransparency()).toBe(true);
    vi.mocked(bridge.app.setReduceTransparency).mockResolvedValueOnce(true);
    await store.setReduceTransparency(false);
    expect(store.appearanceState()).toBe("failed");
    expect(store.reduceTransparency()).toBe(true);
    vi.mocked(bridge.app.getReduceTransparency).mockRejectedValueOnce(new Error("Appearance unavailable"));
    await store.refresh();
    expect(store.reduceTransparency()).toBeUndefined();
    expect(store.appearanceError()).toBe("Appearance unavailable");
  });

  it("defaults geocoding off and round-trips only its key", async () => {
    const { store, bridge } = setup();
    await store.refresh();
    expect(store.settings().mapGeocoding).toBe(false);
    await store.set("map.geocoding", true);
    expect(bridge.settings.set).toHaveBeenLastCalledWith({ keys: ["map.geocoding"], settings: { mapGeocoding: true } });
    expect(store.settings().mapGeocoding).toBe(true);
  });

  it("shows validation reasons delivered only in Error.message", async () => {
    const { store, bridge } = setup();
    await store.refresh();
    vi.mocked(bridge.settings.set).mockRejectedValueOnce(new Error("must be mon or sun"));
    await store.set("calendar.weekStart", "invalid");
    expect(store.keyError()).toBe("must be mon or sun");
    expect(store.settings().calendarWeekStart).toBe("mon");
  });

});
