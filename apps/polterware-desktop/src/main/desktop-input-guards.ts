import type { Event, Input, WebContents } from "electron";

export type DesktopInputGuardOptions = {
  /** When false, block browser reload shortcuts (packaged Desktop). */
  allowReload: boolean;
};

export type DesktopShortcutInput = Pick<
  Input,
  "type" | "key" | "code" | "control" | "meta" | "alt" | "shift"
>;

function isModifierChord(input: DesktopShortcutInput): boolean {
  return Boolean(input.meta || input.control) && !input.alt;
}

function isZoomKey(key: string): boolean {
  return key === "=" || key === "+" || key === "-" || key === "_" || key === "0";
}

function isReloadKey(input: DesktopShortcutInput): boolean {
  const key = input.key.toLowerCase();
  if (key === "r" && isModifierChord(input)) {
    return true;
  }
  if (input.key === "F5" || input.code === "F5") {
    return true;
  }
  return false;
}

/** Pure decision for browser-default shortcuts that should not fire in Desktop. */
export function shouldBlockDesktopBrowserShortcut(
  input: DesktopShortcutInput,
  options: DesktopInputGuardOptions,
): boolean {
  if (input.type !== "keyDown") {
    return false;
  }

  if (isModifierChord(input) && isZoomKey(input.key)) {
    return true;
  }

  if (!options.allowReload && isReloadKey(input)) {
    return true;
  }

  return false;
}

/** Attach Main-process guards so Chromium cannot reload or page-zoom the shell. */
export function attachDesktopInputGuards(
  webContents: WebContents,
  options: DesktopInputGuardOptions,
): void {
  webContents.on("before-input-event", (event: Event, input: Input) => {
    if (shouldBlockDesktopBrowserShortcut(input, options)) {
      event.preventDefault();
    }
  });
}
