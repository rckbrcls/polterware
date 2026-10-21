import { describe, expect, it } from "vitest";
import {
  decodeStoredShortcutPreferences,
  resolveGlobalCommanderAccelerator,
  storedChordToAccelerator,
} from "../shared/shortcut-preferences.js";

describe("shortcut preferences wire format", () => {
  it("decodes versioned overrides", () => {
    expect(
      decodeStoredShortcutPreferences({
        version: 1,
        overrides: {
          "shell.toggle_commander": "mod+p",
        },
      }),
    ).toEqual({
      version: 1,
      overrides: {
        "shell.toggle_commander": "mod+p",
      },
    });
  });

  it("resolves the global Commander accelerator from overrides", () => {
    expect(resolveGlobalCommanderAccelerator({})).toBe("CommandOrControl+Shift+K");
    expect(
      resolveGlobalCommanderAccelerator({
        "shell.toggle_commander_global": "mod+shift+p",
      }),
    ).toBe("CommandOrControl+Shift+P");
    expect(storedChordToAccelerator("mod+k")).toBe("CommandOrControl+K");
  });
});
