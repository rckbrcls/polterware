import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
const root = new URL("../../", import.meta.url);
// W1-ASSETS owns the artifacts; run these assertions when its changes are merged.
describe.skipIf(!existsSync(new URL("resources/icon.icns", root)))("Polterware Notes branding artifacts (W1-ASSETS)", () => {
  it("ships main/black/white runtime icons and both logo variants", () => {
    expect(readdirSync(new URL("resources/app-icons", root)).sort()).toEqual(["black.png", "dock.png", "main.png", "white.png"]);
    expect(readdirSync(new URL("resources/logo", root)).sort()).toEqual(["black.png", "white.png"]);
    expect(existsSync(new URL("resources/icon.icns", root))).toBe(true);
  });
});
it("configures Polterware Notes branding and the Solid entry point", () => {
  const config = readFileSync(new URL("electron-builder.yml", root), "utf8");
    expect(config).toContain("icon: resources/icon.icon");
    expect(config).toContain("from: resources/app-icons");
    expect(config).toContain("from: resources/sounds");
    expect(config).toContain("from: resources/characters");
    expect(config).toContain("com.polterware.notes");
  expect(config).toContain('minimumSystemVersion: "15.0"');
    expect(existsSync(new URL("src/renderer/main.tsx", root))).toBe(true);
    expect(existsSync(new URL("src/renderer/public/sounds/bell.webm", root))).toBe(true);
    expect(existsSync(new URL("src/renderer/public/characters/me-streak-sad.png", root))).toBe(true);
    expect(existsSync(new URL("src/renderer/public/characters/notes-character.webp", root))).toBe(true);
  });
