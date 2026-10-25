import { describe, expect, it } from "vitest";
import { SHORTCUT_CATALOG } from "./catalog";
import {
  chordFromEvent,
  chordToAccelerator,
  findConflict,
  formatChord,
  matchesChord,
  parseChord,
  serializeChord,
} from "./chord";
import type { ShortcutChord, ShortcutCommand } from "./types";

function chord(partial: Partial<ShortcutChord> & Pick<ShortcutChord, "key">): ShortcutChord {
  return {
    key: partial.key,
    mod: partial.mod ?? false,
    shift: partial.shift ?? false,
    alt: partial.alt ?? false,
  };
}

describe("shortcut chords", () => {
  it("serializes and parses round-trip chords", () => {
    const source = chord({ key: "k", mod: true, shift: true });
    expect(serializeChord(source)).toBe("mod+shift+k");
    expect(parseChord("mod+shift+k")).toEqual(source);
    expect(parseChord("CommandOrControl+Shift+K")).toEqual(source);
  });

  it("formats mac and windows display labels", () => {
    expect(formatChord(chord({ key: "k", mod: true }), true)).toBe("⌘K");
    expect(formatChord(chord({ key: "j", mod: true, shift: true }), true)).toBe("⌘⇧J");
    expect(formatChord(chord({ key: "k", mod: true }), false)).toBe("Ctrl+K");
  });

  it("builds Electron accelerators", () => {
    expect(chordToAccelerator(chord({ key: "k", mod: true, shift: true }))).toBe(
      "CommandOrControl+Shift+K",
    );
    expect(chordToAccelerator(chord({ key: "b", mod: true }))).toBe("CommandOrControl+B");
  });

  it("matches default delete aliases until overridden", () => {
    const command: ShortcutCommand = {
      id: "structure.add_node", label: "Test aliases", group: "structure",
      defaultChord: chord({ key: "delete" }), defaultAliases: [chord({ key: "backspace" })],
    };
    const deleteEvent = {
      key: "Delete",
      code: "Delete",
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    };
    const backspaceEvent = {
      key: "Backspace",
      code: "Backspace",
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    };
    expect(matchesChord(command, {}, deleteEvent)).toBe(true);
    expect(matchesChord(command, {}, backspaceEvent)).toBe(true);
    expect(
      matchesChord(command, { "structure.add_node": chord({ key: "delete" }) }, backspaceEvent),
    ).toBe(false);
  });

  it("detects conflicts inside the same group only", () => {
    const conflict = findConflict(
      "shell.toggle_commander",
      chord({ key: "j", mod: true }),
      SHORTCUT_CATALOG,
      {},
    );
    expect(conflict?.id).toBe("shell.toggle_detail");

    const crossGroup = findConflict(
      "shell.toggle_commander",
      chord({ key: "v" }),
      SHORTCUT_CATALOG,
      {},
    );
    expect(crossGroup).toBeNull();
  });

  it("builds chords from keyboard events", () => {
    expect(
      chordFromEvent({
        key: "K",
        code: "KeyK",
        metaKey: true,
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
      }),
    ).toEqual(chord({ key: "k", mod: true, shift: true }));
    expect(
      chordFromEvent({
        key: "Shift",
        code: "ShiftLeft",
        metaKey: false,
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
      }),
    ).toBeNull();
  });
});
