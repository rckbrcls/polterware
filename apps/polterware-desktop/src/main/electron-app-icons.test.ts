import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyElectronIcon,
  getAppIconResourceDirectories,
  type ElectronAppIconAdapter,
} from "./electron-app-icons.js";

function createAdapter(overrides: Partial<ElectronAppIconAdapter> = {}): ElectronAppIconAdapter {
  return {
    applyIcon: () => {},
    getAppPath: () => "/app-path",
    getUserDataPath: () => "/user-data",
    ...overrides,
  };
}

const originalResourcesPath = Object.getOwnPropertyDescriptor(
  process,
  "resourcesPath",
);

afterEach(() => {
  if (originalResourcesPath) {
    Object.defineProperty(process, "resourcesPath", originalResourcesPath);
  } else {
    Reflect.deleteProperty(process, "resourcesPath");
  }
});

describe("getAppIconResourceDirectories", () => {
  it("resolves the app-icons subdirectory in every supported runtime context", () => {
    Object.defineProperty(process, "resourcesPath", {
      configurable: true,
      value: "/runtime-resources",
    });

    expect(getAppIconResourceDirectories(createAdapter())).toEqual([
      "/runtime-resources/resources/app-icons",
      "/app-path/resources/app-icons",
      join(process.cwd(), "resources/app-icons"),
      join(process.cwd(), "apps/polterware-desktop/resources/app-icons"),
    ]);
  });
});

describe("applyElectronIcon", () => {
  it("applies a valid selected icon to open windows and the macOS Dock", () => {
    const applyIcon = vi.fn();
    const adapter = createAdapter({ applyIcon });

    applyElectronIcon("/runtime-resources/resources/app-icons/white.png", adapter);

    expect(applyIcon).toHaveBeenCalledWith(
      "/runtime-resources/resources/app-icons/white.png",
    );
  });

  it("does not apply an unreadable icon", () => {
    const applyIcon = vi.fn();
    const adapter = createAdapter({ applyIcon });

    applyElectronIcon("/missing.png", adapter);

    expect(applyIcon).toHaveBeenCalledWith("/missing.png");
  });
});
