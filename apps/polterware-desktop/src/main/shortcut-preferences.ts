import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { JsonValue } from "../shared/ipc.js";
import {
  SHORTCUT_PREFERENCES_FILE,
  decodeStoredShortcutPreferences,
  emptyShortcutPreferences,
  resolveGlobalCommanderAccelerator,
  type StoredShortcutOverrides,
  type StoredShortcutPreferences,
} from "../shared/shortcut-preferences.js";

export interface ShortcutPreferencesController {
  getPreferences(): StoredShortcutPreferences;
  setPreferences(overrides: StoredShortcutOverrides): StoredShortcutPreferences;
  getGlobalCommanderAccelerator(): string;
}

export interface ShortcutPreferencesControllerOptions {
  userDataDirectory: string;
  onGlobalAcceleratorChange?: (accelerator: string) => void;
}

function readPreferences(userDataDirectory: string): StoredShortcutPreferences {
  try {
    const path = join(userDataDirectory, SHORTCUT_PREFERENCES_FILE);
    if (!existsSync(path)) return emptyShortcutPreferences();
    const wireValue: JsonValue = JSON.parse(readFileSync(path, "utf8"));
    return decodeStoredShortcutPreferences(wireValue) ?? emptyShortcutPreferences();
  } catch {
    return emptyShortcutPreferences();
  }
}

function writePreferences(
  userDataDirectory: string,
  preferences: StoredShortcutPreferences,
): void {
  mkdirSync(userDataDirectory, { recursive: true });
  writeFileSync(
    join(userDataDirectory, SHORTCUT_PREFERENCES_FILE),
    JSON.stringify(preferences, null, 2),
  );
}

export function createShortcutPreferencesController({
  userDataDirectory,
  onGlobalAcceleratorChange,
}: ShortcutPreferencesControllerOptions): ShortcutPreferencesController {
  let cached = readPreferences(userDataDirectory);
  let lastAccelerator = resolveGlobalCommanderAccelerator(cached.overrides);

  function getPreferences(): StoredShortcutPreferences {
    cached = readPreferences(userDataDirectory);
    return {
      version: cached.version,
      overrides: { ...cached.overrides },
    };
  }

  function setPreferences(overrides: StoredShortcutOverrides): StoredShortcutPreferences {
    const next: StoredShortcutPreferences = {
      version: 1,
      overrides: { ...overrides },
    };
    writePreferences(userDataDirectory, next);
    cached = next;

    const accelerator = resolveGlobalCommanderAccelerator(next.overrides);
    if (accelerator !== lastAccelerator) {
      lastAccelerator = accelerator;
      onGlobalAcceleratorChange?.(accelerator);
    }

    return getPreferences();
  }

  function getGlobalCommanderAccelerator(): string {
    cached = readPreferences(userDataDirectory);
    lastAccelerator = resolveGlobalCommanderAccelerator(cached.overrides);
    return lastAccelerator;
  }

  return {
    getPreferences,
    setPreferences,
    getGlobalCommanderAccelerator,
  };
}
