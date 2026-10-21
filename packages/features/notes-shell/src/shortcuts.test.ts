import { expect, it } from "vitest";
import { shellShortcut } from "./shortcuts";
const event = (key: string, props = {}) => new KeyboardEvent("keydown", { key, ...props });
it.each([
  ["k", "commander"], ["n", "quick-add"], [",", "settings"], ["[", "back"], ["]", "forward"], ["j", "close-detail"],
  ["1", "route-1"], ["2", "route-2"], ["3", "route-3"], ["4", "route-4"], ["5", "route-5"], ["6", "route-6"],
])("maps Command+%s", (key, action) => expect(shellShortcut(event(key, { metaKey: true }), false)).toBe(action));
it("protects editable fields and IME composition", () => {
  expect(shellShortcut(event("/"), true)).toBeUndefined();
  expect(shellShortcut(event("/"), false)).toBe("search");
  expect(shellShortcut(event("k", { metaKey: true, isComposing: true }), false)).toBeUndefined();
  expect(shellShortcut(event("k", { metaKey: true, altKey: true }), false)).toBeUndefined();
  expect(shellShortcut(event("k", { ctrlKey: true }), true)).toBe("commander");
});

import { noteShortcut } from "./shortcuts";
it.each([["Enter", "open"], [" ", "toggle-done"], ["e", "edit-title"], ["p", "pin"]])("delegates note key %s", (key, expected) => {
  expect(noteShortcut(event(key), false)).toBe(expected);
  expect(noteShortcut(event(key), true)).toBeUndefined();
});
it("delegates deletion to the collection owner for confirmation", () => {
  expect(noteShortcut(event("Backspace", { metaKey: true }), false)).toBe("delete");
  expect(noteShortcut(event("Backspace"), false)).toBeUndefined();
});
