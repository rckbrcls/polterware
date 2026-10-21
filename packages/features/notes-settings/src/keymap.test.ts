import { describe, expect, it } from "vitest";
import { SHORTCUTS } from "./keymap";

describe("shortcut keymap", () => {
  it("includes the 06-ui.md and shell shortcuts", () => {
    expect(SHORTCUTS.map(row => row.id)).toEqual([
      "commander", "quick-add", "settings", "back", "forward", "close-detail",
      "route-1", "route-2", "route-3", "route-4", "route-5", "route-6", "search",
      "open", "toggle-done", "edit-title", "pin", "delete",
    ]);
    expect(SHORTCUTS.find(row => row.id === "commander")?.keys).toBe("⌘K");
    expect(SHORTCUTS.find(row => row.id === "settings")?.keys).toBe("⌘,");
    expect(SHORTCUTS.find(row => row.id === "delete")?.keys).toBe("⌘⌫");
  });
});
