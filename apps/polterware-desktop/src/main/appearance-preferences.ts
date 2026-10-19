import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { JsonValue } from "../shared/ipc.js";
import {
  APPEARANCE_PREFERENCES_FILE,
  decodeStoredAppearancePreferences,
  emptyAppearancePreferences,
  type AppearancePreferencesPatch,
  type StoredAppearancePreferences,
} from "../shared/appearance-preferences.js";

export interface AppearancePreferencesController {
  getPreferences(): StoredAppearancePreferences;
  setPreferences(patch: AppearancePreferencesPatch): StoredAppearancePreferences;
}

export interface AppearancePreferencesControllerOptions {
  userDataDirectory: string;
  onChange?: (preferences: StoredAppearancePreferences) => void;
}

function readPreferences(userDataDirectory: string): StoredAppearancePreferences {
  try {
    const path = join(userDataDirectory, APPEARANCE_PREFERENCES_FILE);
    if (!existsSync(path)) return emptyAppearancePreferences();
    const wireValue: JsonValue = JSON.parse(readFileSync(path, "utf8"));
    return decodeStoredAppearancePreferences(wireValue) ?? emptyAppearancePreferences();
  } catch {
    return emptyAppearancePreferences();
  }
}

function writePreferences(
  userDataDirectory: string,
  preferences: StoredAppearancePreferences,
): void {
  mkdirSync(userDataDirectory, { recursive: true });
  writeFileSync(
    join(userDataDirectory, APPEARANCE_PREFERENCES_FILE),
    JSON.stringify(preferences, null, 2),
  );
}

export function createAppearancePreferencesController({
  userDataDirectory,
  onChange,
}: AppearancePreferencesControllerOptions): AppearancePreferencesController {
  let cached = readPreferences(userDataDirectory);

  function getPreferences(): StoredAppearancePreferences {
    cached = readPreferences(userDataDirectory);
    return {
      version: cached.version,
      reduceTransparency: cached.reduceTransparency,
    };
  }

  function setPreferences(patch: AppearancePreferencesPatch): StoredAppearancePreferences {
    const next: StoredAppearancePreferences = {
      version: 1,
      reduceTransparency:
        patch.reduceTransparency === undefined
          ? cached.reduceTransparency
          : Boolean(patch.reduceTransparency),
    };
    writePreferences(userDataDirectory, next);
    cached = next;
    onChange?.(getPreferences());
    return getPreferences();
  }

  return {
    getPreferences,
    setPreferences,
  };
}
