import { describe, expect, it, vi } from "vitest";
import { createSettingsBridge, type SettingsWireBridge } from "./bridge";
import { SettingsSchema, SetSettingsRequestSchema } from "@polterware/notes-contracts";
import { fromJson, toJson } from "@bufbuild/protobuf";

describe("protobuf JSON settings bridge", () => {
  it("sends one SettingsService.Set key and keeps protobuf JSON field names", async () => {
    const set = vi.fn(async (input?: unknown) => {
      expect(input).toEqual({ keys: ["app.keepRunningInBackground"], settings: { appKeepRunningInBackground: false } });
      return { settings: { appKeepRunningInBackground: false, calendarWeekStart: "mon" } };
    });
    const bridge = createSettingsBridge({
      settings: { set, get: async () => ({ settings: {} }) },
      agents: {}, reminders: {}, search: {}, activity: {}, maintenance: {},
      onChange: () => () => {},
      app: { getInfo: async () => ({ name: "Polterware Notes", version: "0", updates: "disabled" }), requestNotificationAuthorization: async () => false, saveZip: async () => null, saveBackup: async () => null },
    } as unknown as SettingsWireBridge);
    const result = await bridge.settings.set({ keys: ["app.keepRunningInBackground"], settings: { appKeepRunningInBackground: false } });
    expect(result.settings?.calendarWeekStart).toBe("mon");
    expect(set).toHaveBeenCalledOnce();
  });

  it("round-trips SetSettingsRequest through protobuf JSON", () => {
    const json = toJson(SetSettingsRequestSchema, fromJson(SetSettingsRequestSchema, {
      keys: ["calendar.weekStart"],
      settings: { calendarWeekStart: "sun" },
    }));
    expect(json).toMatchObject({ keys: ["calendar.weekStart"], settings: { calendarWeekStart: "sun" } });
  });

  it("accepts RFC 3339 reminder timestamps on the wire", async () => {
    const status = vi.fn(async () => ({ planned: 1, armed: 1, permission: "authorized", notifierLastSeenAt: "2026-10-04T12:00:00.000Z" }));
    const bridge = createSettingsBridge({
      settings: {}, agents: {}, reminders: { status }, search: {}, activity: {}, maintenance: {},
      onChange: () => () => {},
      app: { getInfo: async () => ({ name: "Polterware Notes", version: "0", updates: "disabled" }), requestNotificationAuthorization: async () => true, saveZip: async () => null, saveBackup: async () => null },
    } as unknown as SettingsWireBridge);
    const result = await bridge.reminders.status({});
    expect(result.notifierLastSeenAt).toBe("2026-10-04T12:00:00.000Z");
  });

  it("keeps maintenance int64 bytes as a decimal string", async () => {
    const exported = vi.fn(async () => ({ zipPath: "/tmp/a.zip", bytes: "9007199254740993" }));
    const bridge = createSettingsBridge({
      settings: {}, agents: {}, reminders: {}, search: {}, activity: {},
      maintenance: { export: exported },
      onChange: () => () => {},
      app: { getInfo: async () => ({ name: "Polterware Notes", version: "0", updates: "disabled" }), requestNotificationAuthorization: async () => false, saveZip: async () => null, saveBackup: async () => null },
    } as unknown as SettingsWireBridge);
    const result = await bridge.maintenance.export({ zipPath: "/tmp/a.zip" });
    expect(result.bytes).toBe("9007199254740993");
    expect(typeof result.bytes).toBe("string");
  });

  it("validates Settings JSON with the contracts", () => {
    const json = toJson(SettingsSchema, fromJson(SettingsSchema, { calendarWeekStart: "sun", agentsMcpPort: 47600 }));
    expect(json).toMatchObject({ calendarWeekStart: "sun", agentsMcpPort: 47600 });
  });
});
