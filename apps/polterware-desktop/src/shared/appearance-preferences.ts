import type { JsonObject, JsonValue } from "./ipc.js";

export const APPEARANCE_PREFERENCES_FILE = "appearance-preferences.json";
export const APPEARANCE_PREFERENCES_VERSION = 1;

/** App-level window chrome preference (macOS vibrancy vs solid fill). */
export type StoredAppearancePreferences = {
  version: typeof APPEARANCE_PREFERENCES_VERSION;
  /** When true, shell chrome is opaque and macOS vibrancy is disabled. */
  reduceTransparency: boolean;
};

export type AppearancePreferencesPatch = {
  reduceTransparency?: boolean;
};

export function emptyAppearancePreferences(): StoredAppearancePreferences {
  return {
    version: APPEARANCE_PREFERENCES_VERSION,
    reduceTransparency: false,
  };
}

export function decodeStoredAppearancePreferences(
  value: JsonValue,
): StoredAppearancePreferences | undefined {
  if (value === null || Array.isArray(value) || Object(value) !== value) {
    return undefined;
  }
  const record = value as JsonObject;
  const versionValue = record.version;
  const version = Number(versionValue);
  if (versionValue !== version || !Number.isInteger(version)) return undefined;
  if (version !== APPEARANCE_PREFERENCES_VERSION) return undefined;

  const reduceTransparency = record.reduceTransparency === true;

  return {
    version: APPEARANCE_PREFERENCES_VERSION,
    reduceTransparency,
  };
}
