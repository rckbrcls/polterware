import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppIconController } from "./app-icons.js";

const tempDirectories: string[] = [];

function createTempDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "polterware-app-icons-"));
  tempDirectories.push(directory);
  return directory;
}

function writeIcon(
  directory: string,
  fileName: string,
  content = fileName,
): void {
  writeFileSync(join(directory, fileName), content);
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("createAppIconController", () => {
  it("discovers the main icon before the black and white alternatives", () => {
    const resources = createTempDirectory();
    const userData = createTempDirectory();
    writeIcon(resources, "white.png", "white");
    writeIcon(resources, "black.png", "black");
    writeIcon(resources, "main.png", "main");
    writeIcon(resources, "purple.png", "purple");
    writeIcon(resources, "logo.png", "logo");
    writeIcon(resources, "notes.txt", "ignore");

    const controller = createAppIconController({
      resourceDirectories: [resources],
      userDataDirectory: userData,
    });

    expect(controller.listIcons()).toEqual([
      {
        id: "main",
        label: "Polterware",
        previewDataUrl: "data:image/png;base64,bWFpbg==",
      },
      {
        id: "black",
        label: "Black",
        previewDataUrl: "data:image/png;base64,YmxhY2s=",
      },
      {
        id: "white",
        label: "White",
        previewDataUrl: "data:image/png;base64,d2hpdGU=",
      },
    ]);
  });

  it("uses the Polterware icon as the default", () => {
    const resources = createTempDirectory();
    const userData = createTempDirectory();
    writeIcon(resources, "white.png", "white");
    writeIcon(resources, "black.png", "black");
    writeIcon(resources, "main.png", "main");

    const controller = createAppIconController({
      resourceDirectories: [resources],
      userDataDirectory: userData,
    });

    expect(controller.getIcon()).toMatchObject({
      defaultId: "main",
      selectedId: "main",
    });
    expect(controller.getSelectedIconPath()).toBe(join(resources, "main.png"));
  });

  it.each([
    "black",
    "white",
    "purple",
    "lime",
    "ocean",
    "esmerald",
    "red",
    "missing",
  ])(
    "migrates unversioned %s preferences to the main icon",
    (legacyId) => {
      const resources = createTempDirectory();
      const userData = createTempDirectory();
      writeIcon(resources, "black.png", "black");
      writeIcon(resources, "white.png", "white");
      writeIcon(resources, "main.png", "main");
      writeFileSync(
        join(userData, "app-icon-preferences.json"),
        JSON.stringify({ selectedId: legacyId }),
      );

      const controller = createAppIconController({
        resourceDirectories: [resources],
        userDataDirectory: userData,
      });

      expect(controller.getIcon().selectedId).toBe("main");
      expect(
        JSON.parse(
          readFileSync(join(userData, "app-icon-preferences.json"), "utf8"),
        ),
      ).toEqual({
        selectedId: "main",
        version: 2,
      });
    },
  );

  it("falls back to white when the default asset is missing", () => {
    const resources = createTempDirectory();
    const userData = createTempDirectory();
    writeIcon(resources, "white.png", "white");

    const controller = createAppIconController({
      resourceDirectories: [resources],
      userDataDirectory: userData,
    });

    expect(controller.getIcon().selectedId).toBe("white");
    expect(controller.getSelectedIconPath()).toBe(join(resources, "white.png"));
  });

  it("throws when no permitted app icon assets are available", () => {
    const resources = createTempDirectory();
    const userData = createTempDirectory();
    writeIcon(resources, "purple.png", "purple");

    const controller = createAppIconController({
      resourceDirectories: [resources],
      userDataDirectory: userData,
    });

    expect(() => controller.getIcon()).toThrow(
      "No app icons were found in resources.",
    );
  });

  it("persists a valid selected icon and applies it", () => {
    const resources = createTempDirectory();
    const userData = createTempDirectory();
    const applyIcon = vi.fn();
    writeIcon(resources, "black.png", "black");
    writeIcon(resources, "white.png", "white");
    writeIcon(resources, "main.png", "main");

    const controller = createAppIconController({
      applyIcon,
      resourceDirectories: [resources],
      userDataDirectory: userData,
    });

    expect(controller.setIcon("white").selectedId).toBe("white");
    expect(applyIcon).toHaveBeenCalledWith(join(resources, "white.png"));

    const restoredController = createAppIconController({
      resourceDirectories: [resources],
      userDataDirectory: userData,
    });

    expect(restoredController.getIcon().selectedId).toBe("white");
    expect(() => controller.setIcon("ocean")).toThrow(
      "Unknown app icon: ocean",
    );
  });
});
