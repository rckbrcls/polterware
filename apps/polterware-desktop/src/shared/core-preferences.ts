import type { JsonObject, JsonValue } from "./ipc.js";

export const CORE_PREFERENCES_FILE = "core-preferences.json";
export const CORE_PREFERENCES_VERSION = 1;

export const CORE_IDLE_OPTIONS = ["never", "10m", "30m", "1h"] as const;
export type CoreIdleOption = (typeof CORE_IDLE_OPTIONS)[number];

/** Settings for the local core (`polterware serve`) that the Desktop starts. */
export type StoredCorePreferences = {
  version: typeof CORE_PREFERENCES_VERSION;
  /** How long a Desktop-started core waits without clients before exiting. */
  idle: CoreIdleOption;
  /** Start (or attach to) the core when the Desktop opens. */
  autoStart: boolean;
};

export type CorePreferencesPatch = {
  idle?: CoreIdleOption;
  autoStart?: boolean;
};

export function emptyCorePreferences(): StoredCorePreferences {
  return { version: CORE_PREFERENCES_VERSION, idle: "never", autoStart: true };
}

export function isCoreIdleOption(value: unknown): value is CoreIdleOption {
  return (CORE_IDLE_OPTIONS as readonly unknown[]).includes(value);
}

/** Value for `polterware serve --idle`. */
export function idleToFlag(idle: CoreIdleOption): string {
  return idle === "never" ? "0" : idle;
}

export function decodeStoredCorePreferences(value: JsonValue): StoredCorePreferences | undefined {
  if (value === null || Array.isArray(value) || Object(value) !== value) return undefined;
  const record = value as JsonObject;
  if (record.version !== CORE_PREFERENCES_VERSION) return undefined;
  return {
    version: CORE_PREFERENCES_VERSION,
    idle: isCoreIdleOption(record.idle) ? record.idle : "never",
    autoStart: record.autoStart !== false,
  };
}
