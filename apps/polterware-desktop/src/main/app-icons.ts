import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
  APP_ICON_IDS,
  DEFAULT_APP_ICON_ID,
  type AppIconId,
  type AppIconOption,
  type AppIconSelection,
} from "../shared/app-icons.js";
import type { JsonObject, JsonValue } from "../shared/ipc.js";

const APP_ICON_PREFERENCES_FILE = "app-icon-preferences.json";
const APP_ICON_PREFERENCES_VERSION = 2;
const LEGACY_APP_ICON_PREFERENCE = "__legacy__";

interface StoredAppIconPreferences {
  selectedId?: string;
  version?: number;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && !Array.isArray(value) && Object(value) === value;
}

function decodeStoredAppIconPreferences(value: JsonValue): StoredAppIconPreferences | undefined {
  if (!isJsonObject(value)) return undefined;

  const versionValue = value.version;
  const selectedIdValue = value.selectedId;
  const version = Number(versionValue);
  if (versionValue !== version || !Number.isInteger(version)) return undefined;

  if (selectedIdValue == null) return { version };
  const selectedId = String(selectedIdValue);
  if (selectedIdValue !== selectedId) return undefined;
  return { selectedId, version };
}

interface RuntimeAppIconOption extends AppIconOption {
  filePath: string;
}

export interface AppIconController {
  applySelectedIcon(): void;
  getIcon(): AppIconSelection;
  getSelectedIconPath(): string;
  listIcons(): AppIconOption[];
  setIcon(id: string): AppIconSelection;
}

export interface AppIconControllerOptions {
  applyIcon?: (iconPath: string) => void;
  resourceDirectories: string[];
  userDataDirectory: string;
}

function toUniqueExistingDirectories(directories: string[]): string[] {
  const seen = new Set<string>();
  const existingDirectories: string[] = [];

  for (const directory of directories) {
    const resolved = resolve(directory);
    if (
      seen.has(resolved) ||
      !existsSync(resolved) ||
      !statSync(resolved).isDirectory()
    ) {
      continue;
    }

    seen.add(resolved);
    existingDirectories.push(resolved);
  }

  return existingDirectories;
}

const APP_ICON_LABELS = {
  main: "Polterware",
  black: "Black",
  white: "White",
} satisfies Record<AppIconId, string>;

function createPreviewDataUrl(filePath: string): string {
  const encoded = readFileSync(filePath).toString("base64");
  return `data:image/png;base64,${encoded}`;
}

function discoverRuntimeIcons(
  resourceDirectories: string[],
): RuntimeAppIconOption[] {
  const icons = new Map<string, RuntimeAppIconOption>();

  for (const directory of toUniqueExistingDirectories(resourceDirectories)) {
    for (const id of APP_ICON_IDS) {
      const fileName = `${id}.png`;
      const filePath = join(directory, fileName);
      if (
        !existsSync(filePath) ||
        !statSync(filePath).isFile() ||
        icons.has(id)
      ) {
        continue;
      }

      icons.set(id, {
        filePath,
        id,
        label: APP_ICON_LABELS[id],
        previewDataUrl: createPreviewDataUrl(filePath),
      });
    }
  }

  return APP_ICON_IDS.flatMap((id) => {
    const icon = icons.get(id);
    return icon ? [icon] : [];
  });
}

function toPublicIcon(icon: RuntimeAppIconOption): AppIconOption {
  return {
    id: icon.id,
    label: icon.label,
    previewDataUrl: icon.previewDataUrl,
  };
}

function readStoredIconId(userDataDirectory: string): string | undefined {
  try {
    const preferencesPath = join(userDataDirectory, APP_ICON_PREFERENCES_FILE);
    const wireValue: JsonValue = JSON.parse(readFileSync(preferencesPath, "utf8"));
    const parsed = decodeStoredAppIconPreferences(wireValue);
    if (!parsed) return LEGACY_APP_ICON_PREFERENCE;
    if (parsed.version !== APP_ICON_PREFERENCES_VERSION) {
      return LEGACY_APP_ICON_PREFERENCE;
    }
    return parsed.selectedId;
  } catch {
    return undefined;
  }
}

function writeStoredIconId(
  userDataDirectory: string,
  selectedId: string,
): void {
  mkdirSync(userDataDirectory, { recursive: true });
  writeFileSync(
    join(userDataDirectory, APP_ICON_PREFERENCES_FILE),
    JSON.stringify(
      { selectedId, version: APP_ICON_PREFERENCES_VERSION },
      null,
      2,
    ),
  );
}

function resolveSelectedIcon(
  icons: RuntimeAppIconOption[],
  storedId: string | undefined,
): RuntimeAppIconOption {
  const storedIcon = storedId
    ? icons.find((icon) => icon.id === storedId)
    : undefined;
  const defaultIcon = icons.find((icon) => icon.id === DEFAULT_APP_ICON_ID);
  const fallbackIcon = defaultIcon ?? icons[0];

  if (!fallbackIcon) {
    throw new Error("No app icons were found in resources.");
  }

  return storedIcon ?? fallbackIcon;
}

export function createAppIconController({
  applyIcon,
  resourceDirectories,
  userDataDirectory,
}: AppIconControllerOptions): AppIconController {
  function listRuntimeIcons(): RuntimeAppIconOption[] {
    return discoverRuntimeIcons(resourceDirectories);
  }

  function getRuntimeSelection(): RuntimeAppIconOption {
    const storedId = readStoredIconId(userDataDirectory);
    const icon = resolveSelectedIcon(listRuntimeIcons(), storedId);
    if (storedId !== undefined && storedId !== icon.id) {
      writeStoredIconId(userDataDirectory, icon.id);
    }
    return icon;
  }

  function getIcon(): AppIconSelection {
    const icon = getRuntimeSelection();
    return {
      defaultId: DEFAULT_APP_ICON_ID,
      icon: toPublicIcon(icon),
      selectedId: icon.id,
    };
  }

  function getSelectedIconPath(): string {
    return getRuntimeSelection().filePath;
  }

  function applySelectedIcon(): void {
    applyIcon?.(getSelectedIconPath());
  }

  function setIcon(id: string): AppIconSelection {
    const icon = listRuntimeIcons().find((item) => item.id === id);
    if (!icon) {
      throw new Error(`Unknown app icon: ${id}`);
    }

    writeStoredIconId(userDataDirectory, icon.id);
    applyIcon?.(icon.filePath);

    return {
      defaultId: DEFAULT_APP_ICON_ID,
      icon: toPublicIcon(icon),
      selectedId: icon.id,
    };
  }

  return {
    applySelectedIcon,
    getIcon,
    getSelectedIconPath,
    listIcons: () => listRuntimeIcons().map(toPublicIcon),
    setIcon,
  };
}
