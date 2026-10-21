import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { JsonValue } from "../shared/ipc.js";
import {
  QUIT_PREFERENCES_FILE,
  decodeStoredQuitPreferences,
  emptyQuitPreferences,
  type QuitPreferencesPatch,
  type StoredQuitPreferences,
} from "../shared/quit-preferences.js";

export interface QuitPreferencesController {
  getPreferences(): StoredQuitPreferences;
  setPreferences(patch: QuitPreferencesPatch): StoredQuitPreferences;
}

function readPreferences(userDataDirectory: string): StoredQuitPreferences {
  try {
    const path = join(userDataDirectory, QUIT_PREFERENCES_FILE);
    if (!existsSync(path)) return emptyQuitPreferences();
    const wireValue: JsonValue = JSON.parse(readFileSync(path, "utf8"));
    return decodeStoredQuitPreferences(wireValue) ?? emptyQuitPreferences();
  } catch {
    return emptyQuitPreferences();
  }
}

export function createQuitPreferencesController(options: {
  userDataDirectory: string;
}): QuitPreferencesController {
  const { userDataDirectory } = options;

  function getPreferences(): StoredQuitPreferences {
    return readPreferences(userDataDirectory);
  }

  function setPreferences(patch: QuitPreferencesPatch): StoredQuitPreferences {
    const current = readPreferences(userDataDirectory);
    const next: StoredQuitPreferences = {
      version: current.version,
      confirmOnQuit:
        patch.confirmOnQuit === undefined ? current.confirmOnQuit : Boolean(patch.confirmOnQuit),
      quitAction: patch.quitAction ?? current.quitAction,
    };
    mkdirSync(userDataDirectory, { recursive: true });
    writeFileSync(join(userDataDirectory, QUIT_PREFERENCES_FILE), JSON.stringify(next, null, 2));
    return next;
  }

  return { getPreferences, setPreferences };
}
