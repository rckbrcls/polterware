import type { JsonObject, JsonValue } from "./ipc.js";

export const QUIT_PREFERENCES_FILE = "quit-preferences.json";
export const QUIT_PREFERENCES_VERSION = 1;

/** App-level quit behavior. */
export type StoredQuitPreferences = {
  version: typeof QUIT_PREFERENCES_VERSION;
  /** When true, Cmd+Q explains that the local core keeps running and asks first. */
  confirmOnQuit: boolean;
  /** What quitting does to the local core when it does not ask first. */
  quitAction: QuitAction;
};

export type QuitAction = "keep" | "stop";

export type QuitPreferencesPatch = {
  confirmOnQuit?: boolean;
  quitAction?: QuitAction;
};

export function emptyQuitPreferences(): StoredQuitPreferences {
  return { version: QUIT_PREFERENCES_VERSION, confirmOnQuit: true, quitAction: "keep" };
}

export function decodeStoredQuitPreferences(value: JsonValue): StoredQuitPreferences | undefined {
  if (value === null || Array.isArray(value) || Object(value) !== value) return undefined;
  const record = value as JsonObject;
  if (record.version !== QUIT_PREFERENCES_VERSION) return undefined;
  return {
    version: QUIT_PREFERENCES_VERSION,
    confirmOnQuit: record.confirmOnQuit !== false,
    quitAction: record.quitAction === "stop" ? "stop" : "keep",
  };
}
