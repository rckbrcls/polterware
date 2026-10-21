import { describe, expect, it } from "vitest";
import { searchSettings, settingsSectionId } from "./settings-dialog";

const entries = [
  { item: "general", section: "Appearance", label: "Theme", keywords: "dark light" },
  { item: "general", section: "Units", label: "Network unit", description: "Bytes or bits per second." },
];

describe("searchSettings", () => {
  it("returns nothing for an empty query", () => {
    expect(searchSettings(entries, "  ")).toEqual([]);
  });

  it("matches label, description, section, and keywords case-insensitively", () => {
    expect(searchSettings(entries, "DARK").map((entry) => entry.label)).toEqual(["Theme"]);
    expect(searchSettings(entries, "bits").map((entry) => entry.label)).toEqual(["Network unit"]);
    expect(searchSettings(entries, "units").map((entry) => entry.label)).toEqual(["Network unit"]);
  });

  it("requires every term to match", () => {
    expect(searchSettings(entries, "theme zzz")).toEqual([]);
  });
});

describe("settingsSectionId", () => {
  it("slugifies section titles", () => {
    expect(settingsSectionId("Local core")).toBe("settings-section-local-core");
  });
});
