import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings.js";
import { formatNetworkRate } from "../renderer/utils/format.js";

describe("settings normalization", () => {
  it("recovers from invalid files and preserves valid fields independently", () => {
    for (const raw of [null, [], "broken", 42]) expect(normalizeSettings(raw)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ theme: "light", autoReconnect: false, historyWindowMinutes: 7, unknown: 1 }))
      .toEqual({ ...DEFAULT_SETTINGS, autoReconnect: false });
  });
  it.each(["light", "system", "dark"])("normalizes %s to dark without changing other preferences", (theme) => {
    expect(normalizeSettings({ theme, networkUnit: "bits", reduceTransparency: true }))
      .toEqual({ ...DEFAULT_SETTINGS, networkUnit: "bits", reduceTransparency: true });
  });
  it("accepts all preferences and rejects unsafe delays", () => {
    const settings = { theme: "dark", reduceTransparency: true, networkUnit: "bits", historyWindowMinutes: 10, confirmBeforeKill: false,
      confirmBeforeCloseSession: false, defaultKillSignal: "KILL", autoReconnect: false, reconnectDelaySeconds: 5 };
    expect(normalizeSettings(settings)).toEqual(settings);
    for (const delay of [NaN, Infinity, -1, 0, 301, "3"]) {
      expect(normalizeSettings({ reconnectDelaySeconds: delay }).reconnectDelaySeconds).toBe(3);
    }
  });
  it("formats network bytes as bits without affecting disk formatting", () => {
    expect(formatNetworkRate(125_000, "bits")).toBe("1.00 Mbit/s");
    expect(formatNetworkRate(1024, "bytes")).toBe("1.0 KB/s");
  });
});
