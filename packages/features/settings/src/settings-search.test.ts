import { describe, expect, it } from "vitest";
import {
  SETTINGS_SEARCH_ENTRIES,
  searchSettings,
  settingsSectionId,
} from "./settings-search";

describe("searchSettings", () => {
  it("returns nothing for an empty query", () => {
    expect(searchSettings(SETTINGS_SEARCH_ENTRIES, "  ")).toEqual([]);
  });

  it("matches label, keywords, and section case-insensitively", () => {
    expect(searchSettings(SETTINGS_SEARCH_ENTRIES, "RESET").map((e) => e.id)).toContain("reset-store");
    expect(searchSettings(SETTINGS_SEARCH_ENTRIES, "sqlite").map((e) => e.id)).toContain("reset-store");
    expect(searchSettings(SETTINGS_SEARCH_ENTRIES, "danger").map((entry) => entry.id)).toEqual(["reset-store"]);
  });

  it("requires every term to match", () => {
    expect(searchSettings(SETTINGS_SEARCH_ENTRIES, "reset zzz")).toEqual([]);
  });
});

describe("settingsSectionId", () => {
  it("slugifies section titles", () => {
    expect(settingsSectionId("Local core")).toBe("settings-section-local-core");
  });
});
