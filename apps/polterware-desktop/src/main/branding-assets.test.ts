import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const desktopRoot = new URL("../../", import.meta.url);

describe("Polterware branding assets", () => {
  it("ships the main and alternate runtime app icons plus the macOS bundle icon source", () => {
    const appIconsDirectory = new URL("resources/app-icons/", desktopRoot);

    expect(readdirSync(appIconsDirectory).sort()).toEqual([
      "black.png",
      "main.png",
      "white.png",
    ]);
    expect(existsSync(new URL("resources/polterware.icon/icon.json", desktopRoot))).toBe(true);
  });

  it("ships contrast-aware logo marks for light and dark surfaces", () => {
    const logoDirectory = new URL("resources/logo/", desktopRoot);

    expect(readdirSync(logoDirectory).sort()).toEqual(["black.png", "white.png"]);
  });

  it("configures electron-builder to use the Polterware macOS icon bundle", () => {
    const builderConfig = readFileSync(
      new URL("electron-builder.yml", desktopRoot),
      "utf8",
    );

    expect(builderConfig).toContain("icon: resources/polterware.icon");
    expect(builderConfig).toContain("from: resources/app-icons");
    expect(builderConfig).not.toContain("purple.png");
  });

  it("uses the Solid renderer as the product entry", () => {
    const viteConfig = readFileSync(
      new URL("electron.vite.config.ts", desktopRoot),
      "utf8",
    );
    const rendererMain = new URL("src/renderer/main.tsx", desktopRoot);

    expect(viteConfig).toContain("src/renderer");
    expect(viteConfig).not.toContain("renderer-solid");
    expect(existsSync(rendererMain)).toBe(true);
  });
});
