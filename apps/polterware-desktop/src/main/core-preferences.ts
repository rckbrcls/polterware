import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { JsonValue } from "../shared/ipc.js";
import {
  CORE_PREFERENCES_FILE,
  decodeStoredCorePreferences,
  emptyCorePreferences,
  type CorePreferencesPatch,
  type StoredCorePreferences,
} from "../shared/core-preferences.js";

export interface CorePreferencesController {
  getPreferences(): StoredCorePreferences;
  setPreferences(patch: CorePreferencesPatch): StoredCorePreferences;
}

function readPreferences(userDataDirectory: string): StoredCorePreferences {
  try {
    const path = join(userDataDirectory, CORE_PREFERENCES_FILE);
    if (!existsSync(path)) return emptyCorePreferences();
    const wireValue: JsonValue = JSON.parse(readFileSync(path, "utf8"));
    return decodeStoredCorePreferences(wireValue) ?? emptyCorePreferences();
  } catch {
    return emptyCorePreferences();
  }
}

export function createCorePreferencesController(options: {
  userDataDirectory: string;
}): CorePreferencesController {
  const { userDataDirectory } = options;

  function getPreferences(): StoredCorePreferences {
    return readPreferences(userDataDirectory);
  }

  function setPreferences(patch: CorePreferencesPatch): StoredCorePreferences {
    const current = readPreferences(userDataDirectory);
    const next: StoredCorePreferences = {
      version: current.version,
      idle: patch.idle ?? current.idle,
      autoStart: patch.autoStart === undefined ? current.autoStart : Boolean(patch.autoStart),
    };
    mkdirSync(userDataDirectory, { recursive: true });
    writeFileSync(join(userDataDirectory, CORE_PREFERENCES_FILE), JSON.stringify(next, null, 2));
    return next;
  }

  return { getPreferences, setPreferences };
}
