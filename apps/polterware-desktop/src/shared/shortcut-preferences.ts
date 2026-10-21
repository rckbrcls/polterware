import type { JsonObject, JsonValue } from "./ipc.js";

export const SHORTCUT_PREFERENCES_FILE = "shortcut-preferences.json";
export const SHORTCUT_PREFERENCES_VERSION = 1;
export const GLOBAL_COMMANDER_COMMAND_ID = "shell.toggle_commander_global";
export const DEFAULT_GLOBAL_COMMANDER_ACCELERATOR = "CommandOrControl+Shift+K";

/** Wire format: command id → serialized chord (`mod+shift+k`). */
export type StoredShortcutOverrides = Record<string, string>;

export type StoredShortcutPreferences = {
  version: typeof SHORTCUT_PREFERENCES_VERSION;
  overrides: StoredShortcutOverrides;
};

export function emptyShortcutPreferences(): StoredShortcutPreferences {
  return { version: SHORTCUT_PREFERENCES_VERSION, overrides: {} };
}

export function decodeStoredShortcutPreferences(
  value: JsonValue,
): StoredShortcutPreferences | undefined {
  if (value === null || Array.isArray(value) || Object(value) !== value) {
    return undefined;
  }
  const record = value as JsonObject;
  const versionValue = record.version;
  const version = Number(versionValue);
  if (versionValue !== version || !Number.isInteger(version)) return undefined;
  if (version !== SHORTCUT_PREFERENCES_VERSION) return undefined;

  const overridesValue = record.overrides;
  if (
    overridesValue === null
    || overridesValue === undefined
    || Array.isArray(overridesValue)
    || Object(overridesValue) !== overridesValue
  ) {
    return emptyShortcutPreferences();
  }

  const overrides: StoredShortcutOverrides = {};
  for (const [id, chord] of Object.entries(overridesValue as JsonObject)) {
    if (Object.prototype.toString.call(chord) !== "[object String]") continue;
    const trimmed = String(chord).trim();
    if (!trimmed || !id.trim()) continue;
    overrides[id] = trimmed.toLowerCase();
  }

  return { version: SHORTCUT_PREFERENCES_VERSION, overrides };
}

/** Convert a stored chord token list into an Electron accelerator. */
export function storedChordToAccelerator(raw: string): string | null {
  const tokens = raw
    .trim()
    .toLowerCase()
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;

  let mod = false;
  let shift = false;
  let alt = false;
  let key = "";

  for (const token of tokens) {
    if (
      token === "mod"
      || token === "cmd"
      || token === "command"
      || token === "meta"
      || token === "ctrl"
      || token === "control"
      || token === "commandorcontrol"
    ) {
      mod = true;
      continue;
    }
    if (token === "shift") {
      shift = true;
      continue;
    }
    if (token === "alt" || token === "option") {
      alt = true;
      continue;
    }
    if (key) return null;
    key = token === "return" ? "enter" : token === "del" ? "delete" : token;
  }

  if (!key) return null;

  const parts: string[] = [];
  if (mod) parts.push("CommandOrControl");
  if (alt) parts.push("Alt");
  if (shift) parts.push("Shift");

  const acceleratorKey =
    key === "space"
      ? "Space"
      : key === "enter"
        ? "Return"
        : key === "delete"
          ? "Delete"
          : key === "backspace"
            ? "Backspace"
            : key === "+"
              ? "Plus"
              : key.length === 1
                ? key.toUpperCase()
                : key.charAt(0).toUpperCase() + key.slice(1);
  parts.push(acceleratorKey);
  return parts.join("+");
}

export function resolveGlobalCommanderAccelerator(
  overrides: StoredShortcutOverrides,
): string {
  const raw = overrides[GLOBAL_COMMANDER_COMMAND_ID];
  if (!raw) return DEFAULT_GLOBAL_COMMANDER_ACCELERATOR;
  return storedChordToAccelerator(raw) ?? DEFAULT_GLOBAL_COMMANDER_ACCELERATOR;
}
