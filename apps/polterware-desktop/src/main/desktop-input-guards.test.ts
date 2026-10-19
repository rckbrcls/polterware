import { describe, expect, it } from "vitest";
import {
  shouldBlockDesktopBrowserShortcut,
  type DesktopShortcutInput,
} from "./desktop-input-guards.js";

function keyDown(partial: Partial<DesktopShortcutInput> & Pick<DesktopShortcutInput, "key">): DesktopShortcutInput {
  return {
    type: "keyDown",
    code: partial.code ?? "",
    control: false,
    meta: false,
    alt: false,
    shift: false,
    ...partial,
  };
}

describe("shouldBlockDesktopBrowserShortcut", () => {
  it("blocks page zoom chords on every build", () => {
    expect(
      shouldBlockDesktopBrowserShortcut(keyDown({ key: "=", meta: true }), {
        allowReload: true,
      }),
    ).toBe(true);
    expect(
      shouldBlockDesktopBrowserShortcut(keyDown({ key: "+", control: true }), {
        allowReload: false,
      }),
    ).toBe(true);
    expect(
      shouldBlockDesktopBrowserShortcut(keyDown({ key: "-", meta: true }), {
        allowReload: true,
      }),
    ).toBe(true);
    expect(
      shouldBlockDesktopBrowserShortcut(keyDown({ key: "0", meta: true }), {
        allowReload: true,
      }),
    ).toBe(true);
  });

  it("blocks reload when allowReload is false", () => {
    expect(
      shouldBlockDesktopBrowserShortcut(keyDown({ key: "r", meta: true }), {
        allowReload: false,
      }),
    ).toBe(true);
    expect(
      shouldBlockDesktopBrowserShortcut(keyDown({ key: "R", control: true }), {
        allowReload: false,
      }),
    ).toBe(true);
    expect(
      shouldBlockDesktopBrowserShortcut(keyDown({ key: "F5", code: "F5" }), {
        allowReload: false,
      }),
    ).toBe(true);
  });

  it("allows reload shortcuts in development", () => {
    expect(
      shouldBlockDesktopBrowserShortcut(keyDown({ key: "r", meta: true }), {
        allowReload: true,
      }),
    ).toBe(false);
    expect(
      shouldBlockDesktopBrowserShortcut(keyDown({ key: "F5", code: "F5" }), {
        allowReload: true,
      }),
    ).toBe(false);
  });

  it("ignores plain keys and keyUp", () => {
    expect(
      shouldBlockDesktopBrowserShortcut(keyDown({ key: "r" }), {
        allowReload: false,
      }),
    ).toBe(false);
    expect(
      shouldBlockDesktopBrowserShortcut(
        { ...keyDown({ key: "=", meta: true }), type: "keyUp" },
        { allowReload: false },
      ),
    ).toBe(false);
  });
});
