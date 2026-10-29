import { describe, expect, it } from "vitest";
import {
  SETTINGS_SEARCH_ENTRIES,
  dynamicSettingsEntries,
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
    expect(searchSettings(SETTINGS_SEARCH_ENTRIES, "danger").map((entry) => entry.id)).toEqual(["archive-project", "reset-store"]);
  });

  it("opens the focused page for moved sections", () => {
    for (const [query, tab, section] of [
      ["checkout", "repositories", "Local repositories"],
      ["archive", "project-danger", "Danger zone"],
      ["hooks", "agents-hooks", "Hooks"],
      ["download", "agents-skill", "AI skill"],
      ["vibrancy", "appearance", "Appearance"],
      ["reset", "app-danger", "Danger zone"],
    ]) {
      expect(searchSettings(SETTINGS_SEARCH_ENTRIES, query!)).toContainEqual(expect.objectContaining({ tab, section }));
    }
    expect(dynamicSettingsEntries().every((entry) =>
      (entry.tab === "shortcuts" && entry.section === "Shortcuts") || (entry.tab === "cli-reference" && entry.section === "Commands"),
    )).toBe(true);
    expect(searchSettings(SETTINGS_SEARCH_ENTRIES, "vercel")).toContainEqual(expect.objectContaining({ tab: "platforms-connected" }));
    expect(searchSettings(dynamicSettingsEntries(), "polterware wait")).toContainEqual(expect.objectContaining({ tab: "cli-reference" }));
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
