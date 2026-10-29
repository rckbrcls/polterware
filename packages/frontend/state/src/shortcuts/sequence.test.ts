import { describe, expect, it } from "vitest";
import { SHORTCUT_CATALOG, SHORTCUT_SEQUENCES } from "./catalog";
import { chordKeys, createSequenceMatcher, formatSequence, isTypingTarget } from "./chord";
import { filterShortcutReference, shortcutReference } from "./reference";

function key(value: string, modifiers: Partial<Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "shiftKey" | "altKey">> = {}) {
  return {
    key: value,
    code: value.length === 1 && /[a-z]/i.test(value) ? `Key${value.toUpperCase()}` : value,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...modifiers,
  };
}

describe("shortcut sequences", () => {
  it("matches G then a letter and waits after G", () => {
    const matcher = createSequenceMatcher(SHORTCUT_SEQUENCES);
    expect(matcher.press(key("g"))).toEqual({ kind: "pending" });
    expect(matcher.press(key("i"))).toEqual({ kind: "matched", id: "go.inbox" });
    // A matched sequence starts over: a lone letter is not one.
    expect(matcher.press(key("i"))).toBeNull();
  });

  it("starts over after the timeout, a modifier, or a key no sequence continues with", () => {
    let now = 0;
    const matcher = createSequenceMatcher(SHORTCUT_SEQUENCES, 1000, () => now);
    matcher.press(key("g"));
    now = 1500;
    expect(matcher.press(key("w"))).toBeNull();

    matcher.press(key("g"));
    expect(matcher.press(key("w", { metaKey: true }))).toBeNull();
    expect(matcher.press(key("w"))).toBeNull();

    matcher.press(key("g"));
    expect(matcher.press(key("x"))).toBeNull();
    // The breaking key may itself start a sequence.
    matcher.press(key("g"));
    expect(matcher.press(key("g"))).toEqual({ kind: "pending" });
    expect(matcher.press(key("s"))).toEqual({ kind: "matched", id: "go.structure" });
  });

  it("ignores a lone modifier between the keys", () => {
    const matcher = createSequenceMatcher(SHORTCUT_SEQUENCES);
    matcher.press(key("g"));
    expect(matcher.press(key("Shift", { shiftKey: true }))).toBeNull();
    expect(matcher.press(key("t"))).toEqual({ kind: "matched", id: "go.truth" });
  });

  it("formats sequences and chord keys for display", () => {
    expect(formatSequence(["g", "i"])).toBe("G then I");
    expect(chordKeys({ key: "k", mod: true, shift: true, alt: false }, true)).toEqual(["⌘", "⇧", "K"]);
    expect(chordKeys({ key: "?", mod: false, shift: true, alt: false }, true)).toEqual(["?"]);
    expect(chordKeys({ key: "[", mod: false, shift: false, alt: false }, false)).toEqual(["["]);
  });

  it("has no typing target outside a document", () => {
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("shortcut reference", () => {
  it("lists about twenty shortcuts with the person's bindings", () => {
    const groups = shortcutReference({ "shell.toggle_sidebar": { key: "b", mod: true, shift: false, alt: false } }, true);
    expect(groups.map((group) => group.label)).toEqual(["General", "Navigation", "Lists", "Composer", "Milestones", "Structure"]);
    const rows = groups.flatMap((group) => group.rows);
    expect(rows.length).toBeGreaterThanOrEqual(20);
    expect(rows.find((row) => row.id === "shell.toggle_sidebar")?.keys).toEqual(["⌘", "B"]);
    expect(rows.find((row) => row.id === "shell.show_shortcuts")?.keys).toEqual(["⌘", "/"]);
    expect(rows.find((row) => row.id === "go.inbox")).toMatchObject({ keys: ["G", "I"], join: "then" });
    expect(rows.filter((row) => row.join === "with" && !row.id.startsWith("composer.")).length).toBe(SHORTCUT_CATALOG.length);
    expect(rows.find((row) => row.id === "shell.create")?.keys).toEqual(["C"]);
  });

  it("filters rows by label, group, or keys", () => {
    const groups = shortcutReference({}, true);
    expect(filterShortcutReference(groups, "inbox").flatMap((group) => group.rows.map((row) => row.id))).toEqual(["go.inbox"]);
    expect(filterShortcutReference(groups, "lists")[0]?.rows.length).toBe(5);
    expect(filterShortcutReference(groups, "g i").flatMap((group) => group.rows.map((row) => row.id))).toEqual(["go.inbox"]);
    expect(filterShortcutReference(groups, "")).toHaveLength(6);
  });
});
